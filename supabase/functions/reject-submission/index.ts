// Called by the editorial dashboard's "Reject & notify" dialog
// (assets/js/dashboard.js, via supabase.functions.invoke). Deployed WITH
// JWT verification on (the default), so only a signed-in editor reaches it,
// and the Supabase client is built from that caller's token so every
// read/write still goes through the RLS policies in supabase/schema.sql.
//
// Emails the rejection letter an editor wrote/edited in the dialog to the
// author addresses already stored on the submission, then marks it
// `rejected` and keeps a copy of the letter. The caller never supplies a
// recipient. Two safety valves:
//   - preview: true  -> sends only to the signed-in editor's own address
//                       and changes nothing on the submission.
//   - STAGING_EMAIL  -> (Supabase secret, separate from the GitHub variable
//                       of the same name) redirects the real send to that
//                       address instead of the authors.
//
// Required secrets: RESEND_API_KEY, NOTIFY_FROM_EMAIL (set up for notify-owner).
// Optional: REPLY_TO (comma-separated), SITE_URL, STAGING_EMAIL.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  normalizeBody,
  parseRecipients,
  renderLetterHtml,
  sanitizeSubject,
  splitList,
} from "./letter.ts";

const SERIES_NAME = "CAROW LER Working Papers";
const MAX_BODY_CHARS = 10000;

// Called directly from the browser, so it must answer the CORS preflight
// and echo these headers on every response (same reason as
// publish-submission).
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
    return response("This paper is already published and can't be rejected here", { status: 409 });
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
      }),
    });
    if (!sendRes.ok) {
      // Nothing is marked rejected unless the email actually went out.
      return response(`Email send failed (${sendRes.status}): ${await sendRes.text()}`, { status: 502 });
    }
  }

  if (!preview) {
    const { error: updateError } = await supabase
      .from("submissions")
      .update({ status: "rejected", rejection_letter: body, updated_at: new Date().toISOString() })
      .eq("id", submission.id);
    if (updateError) {
      return response(
        `The email was sent, but saving the rejection failed: ${updateError.message}`,
        { status: 500 },
      );
    }
  }

  return json({
    ok: true,
    preview,
    emailed: to.length,
    to,
    staging: !preview && authorEmails.length > 0 && Boolean(stagingEmail),
  });
});
