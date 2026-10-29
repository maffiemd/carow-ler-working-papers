// Runs inside .github/workflows/build-cover-sheet.yml, triggered by the
// build-cover-sheet Supabase Edge Function (via repository_dispatch) when
// an editor clicks "Build cover sheet" in the dashboard - the first of the
// two steps that make up publishing a submission now that the final PDF
// has to live in Cornell Box rather than this GitHub repo (Cornell IT
// requirement: every link on the public site must point at Box). Builds
// the same CAROW cover sheet scripts/publish-submission.js used to build
// inline, but instead of committing the merged PDF, emails it to the
// editor so they can upload it to Box and paste the resulting link into
// "Accept & Publish".
//
// Required env vars:
//   SLUG            e.g. "2026-03-lastname-topic" (used only to name the
//                   attached file)
//   WP_NUMBER       e.g. "2026-03"
//   TITLE
//   AUTHORS_JSON    JSON array of {name, affiliation, email}
//   MANUSCRIPT_PATH local path to the already-downloaded manuscript PDF
//   EDITOR_EMAIL    the signed-in editor who clicked "Build cover sheet"
//   RESEND_API_KEY
//   FROM_EMAIL
// Optional:
//   STAGING_EMAIL   if set, redirects the send here instead of the editor
//                   (subject tagged with the real intended recipient)

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { Resend } = require("resend");
const { buildCoverPageBytes, prependCoverPage } = require("./generate-cover-sheet");

const REPO_ROOT = path.join(__dirname, "..");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// TITLE comes from an anonymous author's Box submission-form entry, so
// it's untrusted - this email is HTML, and an unescaped title could break
// out of the <strong> tag it's placed in.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  const slug = requireEnv("SLUG");
  const wpNumber = requireEnv("WP_NUMBER");
  const title = requireEnv("TITLE");
  const manuscriptPath = requireEnv("MANUSCRIPT_PATH");
  const editorEmail = requireEnv("EDITOR_EMAIL");
  const fromEmail = requireEnv("FROM_EMAIL");
  const stagingEmail = process.env.STAGING_EMAIL;
  const authorsRaw = JSON.parse(process.env.AUTHORS_JSON || "[]");
  const authors = authorsRaw.map((a) => ({ name: a.name, affiliation: a.affiliation || "" }));

  const config = yaml.load(fs.readFileSync(path.join(REPO_ROOT, "_config.yml"), "utf8"));
  const wpLabel = `${config.series_prefix}-${wpNumber}`;
  const dateText = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" });

  const coverBytes = await buildCoverPageBytes({
    title,
    authors,
    wpLabel,
    dateText,
    shortTitle: config.short_title,
    carowName: config.carow.name,
    parentName: config.carow.parent,
  });
  const mergedBytes = await prependCoverPage(coverBytes, manuscriptPath);

  const resend = new Resend(requireEnv("RESEND_API_KEY"));
  const to = stagingEmail || editorEmail;
  const safeTitle = escapeHtml(title);
  const subject = stagingEmail
    ? `[STAGING, would go to ${editorEmail}] Cover sheet ready: ${wpLabel}`
    : `Cover sheet ready: ${wpLabel}`;

  const { error } = await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    html: `<p>The cover-sheeted PDF for <strong>${safeTitle}</strong> (${wpLabel}) is attached.</p>
<p>Upload it to the series' published-papers Box folder, set its sharing to "Anyone with the link can view," then paste that link into <strong>Accept &amp; Publish</strong> for this submission to finish publishing it.</p>`,
    text: `The cover-sheeted PDF for "${title}" (${wpLabel}) is attached.\n\nUpload it to the series' published-papers Box folder, set its sharing to "Anyone with the link can view," then paste that link into Accept & Publish for this submission to finish publishing it.`,
    attachments: [{ filename: `${slug}.pdf`, content: Buffer.from(mergedBytes).toString("base64") }],
  });
  if (error) {
    throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  }
  console.log(
    stagingEmail
      ? `STAGING_EMAIL set - redirected the cover sheet for ${wpLabel} to ${stagingEmail}.`
      : `Emailed the cover sheet for ${wpLabel} to ${editorEmail}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
