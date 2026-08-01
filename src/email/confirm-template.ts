import type { ProviderConfig } from "../providers.js";
import { getProvider } from "../providers.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderedConfirmation {
  subject: string;
  html: string;
}

/**
 * Renders the double opt-in confirmation email.
 * The subscriber must click the confirm link to start receiving briefings.
 */
export function renderConfirmationEmail(
  subscriber: { email: string; name: string | null; token: string },
  providerSlugs: string[],
  options: { appBaseUrl: string },
): RenderedConfirmation {
  const confirmUrl = `${options.appBaseUrl}/confirm?token=${encodeURIComponent(subscriber.token)}`;
  const greeting = subscriber.name ? `Hi ${escapeHtml(subscriber.name)},` : "Hi,";

  const providerChips = providerSlugs
    .map((slug) => {
      const p = getProvider(slug) as ProviderConfig | undefined;
      const name = p?.displayName ?? slug;
      const accent = p?.accent ?? "6366f1";
      return `<span style="display:inline-block;background:#${accent};color:#ffffff;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin:0 6px 6px 0;">${escapeHtml(name)}</span>`;
    })
    .join("");

  const subject = "Confirm your subscription to the Daily Briefing";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="600" role="presentation" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #f3f4f6;">
              <p style="margin:0;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Confirm your subscription</p>
              <h1 style="margin:6px 0 0 0;color:#111827;font-size:22px;font-weight:700;">One click to start your briefings</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px 32px;color:#111827;font-size:15px;line-height:1.5;">${greeting}</td>
          </tr>
          <tr>
            <td style="padding:0 32px 20px 32px;color:#374151;font-size:14px;line-height:1.55;">
              You're almost in. Confirm to start receiving a daily AI-analyzed briefing of the providers you selected:
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px 32px;">${providerChips}</td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:#111827;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;">Confirm subscription</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px;color:#6b7280;font-size:12px;line-height:1.5;">
              Or paste this link into your browser:<br>
              <a href="${escapeHtml(confirmUrl)}" style="color:#6b7280;word-break:break-all;">${escapeHtml(confirmUrl)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 28px 32px;border-top:1px solid #f3f4f6;background:#fafafa;">
              <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.5;">
                If you didn't subscribe, you can ignore this email — no briefings will be sent until you confirm.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
