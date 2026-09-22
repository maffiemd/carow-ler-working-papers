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
//   SITE_URL           e.g. "https://maffiemd.github.io/carow-ler-working-papers"
//   RESEND_API_KEY
//   FROM_EMAIL
// Optional:
//   REPLY_TO

const { Resend } = require("resend");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
  const replyTo = process.env.REPLY_TO;

  const resend = new Resend(requireEnv("RESEND_API_KEY"));
  const wpLabel = `${seriesPrefix}-${wpNumber}`;
  const paperUrl = `${siteUrl}/papers/${slug}/`;
  const subject = `Your paper is published: ${title}`;
  const text = `Good news - "${title}" is now live as ${wpLabel}:

${paperUrl}

Thank you for submitting to the series.`;

  const emails = authors.map((author) => ({
    from: fromEmail,
    to: author.email,
    ...(replyTo && { reply_to: replyTo }),
    subject,
    text: `Dear ${author.name},\n\n${text}`,
  }));

  const { error } = await resend.batch.send(emails);
  if (error) {
    throw new Error(`Resend batch send failed: ${JSON.stringify(error)}`);
  }
  console.log(`Notified ${authors.length} author(s) about ${wpLabel}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
