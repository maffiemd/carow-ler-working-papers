// Runs as the last step of .github/workflows/publish-submission.yml: emails
// every author on an accepted submission once their paper is live on the
// site. Separate from scripts/send-paper-notification.js, which emails the
// mailing list, not the author directly.
//
// Required env vars:
//   AUTHORS_JSON      JSON array of {name, affiliation, email} - only
//                      entries with a non-empty email are sent to
//   TITLE
//   WP_NUMBER
//   SLUG              e.g. "2026-03-lastname-topic"
//   SERIES_PREFIX      e.g. "CAROW-LER-WP"
//   SITE_URL           e.g. "https://workingpapers.ilr.cornell.edu"
//   RESEND_API_KEY
//   FROM_EMAIL
// Optional:
//   REPLY_TO          comma-separated for several addresses
//   STAGING_EMAIL     if set, every author email is redirected here instead
//                      (subject tagged with the real intended recipient) -
//                      see "Staging mode" in the README

const { Resend } = require("resend");

// Same palette and layout as the subscriber notification in
// scripts/send-paper-notification.js, so both emails read as one series.
const COLOR_RED_DARK = "#8C1515";
const COLOR_INK = "#222222";
const COLOR_MUTED = "#5b5b5b";
const COLOR_BORDER = "#e0e0e0";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderEmailHtml({ authorName, title, wpLabel, paperUrl, siteUrl, seriesName }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:${COLOR_INK};">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <p style="color:${COLOR_MUTED};font-size:0.85rem;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.03em;">Your paper is published &middot; ${escapeHtml(wpLabel)}</p>
      <h1 style="font-size:1.4rem;margin:0 0 8px;">${escapeHtml(title)}</h1>
      <p style="margin:20px 0 0;line-height:1.6;">Dear ${escapeHtml(authorName)},</p>
      <p style="margin:16px 0 0;line-height:1.6;">
        Congratulations! Your paper is now live as <a href="${paperUrl}" style="color:${COLOR_RED_DARK};">${escapeHtml(wpLabel)}</a>. We've also announced it to the series mailing list, so subscribers will see it shortly. Please feel free to share the link with colleagues or post it on your own site. If you spot a problem with the paper page or the PDF, just reply to this email.
      </p>
      <p style="margin-top:24px;line-height:1.6;">Thank you for submitting to the series.</p>
      <p style="margin:0;line-height:1.6;">Best,<br>Kourtney Koebel and Michael Maffie<br>Editors, ${escapeHtml(seriesName)}</p>
      <hr style="margin:32px 0;border:none;border-top:1px solid ${COLOR_BORDER};">
      <p style="color:${COLOR_MUTED};font-size:0.8rem;">
        You're receiving this because you submitted a paper to ${escapeHtml(seriesName)}.
        <a href="${siteUrl}" style="color:${COLOR_MUTED};">${escapeHtml(siteUrl.replace(/^https?:\/\//, ""))}</a>
      </p>
    </div>
  </body>
</html>`;
}

async function main() {
  const authors = JSON.parse(process.env.AUTHORS_JSON || "[]").filter((a) => a.email);
  if (authors.length === 0) {
    console.log("No author email addresses on this submission - nothing to send.");
    return;
  }

  const title = requireEnv("TITLE");
  const wpNumber = requireEnv("WP_NUMBER");
  const seriesPrefix = requireEnv("SERIES_PREFIX");
  const slug = requireEnv("SLUG");
  const siteUrl = requireEnv("SITE_URL").replace(/\/$/, "");
  const fromEmail = requireEnv("FROM_EMAIL");
  const replyTo = (process.env.REPLY_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  const stagingEmail = process.env.STAGING_EMAIL;

  const resend = new Resend(requireEnv("RESEND_API_KEY"));
  const wpLabel = `${seriesPrefix}-${wpNumber}`;
  const paperUrl = `${siteUrl}/papers/${slug}/`;
  const subject = `Your paper is published: ${title}`;
  const text = `Congratulations! Your paper is now live as ${wpLabel} (${paperUrl}). We've also announced it to the series mailing list, so subscribers will see it shortly. Please feel free to share the link with colleagues or post it on your own site. If you spot a problem with the paper page or the PDF, just reply to this email.

Thank you for submitting to the series.

Best,
Kourtney Koebel and Michael Maffie
Editors, CAROW LER Working Papers
${siteUrl}`;

  const emails = authors.map((author) => ({
    from: fromEmail,
    to: stagingEmail || author.email,
    ...(replyTo.length > 0 && { reply_to: replyTo }),
    subject: stagingEmail ? `[STAGING, would go to ${author.email}] ${subject}` : subject,
    html: renderEmailHtml({
      authorName: author.name,
      title,
      wpLabel,
      paperUrl,
      siteUrl,
      seriesName: "CAROW LER Working Papers",
    }),
    text: `Dear ${author.name},\n\n${text}`,
  }));

  const { error } = await resend.batch.send(emails);
  if (error) {
    throw new Error(`Resend batch send failed: ${JSON.stringify(error)}`);
  }
  if (stagingEmail) {
    console.log(`STAGING_EMAIL set - redirected ${authors.length} author email(s) to ${stagingEmail}.`);
  } else {
    console.log(`Notified ${authors.length} author(s) about ${wpLabel}.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
