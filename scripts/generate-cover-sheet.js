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

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Mirrors assets/css/main.css's palette.
const RED = rgb(0xb3 / 255, 0x1b / 255, 0x1b / 255);
const RED_DARK = rgb(0x8c / 255, 0x15 / 255, 0x15 / 255);
const INK = rgb(0x22 / 255, 0x22 / 255, 0x22 / 255);
const MUTED = rgb(0x5b / 255, 0x5b / 255, 0x5b / 255);
const BG_ALT = rgb(0xf7 / 255, 0xf5 / 255, 0xf2 / 255);
const BORDER = rgb(0xe0 / 255, 0xe0 / 255, 0xe0 / 255);

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
  const timesBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Top accent bar.
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 10, width: PAGE_WIDTH, height: 10, color: RED });

  // Logo.
  const logoBytes = fs.readFileSync(LOGO_PATH);
  const logoImage = await pdfDoc.embedPng(logoBytes);
  const logoWidth = 220;
  const logoHeight = (logoImage.height / logoImage.width) * logoWidth;
  const logoY = PAGE_HEIGHT - 70 - logoHeight;
  page.drawImage(logoImage, { x: MARGIN, y: logoY, width: logoWidth, height: logoHeight });

  // Rule under the logo.
  const ruleY = logoY - 16;
  page.drawRectangle({ x: MARGIN, y: ruleY, width: CONTENT_WIDTH, height: 2, color: RED });

  // "WORKING PAPER SERIES" + subtitle.
  const seriesLabelY = ruleY - 24;
  page.drawText("WORKING PAPER SERIES", {
    x: MARGIN,
    y: seriesLabelY,
    size: 14,
    font: timesBoldItalic,
    color: RED_DARK,
  });
  page.drawText(`${carowName} · ${parentName}`, {
    x: MARGIN,
    y: seriesLabelY - 16,
    size: 9,
    font: helvetica,
    color: MUTED,
  });

  // Title (wrapped).
  const titleSize = 22;
  const titleLineHeight = 28;
  const titleLines = wrapText(timesBold, title, titleSize, CONTENT_WIDTH);
  let cursorY = seriesLabelY - 70;
  for (const line of titleLines) {
    page.drawText(line, { x: MARGIN, y: cursorY, size: titleSize, font: timesBold, color: RED });
    cursorY -= titleLineHeight;
  }

  // Authors box.
  const authorLines = authors.map((a) => (a.affiliation ? `${a.name} (${a.affiliation})` : a.name));
  const authorFontSize = 11;
  const authorLineHeight = 16;
  const boxPaddingY = 14;
  const boxTop = cursorY - 24;
  const boxHeight = authorLines.length * authorLineHeight + boxPaddingY * 2 - (authorLineHeight - authorFontSize);
  const boxBottom = boxTop - boxHeight;
  page.drawRectangle({ x: MARGIN, y: boxBottom, width: CONTENT_WIDTH, height: boxHeight, color: BG_ALT });
  let authorY = boxTop - boxPaddingY - authorFontSize;
  for (const line of authorLines) {
    page.drawText(line, { x: MARGIN + 16, y: authorY, size: authorFontSize, font: helvetica, color: INK });
    authorY -= authorLineHeight;
  }

  // Date, below the authors box.
  if (dateText) {
    page.drawText(dateText, { x: MARGIN, y: boxBottom - 24, size: 10, font: helvetica, color: MUTED });
  }

  // WP number box, pinned near the bottom.
  const wpBoxY = 90;
  const wpBoxHeight = 26;
  page.drawRectangle({ x: MARGIN, y: wpBoxY, width: 260, height: wpBoxHeight, color: BG_ALT });
  page.drawText(wpLabel, {
    x: MARGIN + 12,
    y: wpBoxY + 8,
    size: 12,
    font: helveticaBold,
    color: INK,
  });

  // Footer rule + series name.
  page.drawRectangle({ x: MARGIN, y: 60, width: CONTENT_WIDTH, height: 1, color: BORDER });
  page.drawText(shortTitle, { x: MARGIN, y: 44, size: 9, font: helvetica, color: MUTED });

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
