// Pure helpers for the rejection letter - no Deno APIs, so they can be
// tested with plain Node (see index.ts for the function itself).

// Same palette and layout as the other series emails
// (scripts/send-paper-notification.js, scripts/notify-author-accepted.js).
const COLOR_INK = "#222222";
const COLOR_MUTED = "#5b5b5b";
const COLOR_BORDER = "#e0e0e0";

export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Only ever email addresses already stored on the submission - the client
// never supplies a recipient, so this can't be used as an open relay.
export function parseRecipients(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const author of authors) {
    const email = String((author as { email?: unknown })?.email ?? "").trim();
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }
  return emails;
}

export function splitList(csv: string | undefined | null): string[] {
  return (csv ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Headers can't contain line breaks.
export function sanitizeSubject(subject: string): string {
  return String(subject).replace(/[\r\n]+/g, " ").trim().slice(0, 200);
}

export function normalizeBody(body: string): string {
  return String(body).replace(/\r\n?/g, "\n").trim();
}

// Blank lines start a new paragraph; single line breaks are kept.
export function bodyToHtmlParagraphs(body: string): string {
  return normalizeBody(body)
    .split(/\n{2,}/)
    .map((paragraph) => escapeHtml(paragraph.trim()).replace(/\n/g, "<br>"))
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:16px 0 0;line-height:1.6;">${paragraph}</p>`)
    .join("\n      ");
}

export function renderLetterHtml(
  { title, body, siteUrl, seriesName }: { title: string; body: string; siteUrl: string; seriesName: string },
): string {
  const siteLabel = siteUrl.replace(/^https?:\/\//, "");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:${COLOR_INK};">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <p style="color:${COLOR_MUTED};font-size:0.85rem;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.03em;">Your submission &middot; ${escapeHtml(seriesName)}</p>
      <h1 style="font-size:1.4rem;margin:0 0 8px;">${escapeHtml(title)}</h1>
      ${bodyToHtmlParagraphs(body)}
      <hr style="margin:32px 0;border:none;border-top:1px solid ${COLOR_BORDER};">
      <p style="color:${COLOR_MUTED};font-size:0.8rem;">
        You're receiving this because you submitted a paper to ${escapeHtml(seriesName)}.
        ${siteUrl ? `<a href="${escapeHtml(siteUrl)}" style="color:${COLOR_MUTED};">${escapeHtml(siteLabel)}</a>` : ""}
      </p>
    </div>
  </body>
</html>`;
}
