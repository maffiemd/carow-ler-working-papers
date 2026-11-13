// Shared by reject-submission and request-revisions - the dashboard's
// "Reject & notify" and "Request revisions" dialogs are the same shape
// (an editor writes/edits a letter, it's emailed to the submission's
// authors, and the submission is updated to record the decision), differing
// only in which status/column they write and what "already published"
// should say. See those two functions' index.ts for what's specific to
// each.
//
// Deployed WITH JWT verification on (the default - no --no-verify-jwt), so
// only a request carrying a signed-in editor's session token reaches this
// code at all. The Supabase client built here is from that same caller's
// token (not the service role), so every read/write still goes through the
// `submissions` RLS policies in supabase/schema.sql rather than bypassing
// them.
//
// Required secrets: RESEND_API_KEY, NOTIFY_FROM_EMAIL (set up for notify-owner).
// Optional: REPLY_TO (comma-separated), SITE_URL, STAGING_EMAIL,
// EDITOR_CC_EMAILS (comma-separated editor addresses CC'd on the real send -
// skipped for preview/staging, which don't reach the authors anyway).

import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizeBody, parseRecipients, renderLetterHtml, sanitizeSubject, splitList } from "./letter.ts";

const SERIES_NAME = "CAROW LER Working Papers";
const MAX_BODY_CHARS = 10000;

// Called directly from the browser, so every response must answer the CORS
// preflight and echo these headers.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function response(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, { ...init, headers: { ...CORS_HEADERS, ...init.headers } });
}

function json(data: unknown, status = 200): Response {
  return response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export interface LetterRequestOptions {
  // The submission.status value to set once the letter is sent (or, with no
  // author email on file, once the decision is recorded without sending).
  statusValue: string;
  // The submission column the letter body is saved to (e.g.
  // "rejection_letter", "revision_letter").
  letterColumn: string;
  // Shown instead of sending/saving anything if the submission is already
  // published.
  alreadyPublishedMessage: string;
}

export async function handleLetterRequest(req: Request, options: LetterRequestOptions): Promise<Response> {
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

  let payload: { submission_id?: string; subject?: string; body?: string; preview?: boolean };
  try {
    payload = await req.json();
  } catch {
    return response("Invalid JSON body", { status: 400 });
  }

  const subject = sanitizeSubject(payload.subject ?? "");
  const body = normalizeBody(payload.body ?? "");
  const preview = payload.preview === true;
  if (!payload.submission_id) return response("Missing submission_id", { status: 400 });
  if (!subject) return response("Missing subject", { status: 400 });
  if (!body) return response("The letter is empty", { status: 400 });
  if (body.length > MAX_BODY_CHARS) return response("The letter is too long", { status: 400 });

  const { data: submission, error: fetchError } = await supabase
    .from("submissions")
    .select("id, title, authors, status")
    .eq("id", payload.submission_id)
    .single();
  if (fetchError || !submission) return response("Submission not found", { status: 404 });
  if (submission.status === "published") {
    return response(options.alreadyPublishedMessage, { status: 409 });
  }

  const authorEmails = parseRecipients(submission.authors);
  const stagingEmail = (Deno.env.get("STAGING_EMAIL") ?? "").trim();

  let to: string[];
  let finalSubject = subject;
  if (preview) {
    if (!editorEmail) return response("Your account has no email address to send a preview to", { status: 400 });
    to = [editorEmail];
    finalSubject = `[PREVIEW] ${subject}`;
  } else if (authorEmails.length === 0) {
    to = [];
  } else if (stagingEmail) {
    to = [stagingEmail];
    finalSubject = `[STAGING, would go to ${authorEmails.join(", ")}] ${subject}`;
  } else {
    to = authorEmails;
  }

  if (to.length > 0) {
    const replyTo = splitList(Deno.env.get("REPLY_TO"));
    const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
    // Only CC the editors on a real send to the authors - preview already
    // goes to the signed-in editor only, and staging redirects to a test
    // address, so CC'ing here too would leak a real email in both cases.
    const editorCc = !preview && !stagingEmail ? splitList(Deno.env.get("EDITOR_CC_EMAILS")) : [];
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
        html: renderLetterHtml({ title: submission.title, body, siteUrl, seriesName: SERIES_NAME }),
        text: body,
        ...(replyTo.length > 0 ? { reply_to: replyTo } : {}),
        ...(editorCc.length > 0 ? { cc: editorCc } : {}),
      }),
    });
    if (!sendRes.ok) {
      // Nothing is updated on the submission unless the email actually went out.
      return response(`Email send failed (${sendRes.status}): ${await sendRes.text()}`, { status: 502 });
    }
  }

  if (!preview) {
    const { error: updateError } = await supabase
      .from("submissions")
      .update({ status: options.statusValue, [options.letterColumn]: body, updated_at: new Date().toISOString() })
      .eq("id", submission.id);
    if (updateError) {
      return response(`The email was sent, but saving the decision failed: ${updateError.message}`, { status: 500 });
    }
  }

  return json({
    ok: true,
    preview,
    emailed: to.length,
    to,
    staging: !preview && authorEmails.length > 0 && Boolean(stagingEmail),
  });
}
