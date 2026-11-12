// Generates a CAROW-branded cover sheet page and prepends it to a paper's
// PDF, so a working paper looks like it belongs to the series even though
// authors submit a plain manuscript PDF.
//
// Library usage:
//   const { buildCoverPageBytes, prependCoverPage } = require("./generate-cover-sheet");
//
// CLI usage:
//   node scripts/generate-cover-sheet.js <papers-md-file> <source-pdf> [output-pdf]
//
// <papers-md-file> is a file under _papers/ (front matter supplies title,
// authors, wp_number, date). <source-pdf> is the author's manuscript PDF
// (no cover page). If [output-pdf] is omitted, it's written to the path
// given by the front matter's pdf_path (relative to the repo root).

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const yaml = require("js-yaml");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const REPO_ROOT = path.join(__dirname, "..");
const LOGO_PATH = path.join(__dirname, "assets", "carow-logo-print.png");
// Optional: the co-host's logo lockup, drawn right-aligned next to the CAROW
// logo if present. Not committed yet - falls back to just the CAROW logo
// until a print-quality file is added here.
const CO_HOST_LOGO_PATH = path.join(__dirname, "assets", "cirhr-logo-print.png");

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Mirrors assets/css/main.css's palette.
const RED = rgb(0xb3 / 255, 0x1b / 255, 0x1b / 255);
const INK = rgb(0x22 / 255, 0x22 / 255, 0x22 / 255);
const MUTED = rgb(0x5b / 255, 0x5b / 255, 0x5b / 255);
const WHITE = rgb(1, 1, 1);

function wrapText(font, text, size, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(attempt, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Draws text with extra letter-spacing (pdf-lib has no native tracking support).
function drawTrackedText(page, text, { x, y, size, font, color, tracking = 0 }) {
  let cursor = x;
  for (const ch of text) {
    page.drawText(ch, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(ch, size) + tracking;
  }
}

function loadSeriesConfig() {
  const config = yaml.load(fs.readFileSync(path.join(REPO_ROOT, "_config.yml"), "utf8"));
  return {
    seriesPrefix: config.series_prefix,
    shortTitle: config.short_title,
    carowName: config.carow.name,
    parentName: config.carow.parent,
  };
}

// Builds the one-page cover sheet as its own PDF, returned as bytes so it
// can be merged with the paper's actual PDF by the caller.
async function buildCoverPageBytes({ title, authors, wpLabel, dateText, shortTitle, carowName, parentName }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Top accent bar.
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 10, width: PAGE_WIDTH, height: 10, color: RED });

  // CAROW logo, left-aligned.
  const logoBytes = fs.readFileSync(LOGO_PATH);
  const logoImage = await pdfDoc.embedPng(logoBytes);
  const logoWidth = 190;
  const logoHeight = (logoImage.height / logoImage.width) * logoWidth;
  const logoY = PAGE_HEIGHT - 70 - logoHeight;
  page.drawImage(logoImage, { x: MARGIN, y: logoY, width: logoWidth, height: logoHeight });

  // Co-host (CIRHR) logo, right-aligned and vertically centered on the CAROW
  // logo's span - optional, since the file may not be committed yet.
  if (fs.existsSync(CO_HOST_LOGO_PATH)) {
    const coHostBytes = fs.readFileSync(CO_HOST_LOGO_PATH);
    const coHostImage = await pdfDoc.embedPng(coHostBytes);
    const coHostHeight = logoHeight * 1.5;
    const coHostWidth = (coHostImage.width / coHostImage.height) * coHostHeight;
    const coHostY = logoY + (logoHeight - coHostHeight) / 2;
    page.drawImage(coHostImage, {
      x: MARGIN + CONTENT_WIDTH - coHostWidth,
      y: coHostY,
      width: coHostWidth,
      height: coHostHeight,
    });
  }

  // Rule under the logos.
  const ruleY = logoY - 16;
  page.drawRectangle({ x: MARGIN, y: ruleY, width: CONTENT_WIDTH, height: 2, color: RED });

  // "WORKING PAPER SERIES" + subtitle.
  const seriesLabelY = ruleY - 22;
  drawTrackedText(page, "WORKING PAPER SERIES", {
    x: MARGIN,
    y: seriesLabelY,
    size: 13,
    font: helveticaBold,
    color: RED,
    tracking: 0.6,
  });
  page.drawText(`${carowName} · ${parentName}`, {
    x: MARGIN,
    y: seriesLabelY - 16,
    size: 9,
    font: helvetica,
    color: MUTED,
  });

  // Title (wrapped).
  const titleSize = 24,
    titleLineHeight = 30;
  const titleLines = wrapText(timesBold, title, titleSize, CONTENT_WIDTH);
  let cursorY = seriesLabelY - 60;
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y: cursorY, size: titleSize, font: timesBold, color: RED });
    cursorY -= titleLineHeight;
  }

  // Date.
  if (dateText) {
    page.drawText(dateText, { x: MARGIN, y: cursorY - 30, size: 11, font: helvetica, color: INK });
  }

  // Full-bleed maroon block, pinned to the bottom of the page: authors, a
  // divider, the WP number, and the series name, all in white. Its height
  // grows with the author count rather than a fixed value, so a long author
  // list never gets cramped or overlaps the WP number.
  const authorLines = authors.map((a) => (a.affiliation ? `${a.name} (${a.affiliation})` : a.name));
  const authorFontSize = 11;
  const authorLineHeight = 16;
  const blockTopPadding = 36;
  const ruleGap = 18;
  const wpGap = 16;
  const wpLineHeight = 18;
  const footerGap = 28;
  const footerLineHeight = 12;
  const bottomPadding = 24;
  const blockHeight = Math.max(
    220,
    blockTopPadding +
      authorLines.length * authorLineHeight +
      ruleGap +
      wpGap +
      wpLineHeight +
      footerGap +
      footerLineHeight +
      bottomPadding,
  );
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: blockHeight, color: RED });

  let authorY = blockHeight - blockTopPadding;
  for (const line of authorLines) {
    page.drawText(line, { x: MARGIN, y: authorY, size: authorFontSize, font: helvetica, color: WHITE });
    authorY -= authorLineHeight;
  }

  const dividerY = authorY - ruleGap + authorLineHeight - authorFontSize;
  page.drawRectangle({ x: MARGIN, y: dividerY, width: CONTENT_WIDTH, height: 1, color: WHITE });

  page.drawText(wpLabel, {
    x: MARGIN,
    y: dividerY - wpGap - wpLineHeight + 4,
    size: 13,
    font: helveticaBold,
    color: WHITE,
  });

  page.drawText(shortTitle, { x: MARGIN, y: bottomPadding, size: 8, font: helvetica, color: WHITE });

  return pdfDoc.save();
}

// Prepends the cover page to the source PDF, returning the merged bytes.
async function prependCoverPage(coverBytes, sourcePdfPath) {
  const mergedDoc = await PDFDocument.create();
  const coverDoc = await PDFDocument.load(coverBytes);
  const sourceDoc = await PDFDocument.load(fs.readFileSync(sourcePdfPath));

  const [coverPage] = await mergedDoc.copyPages(coverDoc, [0]);
  mergedDoc.addPage(coverPage);

  const sourcePages = await mergedDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
  sourcePages.forEach((p) => mergedDoc.addPage(p));

  return mergedDoc.save();
}

async function main() {
  const [papersMdFile, sourcePdf, outputOverride] = process.argv.slice(2);
  if (!papersMdFile || !sourcePdf) {
    console.error("Usage: node scripts/generate-cover-sheet.js <papers-md-file> <source-pdf> [output-pdf]");
    process.exit(1);
  }

  const { data: frontMatter } = matter(fs.readFileSync(papersMdFile, "utf8"));
  const series = loadSeriesConfig();

  const wpLabel = `${series.seriesPrefix}-${frontMatter.wp_number}`;
  const dateText = frontMatter.date
    ? new Date(frontMatter.date).toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" })
    : "";

  const coverBytes = await buildCoverPageBytes({
    title: frontMatter.title,
    authors: frontMatter.authors || [],
    wpLabel,
    dateText,
    shortTitle: series.shortTitle,
    carowName: series.carowName,
    parentName: series.parentName,
  });

  const mergedBytes = await prependCoverPage(coverBytes, sourcePdf);

  const outputPath = outputOverride
    ? outputOverride
    : path.join(REPO_ROOT, frontMatter.pdf_path.replace(/^\//, ""));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, mergedBytes);
  console.log(`Wrote ${outputPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { buildCoverPageBytes, prependCoverPage };
