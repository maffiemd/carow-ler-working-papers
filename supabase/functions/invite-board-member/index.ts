// Called by the editorial dashboard's "invite an editorial board member"
// dialog (assets/js/dashboard.js, via supabase.functions.invoke), which
// opens after an editor reassigns a submission to someone other than the
// two series editors. Deployed WITH JWT verification on (the default), so
// only a signed-in editor reaches it, and the Supabase client is built
// from that caller's token so every read/storage access still goes
// through the RLS policies in supabase/schema.sql.
//
// Emails the drafted message an editor wrote/edited in the dialog to the
// named board member, with the submission's manuscript attached. The
// caller only ever supplies a NAME (from the "Assigned to" dropdown,
// itself sourced from _config.yml, a public file) -- never an email
// address. The email itself is resolved here, server-side, from the
// `board_members` table, specifically so it's never exposed to the
// browser or the public git repo. Changes nothing on the submission;
// this is a pure notification, same spirit as email-authors. Two safety
// valves:
//   - preview: true  -> sends only to the signed-in editor's own address
//                       and never touches board_members or the manuscript.
//   - STAGING_EMAIL  -> (Supabase secret, separate from the GitHub variable
//                       of the same name) redirects the real send to that
//                       address instead of the board member.
//
// Required secrets: RESEND_API_KEY, NOTIFY_FROM_EMAIL (set up for notify-owner).
// Optional: REPLY_TO (comma-separated), SITE_URL, STAGING_EMAIL.

import { createClient } from "npm:@supabase/supabase-js@2";
import { Buffer } from "node:buffer";
import {
  normalizeBody,
  renderLetterHtml,
  sanitizeSubject,
  splitList,
} from "../reject-submission/letter.ts";

const SERIES_NAME = "CAROW LER Working Papers";
const MAX_BODY_CHARS = 10000;

// Called directly from the browser, so it must answer the CORS preflight
// and echo these headers on every response (same reason as the other
// dashboard-facing functions).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function response(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, { ...init, headers: { ...CORS_HEADERS, ...init.headers } });
}

function json(data: unknown, status = 200): Response {
  return response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return response("Unauthorized", { status: 401 });
  }
  const editorEmail = userData.user.email;

  let payload: {
    submission_id?: string;
    assignee_name?: string;
    subject?: string;
    body?: string;
    preview?: boolean;
  };
  try {
    payload = await req.json();
  } catch {
    return response("Invalid JSON body", { status: 400 });
  }

  const subject = sanitizeSubject(payload.subject ?? "");
  const body = normalizeBody(payload.body ?? "");
  const preview = payload.preview === true;
  const assigneeName = String(payload.assignee_name ?? "").trim();
  if (!payload.submission_id) return response("Missing submission_id", { status: 400 });
  if (!preview && !assigneeName) return response("Missing assignee_name", { status: 400 });
  if (!subject) return response("Missing subject", { status: 400 });
  if (!body) return response("The message is empty", { status: 400 });
  if (body.length > MAX_BODY_CHARS) return response("The message is too long", { status: 400 });

  const { data: submission, error: fetchError } = await supabase
    .from("submissions")
    .select("id, title, manuscript_path, manuscript_box_url")
    .eq("id", payload.submission_id)
    .single();
  if (fetchError || !submission) return response("Submission not found", { status: 404 });

  const stagingEmail = (Deno.env.get("STAGING_EMAIL") ?? "").trim();

  let to: string[];
  let finalSubject = subject;
  if (preview) {
    if (!editorEmail) return response("Your account has no email address to send a preview to", { status: 400 });
    to = [editorEmail];
    finalSubject = `[PREVIEW] ${subject}`;
  } else {
    const { data: boardMember, error: boardError } = await supabase
      .from("board_members")
      .select("email")
      .eq("name", assigneeName)
      .maybeSingle();
    if (boardError) return response(`Couldn't look up ${assigneeName}: ${boardError.message}`, { status: 500 });
    if (!boardMember) {
      return response(
        `No email on file for "${assigneeName}" in board_members - add them in the Supabase Table Editor first.`,
        { status: 404 },
      );
    }
    if (stagingEmail) {
      to = [stagingEmail];
      finalSubject = `[STAGING, would go to ${boardMember.email}] ${subject}`;
    } else {
      to = [boardMember.email];
    }
  }

  // Manuscripts now live in Box: link to it rather than attaching, so a
  // large PDF never risks hitting Resend's attachment size limit. Only a
  // submission stored before the Box migration (manuscript_path set,
  // manuscript_box_url unset) still gets the old download-and-attach
  // treatment.
  const attachments: { filename: string; content: string }[] = [];
  let finalBody = body;
  if (submission.manuscript_box_url) {
    finalBody = `${body}\n\nManuscript: ${submission.manuscript_box_url}`;
  } else if (submission.manuscript_path) {
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("manuscripts")
      .download(submission.manuscript_path);
    if (downloadError) {
      return response(`Couldn't attach the manuscript: ${downloadError.message}`, { status: 500 });
    }
    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const filename = submission.manuscript_path.replace(/^\d+-/, "");
    attachments.push({ filename, content: Buffer.from(bytes).toString("base64") });
  }

  const replyTo = splitList(Deno.env.get("REPLY_TO"));
  const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  const sendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("NOTIFY_FROM_EMAIL"),
      to,
      subject: finalSubject,
      html: renderLetterHtml({ title: submission.title, body: finalBody, siteUrl, seriesName: SERIES_NAME }),
      text: finalBody,
      ...(replyTo.length > 0 ? { reply_to: replyTo } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    }),
  });
  if (!sendRes.ok) {
    return response(`Email send failed (${sendRes.status}): ${await sendRes.text()}`, { status: 502 });
  }

  return json({
    ok: true,
    preview,
    emailed: to.length,
    to,
    attached: attachments.length > 0,
    staging: !preview && Boolean(stagingEmail),
  });
});
