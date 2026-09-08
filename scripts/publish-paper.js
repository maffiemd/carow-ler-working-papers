// Publishes a working paper end to end: builds the CAROW cover sheet,
// merges it onto the author's manuscript PDF, writes the result to pdfs/,
// then commits and pushes both files. Pushing is what actually publishes
// the paper — it triggers the existing GitHub Actions that rebuild the
// site and email everyone on the mailing list, so nothing else to run
// after this.
//
// Usage:
//   node scripts/publish-paper.js <papers-md-file> <source-pdf> [--no-push]
//
// <papers-md-file> is a file already created under _papers/ (copy
// templates/new-paper.md and fill in title/authors/wp_number/etc. first —
// this script does not create it for you). <source-pdf> is the author's
// manuscript, as a plain PDF with no cover page.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const matter = require("gray-matter");
const { buildCoverPageBytes, prependCoverPage } = require("./generate-cover-sheet");
const yaml = require("js-yaml");

const REPO_ROOT = path.join(__dirname, "..");

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: REPO_ROOT, stdio: "inherit" });
}

function requireField(frontMatter, field, papersMdFile) {
  if (!frontMatter[field]) {
    throw new Error(`${papersMdFile} is missing required front matter field: ${field}`);
  }
  return frontMatter[field];
}

async function main() {
  const args = process.argv.slice(2);
  const noPush = args.includes("--no-push");
  const [papersMdFile, sourcePdf] = args.filter((a) => !a.startsWith("--"));

  if (!papersMdFile || !sourcePdf) {
    console.error("Usage: node scripts/publish-paper.js <papers-md-file> <source-pdf> [--no-push]");
    process.exit(1);
  }

  if (!fs.existsSync(papersMdFile)) {
    throw new Error(`No such file: ${papersMdFile}`);
  }
  if (!fs.existsSync(sourcePdf)) {
    throw new Error(`No such file: ${sourcePdf}`);
  }
  const sourceHeader = fs.readFileSync(sourcePdf, { encoding: "latin1", flag: "r" }).slice(0, 5);
  if (path.extname(sourcePdf).toLowerCase() !== ".pdf" || sourceHeader !== "%PDF-") {
    throw new Error(
      `${sourcePdf} doesn't look like a PDF. This tool only accepts PDF manuscripts — convert it to PDF first.`,
    );
  }

  const { data: frontMatter } = matter(fs.readFileSync(papersMdFile, "utf8"));
  requireField(frontMatter, "title", papersMdFile);
  requireField(frontMatter, "wp_number", papersMdFile);
  requireField(frontMatter, "pdf_path", papersMdFile);
  if (!frontMatter.authors || frontMatter.authors.length === 0) {
    throw new Error(`${papersMdFile} is missing required front matter field: authors`);
  }

  const config = yaml.load(fs.readFileSync(path.join(REPO_ROOT, "_config.yml"), "utf8"));
  const wpLabel = `${config.series_prefix}-${frontMatter.wp_number}`;
  const dateText = frontMatter.date
    ? new Date(frontMatter.date).toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" })
    : "";

  console.log(`Building cover sheet for ${wpLabel}: "${frontMatter.title}"`);
  const coverBytes = await buildCoverPageBytes({
    title: frontMatter.title,
    authors: frontMatter.authors,
    wpLabel,
    dateText,
    shortTitle: config.short_title,
    carowName: config.carow.name,
    parentName: config.carow.parent,
  });
  const mergedBytes = await prependCoverPage(coverBytes, sourcePdf);

  const outputPath = path.join(REPO_ROOT, frontMatter.pdf_path.replace(/^\//, ""));
  if (fs.existsSync(outputPath)) {
    console.log(`Note: overwriting existing file at ${frontMatter.pdf_path}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, mergedBytes);
  console.log(`Wrote ${frontMatter.pdf_path}`);

  const relPapersMdFile = path.relative(REPO_ROOT, path.resolve(papersMdFile));
  const relOutputPath = path.relative(REPO_ROOT, outputPath);

  run("git", ["add", relPapersMdFile, relOutputPath]);

  const diffCheck = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: REPO_ROOT }).toString().trim();
  if (!diffCheck) {
    console.log("Nothing to commit — working tree already matches this paper. Skipping commit/push.");
    return;
  }

  run("git", ["commit", "-m", `Publish working paper: ${frontMatter.title} (${wpLabel})`]);

  if (noPush) {
    console.log("--no-push given: committed locally but did not push. Run `git push` when ready.");
    return;
  }

  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: REPO_ROOT }).toString().trim();
  run("git", ["push", "origin", branch]);
  console.log(`\nPublished. GitHub Actions will now rebuild the site and email subscribers about ${wpLabel}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
