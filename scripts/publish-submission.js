// Runs inside .github/workflows/publish-submission.yml, triggered by the
// publish-submission Supabase Edge Function (via repository_dispatch) when
// an editor clicks "Accept & Publish" in the dashboard.
//
// Writes the _papers/<slug>.md front matter file from the dispatch payload,
// then builds the cover sheet and merges it onto the downloaded manuscript
// using the exact same generate-cover-sheet.js logic the manual CLI publish
// path (scripts/publish-paper.js) already uses - the only difference is
// the front matter file is created here instead of hand-written first.
//
// Required env vars (set by the workflow from the dispatch payload):
//   SLUG            e.g. "2026-03-lastname-topic"
//   WP_NUMBER       e.g. "2026-03"
//   TITLE
//   AUTHORS_JSON    JSON array of {name, affiliation, email} - email is
//                   dropped before writing, since the published front
//                   matter shouldn't carry personal contact info
//   ABSTRACT        may be empty
//   MANUSCRIPT_PATH local path to the already-downloaded manuscript PDF

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { buildCoverPageBytes, prependCoverPage } = require("./generate-cover-sheet");

const REPO_ROOT = path.join(__dirname, "..");

function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const slug = requireEnv("SLUG");
  const wpNumber = requireEnv("WP_NUMBER");
  const title = requireEnv("TITLE");
  const manuscriptPath = requireEnv("MANUSCRIPT_PATH");
  const abstract = process.env.ABSTRACT || "";
  const authorsRaw = JSON.parse(process.env.AUTHORS_JSON || "[]");
  const authors = authorsRaw.map((a) => ({ name: a.name, affiliation: a.affiliation || "" }));

  const config = yaml.load(fs.readFileSync(path.join(REPO_ROOT, "_config.yml"), "utf8"));
  const pdfPath = `/pdfs/${slug}.pdf`;

  const frontMatter = {
    wp_number: wpNumber,
    title,
    date: new Date().toISOString().slice(0, 10),
    authors,
    status: "working",
    abstract,
    pdf_path: pdfPath,
  };
  const papersMdPath = path.join(REPO_ROOT, "_papers", `${slug}.md`);
  fs.writeFileSync(papersMdPath, `---\n${yaml.dump(frontMatter)}---\n`);
  console.log(`Wrote ${papersMdPath}`);

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

  const outputPath = path.join(REPO_ROOT, pdfPath.replace(/^\//, ""));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, mergedBytes);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
