// lib/email/templates.ts
// Plain HTML email templates — no external dependencies needed.
// Resend accepts raw HTML strings directly.

const BRAND_COLOR = "#5eead4"; // teal-300
const BG_COLOR = "#050816";

function emailShell(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; background-color:${BG_COLOR}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_COLOR};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" style="max-width: 480px;" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <span style="color:${BRAND_COLOR}; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; font-weight: 600;">
                AstroProXL
              </span>
            </td>
          </tr>
          <tr>
            <td style="background-color: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 32px 24px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top: 24px;">
              <span style="color: rgba(148,163,184,0.6); font-size: 11px;">
                AstroProXL · astroproxl.com
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ── Free reading reset reminder ───────────────────────────────────────────────
export function freeReadingResetEmail(): { subject: string; html: string } {
  const subject = "Your free reading is back";
  const html = emailShell(`
    <h1 style="color: #ffffff; font-size: 22px; font-weight: 600; margin: 0 0 12px;">
      Your free reading just reset
    </h1>
    <p style="color: #cbd5e1; font-size: 14px; line-height: 22px; margin: 0 0 24px;">
      A new week, a new window into what's coming. Your chart has shifted since your last reading — new transits, new windows, new dates worth knowing about.
    </p>
    <a href="https://astroproxl.com/reading/intake"
       style="display: inline-block; background-color: ${BRAND_COLOR}; color: #050816; font-size: 14px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 16px;">
      Get Your Reading →
    </a>
  `);
  return { subject, html };
}

// ── Generic announcement email ────────────────────────────────────────────────
export function announcementEmail(params: {
  headline: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
}): { subject: string; html: string } {
  const { headline, body, ctaText, ctaUrl } = params;
  const html = emailShell(`
    <h1 style="color: #ffffff; font-size: 22px; font-weight: 600; margin: 0 0 12px;">
      ${headline}
    </h1>
    <p style="color: #cbd5e1; font-size: 14px; line-height: 22px; margin: 0 0 24px; white-space: pre-line;">
      ${body}
    </p>
    ${ctaText && ctaUrl ? `
    <a href="${ctaUrl}"
       style="display: inline-block; background-color: ${BRAND_COLOR}; color: #050816; font-size: 14px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 16px;">
      ${ctaText} →
    </a>
    ` : ""}
  `);
  return { subject: headline, html };
}

// ── Welcome email (first signup) ──────────────────────────────────────────────
export function welcomeEmail(): { subject: string; html: string } {
  const subject = "Welcome to AstroProXL";
  const html = emailShell(`
    <h1 style="color: #ffffff; font-size: 22px; font-weight: 600; margin: 0 0 12px;">
      Your chart is ready
    </h1>
    <p style="color: #cbd5e1; font-size: 14px; line-height: 22px; margin: 0 0 24px;">
      This isn't horoscope astrology. Every reading uses your exact birth chart, current transits, and real timing — specific dates, specific windows, no vague generalities.
    </p>
    <p style="color: #cbd5e1; font-size: 14px; line-height: 22px; margin: 0 0 24px;">
      Your first reading is free. Go see what your chart actually says.
    </p>
    <a href="https://astroproxl.com/reading/intake"
       style="display: inline-block; background-color: ${BRAND_COLOR}; color: #050816; font-size: 14px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 16px;">
      Start My Free Reading →
    </a>
  `);
  return { subject, html };
}

// ── Coupon / win-back email ───────────────────────────────────────────────────
export function couponEmail(params: {
  headline: string;
  body: string;
  couponCode: string;
  ctaUrl: string;
}): { subject: string; html: string } {
  const { headline, body, couponCode, ctaUrl } = params;
  const html = emailShell(`
    <h1 style="color: #ffffff; font-size: 22px; font-weight: 600; margin: 0 0 12px;">
      ${headline}
    </h1>
    <p style="color: #cbd5e1; font-size: 14px; line-height: 22px; margin: 0 0 20px;">
      ${body}
    </p>
    <div style="background-color: rgba(94,234,212,0.08); border: 1px dashed rgba(94,234,212,0.4); border-radius: 14px; padding: 16px; text-align: center; margin: 0 0 24px;">
      <span style="color: ${BRAND_COLOR}; font-size: 18px; font-weight: 700; letter-spacing: 2px;">
        ${couponCode}
      </span>
    </div>
    <a href="${ctaUrl}"
       style="display: inline-block; background-color: ${BRAND_COLOR}; color: #050816; font-size: 14px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 16px;">
      Use My Code →
    </a>
  `);
  return { subject: headline, html };
}