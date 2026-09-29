// Turns the copy in ./welcome-email.ts into the actual HTML email. Split out
// from index.ts so a future preview script could render it without booting
// the Edge Function (which needs Deno.env secrets index.ts doesn't have
// outside a deployed/linked environment).

import { WELCOME_EMAIL_BODY, WELCOME_EMAIL_SUBJECT } from "./welcome-email.ts";

// Mirrors assets/css/main.css's palette (--carow-red, --ink, --muted,
// --border, --bg-alt) - email clients need inline styles, so this can't
// reference the stylesheet directly.
const COLOR_RED = "#B31B1B";
const COLOR_INK = "#222222";
const COLOR_MUTED = "#5b5b5b";
const COLOR_BORDER = "#e0e0e0";

export function renderWelcomeEmailHtml(siteUrl: string, unsubscribeLink: string) {
  const papersLink = `${siteUrl}/papers/`;
  const carowLogoUrl = `${siteUrl}/assets/images/carow-logo-email.png`;
  const uoftCrestUrl = `${siteUrl}/assets/images/uoft-crest-email.png`;

  const paragraphs = WELCOME_EMAIL_BODY.trim()
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 1em;">${p.trim()}</p>`)
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:${COLOR_INK};">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr>
          <td align="left"><img src="${carowLogoUrl}" width="180" height="44" alt="CAROW" style="display:block;"></td>
          <td align="right"><img src="${uoftCrestUrl}" width="21" height="44" alt="University of Toronto" style="display:block;margin-left:auto;"></td>
        </tr>
      </table>
      <hr style="margin:0 0 20px;border:none;border-top:1px solid ${COLOR_BORDER};">
      <h1 style="font-size:1.3rem;color:${COLOR_RED};">${WELCOME_EMAIL_SUBJECT}</h1>
      <div style="font-size:1.05rem;line-height:1.6;">${paragraphs}</div>
      <p style="margin-top:24px;">
        <a href="${papersLink}" style="display:inline-block;background:${COLOR_RED};color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;font-family:-apple-system,sans-serif;font-weight:600;">Browse all papers</a>
      </p>
      <hr style="margin:32px 0;border:none;border-top:1px solid ${COLOR_BORDER};">
      <p style="color:${COLOR_MUTED};font-family:-apple-system,sans-serif;font-size:0.8rem;">
        <a href="${unsubscribeLink}" style="color:${COLOR_MUTED};">Unsubscribe</a>
      </p>
    </div>
  </body>
</html>`;
}
