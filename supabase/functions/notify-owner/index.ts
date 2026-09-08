// Supabase Database Webhook target: emails OWNER_EMAIL whenever someone
// subscribes. Subscribing happens directly between the browser and this
// Supabase project (see assets/js/subscribe.js) with no server code in the
// loop, so a Database Webhook on the `subscribers` table is the only
// reliable place to catch the event.
//
// One-time setup: see "Owner notifications" in the README.

function siteUrl(): string {
  return (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
}

async function sendEmail(to: string, subject: string, text: string) {
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
      text,
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
  const subject = `New subscriber: ${record.email}`;
  const text = `${record.email} just subscribed to ${siteUrl() || "the CAROW LER Working Papers mailing list"}.\n\n${new Date().toUTCString()}`;

  const ok = await sendEmail(ownerEmail, subject, text);
  if (!ok) {
    return new Response("email send failed", { status: 502 });
  }

  return new Response("ok", { status: 200 });
});
