// Supabase Database Webhook target: emails OWNER_EMAIL and sends a welcome
// email to the new subscriber whenever someone subscribes. Subscribing
// happens directly between the browser and this Supabase project (see
// assets/js/subscribe.js) with no server code in the loop, so a Database
// Webhook on the `subscribers` table is the only reliable place to catch
// the event.
//
// The welcome email's copy lives in ./welcome-email.ts - edit that file to
// change what a new subscriber sees.
//
// One-time setup: see "Owner notifications" in the README.

import { WELCOME_EMAIL_SUBJECT } from "./welcome-email.ts";
import { renderWelcomeEmailHtml } from "./render-welcome-email.ts";

function siteUrl(): string {
  return (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
}

async function sendEmail(
  to: string,
  subject: string,
  body: { text?: string; html?: string },
  replyTo?: string,
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("NOTIFY_FROM_EMAIL"),
      to,
      subject,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...body,
    }),
  });

  if (!res.ok) {
    console.error(`Resend send to ${to} failed:`, await res.text());
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { table, type, record } = await req.json();

  if (table !== "subscribers" || type !== "INSERT") {
    // Some other event (e.g. a future column update) - not our concern.
    return new Response("ignored", { status: 200 });
  }

  const ownerEmail = Deno.env.get("OWNER_EMAIL")!;
  const ownerSubject = `New subscriber: ${record.email}`;
  const ownerText = `${record.email} just subscribed to ${siteUrl() || "the CAROW LER Working Papers mailing list"}.\n\n${new Date().toUTCString()}`;

  const unsubscribeLink = `${siteUrl()}/unsubscribe/?token=${record.unsubscribe_token}`;

  const replyTo = Deno.env.get("REPLY_TO");

  const results = await Promise.all([
    sendEmail(ownerEmail, ownerSubject, { text: ownerText }),
    sendEmail(
      record.email,
      WELCOME_EMAIL_SUBJECT,
      { html: renderWelcomeEmailHtml(siteUrl(), unsubscribeLink) },
      replyTo,
    ),
  ]);

  if (results.some((ok) => !ok)) {
    return new Response("email send failed", { status: 502 });
  }

  return new Response("ok", { status: 200 });
});
