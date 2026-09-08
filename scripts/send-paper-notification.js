// Emails subscribers whenever a new working paper is added under _papers/.
//
// Unlike a blog post, a working paper's front matter already has everything
// worth putting in the email (title, authors, abstract, PDF link) — there's
// no rendered article body to scrape, so this reads the source Markdown
// file's front matter directly instead of building the Jekyll site first.
//
// Required env vars:
//   PAPER_FILES                 comma-separated paths to _papers/*.md files to send (relative to repo root)
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   server-side key with SELECT access - never expose this in the site's JS
//   RESEND_API_KEY
//   FROM_EMAIL                  e.g. "CAROW LER Working Papers <papers@yourdomain.com>"
//   SITE_URL                    e.g. "https://maffiemd.github.io/carow-ler-working-papers"
// Optional:
//   TEST_EMAIL                  if set, sends only to this address instead of querying Supabase
//   REPLY_TO                    address replies should go to (the sending domain can't receive mail)
//   SERIES_PREFIX                e.g. "CAROW-LER-WP" (used in the subject line); falls back to wp_number alone

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const RESEND_BATCH_LIMIT = 100;

// Mirrors assets/css/main.css's palette (--carow-red, --carow-red-dark, --ink,
// --muted, --border, --bg-alt) - email clients need inline styles, so this
// can't reference the stylesheet directly.
const COLOR_RED = "#B31B1B";
const COLOR_RED_DARK = "#8C1515";
const COLOR_INK = "#222222";
const COLOR_MUTED = "#5b5b5b";
const COLOR_BORDER = "#e0e0e0";
const COLOR_BG_ALT = "#f7f5f2";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Mirrors _config.yml's collection permalink (`/papers/:path/`) against a
// _papers/<slug>.md filename.
function paperUrlPath(paperFilePath) {
  const slug = path.basename(paperFilePath, path.extname(paperFilePath));
  return `/papers/${slug}/`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function authorNames(authors) {
  return (authors || []).map((author) => author.name).join(", ");
}

function renderEmailText({ wpLabel, title, authorLine, abstract, paperLink, pdfLink, unsubscribeLink }) {
  return `New working paper: ${wpLabel}
${title}
${authorLine}

${abstract || ""}

Read the abstract: ${paperLink}
${pdfLink ? `Download the PDF: ${pdfLink}\n` : ""}
---
You're receiving this because you subscribed to CAROW LER Working Papers.
Unsubscribe: ${unsubscribeLink}
`;
}

function renderEmailHtml({ wpLabel, title, authorLine, abstract, paperLink, pdfLink, unsubscribeLink }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:${COLOR_INK};">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <p style="color:${COLOR_MUTED};font-size:0.85rem;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.03em;">New working paper &middot; ${escapeHtml(wpLabel)}</p>
      <h1 style="font-size:1.4rem;margin:0 0 8px;">${escapeHtml(title)}</h1>
      <p style="color:${COLOR_MUTED};font-size:0.95rem;margin:0 0 20px;">${escapeHtml(authorLine)}</p>
      ${abstract ? `<div style="background:${COLOR_BG_ALT};padding:16px 20px;border-radius:4px;font-size:1rem;line-height:1.6;">${escapeHtml(abstract)}</div>` : ""}
      <p style="margin-top:24px;">
        <a href="${paperLink}" style="display:inline-block;background:${COLOR_RED};color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;font-weight:600;">Read the abstract</a>
        ${pdfLink ? `&nbsp; <a href="${pdfLink}" style="color:${COLOR_RED_DARK};">Download the PDF</a>` : ""}
      </p>
      <hr style="margin:32px 0;border:none;border-top:1px solid ${COLOR_BORDER};">
      <p style="color:${COLOR_MUTED};font-size:0.8rem;">
        You're receiving this because you subscribed to CAROW LER Working Papers.
        <a href="${unsubscribeLink}" style="color:${COLOR_MUTED};">Unsubscribe</a>
      </p>
    </div>
  </body>
</html>`;
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function getRecipients(supabase) {
  const testEmail = process.env.TEST_EMAIL;
  if (testEmail) {
    console.log(`TEST_EMAIL set - sending only to ${testEmail}`);
    return [{ email: testEmail, unsubscribe_token: "test" }];
  }

  const { data, error } = await supabase
    .from("subscribers")
    .select("email, unsubscribe_token")
    .eq("subscribed", true);

  if (error) {
    throw new Error(`Failed to fetch subscribers from Supabase: ${error.message}`);
  }
  return data;
}

async function sendPaper(paperFilePath, recipients, { resend, siteUrl, seriesPrefix, fromEmail, replyTo }) {
  const { data: frontMatter } = matter(fs.readFileSync(paperFilePath, "utf8"));
  const title = frontMatter.title || path.basename(paperFilePath);
  const authorLine = authorNames(frontMatter.authors);
  const abstract = (frontMatter.abstract || "").trim();
  const wpLabel = seriesPrefix ? `${seriesPrefix}-${frontMatter.wp_number}` : String(frontMatter.wp_number || "");

  const urlPath = paperUrlPath(paperFilePath);
  const paperLink = siteUrl + urlPath;
  const pdfLink = frontMatter.pdf_path ? siteUrl.replace(/\/$/, "") + frontMatter.pdf_path : null;

  const subject = `New working paper: ${title}`;

  const emails = recipients.map((recipient) => {
    const unsubscribeLink = `${siteUrl}/unsubscribe/?token=${recipient.unsubscribe_token}`;
    return {
      from: fromEmail,
      to: recipient.email,
      ...(replyTo && { reply_to: replyTo }),
      subject,
      html: renderEmailHtml({ wpLabel, title, authorLine, abstract, paperLink, pdfLink, unsubscribeLink }),
      text: renderEmailText({ wpLabel, title, authorLine, abstract, paperLink, pdfLink, unsubscribeLink }),
      headers: {
        "List-Unsubscribe": `<${unsubscribeLink}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  });

  for (const batch of chunk(emails, RESEND_BATCH_LIMIT)) {
    const { error } = await resend.batch.send(batch);
    if (error) {
      throw new Error(`Resend batch send failed: ${JSON.stringify(error)}`);
    }
  }

  console.log(`Sent "${title}" to ${recipients.length} subscriber(s).`);
}

async function main() {
  const paperFiles = requireEnv("PAPER_FILES")
    .split(",")
    .map((file) => file.trim())
    .filter(Boolean);

  if (paperFiles.length === 0) {
    console.log("No new paper files to send.");
    return;
  }

  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const resend = new Resend(requireEnv("RESEND_API_KEY"));
  const siteUrl = requireEnv("SITE_URL").replace(/\/$/, "");
  const fromEmail = requireEnv("FROM_EMAIL");
  const replyTo = process.env.REPLY_TO;
  const seriesPrefix = process.env.SERIES_PREFIX;

  const recipients = await getRecipients(supabase);
  if (recipients.length === 0) {
    console.log("No subscribers to send to.");
    return;
  }

  for (const paperFile of paperFiles) {
    await sendPaper(paperFile, recipients, { resend, siteUrl, seriesPrefix, fromEmail, replyTo });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
