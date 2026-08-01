import type { DailyBriefing, ProviderAnalysis, Highlight } from "../ai/schema.js";
import type { ProviderConfig } from "../providers.js";
import { getProvider } from "../providers.js";

const CHANGE_TYPE_LABEL: Record<Highlight["change_type"], string> = {
  breaking: "BREAKING",
  security: "SECURITY",
  feature: "NEW",
  bugfix: "FIX",
  perf: "PERF",
  refactor: "REFACTOR",
  docs: "DOCS",
  chore: "CHORE",
};

const CHANGE_TYPE_COLOR: Record<Highlight["change_type"], string> = {
  breaking: "dc2626",
  security: "b91c1c",
  feature: "059669",
  bugfix: "2563eb",
  perf: "7c3aed",
  refactor: "6b7280",
  docs: "6b7280",
  chore: "9ca3af",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHighlight(h: Highlight, accent: string): string {
  const typeLabel = CHANGE_TYPE_LABEL[h.change_type];
  const typeColor = CHANGE_TYPE_COLOR[h.change_type];
  const openGithub = h.should_open_github;
  return `
        <tr>
          <td style="padding:0 0 24px 0;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:16px 20px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation">
                    <tr>
                      <td style="vertical-align:middle;">
                        <span style="display:inline-block;background:#${typeColor};color:#ffffff;font-size:10px;font-weight:700;letter-spacing:0.06em;padding:3px 8px;border-radius:4px;text-transform:uppercase;">${typeLabel}</span>
                        <span style="color:#6b7280;font-size:12px;margin-left:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(h.repo)}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top:10px;">
                        <a href="${escapeHtml(h.url)}" style="color:#111827;font-size:16px;font-weight:600;text-decoration:none;line-height:1.35;">${escapeHtml(h.title)}</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 12px 0;color:#374151;font-size:14px;line-height:1.55;"><strong style="color:#111827;">What changed:</strong> ${escapeHtml(h.what_changed)}</p>
                  <p style="margin:0 0 12px 0;color:#374151;font-size:14px;line-height:1.55;"><strong style="color:#111827;">Why it matters:</strong> ${escapeHtml(h.why_it_matters)}</p>
                  <p style="margin:0 0 12px 0;color:#374151;font-size:14px;line-height:1.55;"><strong style="color:#111827;">Who is affected:</strong> ${escapeHtml(h.who_is_affected)}</p>
                  <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.45;">
                    ${openGithub ? `⚠️ Worth opening GitHub to review.` : `✓ No need to open GitHub.`}
                    <span style="color:#9ca3af;"> · confidence ${(h.confidence * 100).toFixed(0)}%</span>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function renderProviderSection(pa: ProviderAnalysis): string {
  const provider = getProvider(pa.provider) as ProviderConfig | undefined;
  const displayName = provider?.displayName ?? pa.provider;
  const accent = provider?.accent ?? "6366f1";
  const tagline = provider?.tagline ?? "";
  const hasNews = pa.highlights.length > 0;

  const header = `
      <tr>
        <td style="padding:0 0 8px 0;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation">
            <tr>
              <td style="width:4px;background:#${accent};border-radius:2px;">&nbsp;</td>
              <td style="padding-left:14px;">
                <h2 style="margin:0;color:#111827;font-size:18px;font-weight:700;">${escapeHtml(displayName)}</h2>
                ${tagline ? `<p style="margin:2px 0 0 0;color:#6b7280;font-size:12px;">${escapeHtml(tagline)}</p>` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;

  if (!hasNews) {
    return `${header}
      <tr>
        <td style="padding:0 0 28px 0;color:#6b7280;font-size:14px;line-height:1.5;">
          Quiet day — nothing notable in the last 24h.
        </td>
      </tr>`;
    }

  const highlights = pa.highlights.map((h) => renderHighlight(h, accent)).join("");

  return `${header}
      <tr>
        <td style="padding:0 0 8px 0;color:#374151;font-size:14px;line-height:1.55;font-style:italic;">${escapeHtml(pa.summary)}</td>
      </tr>
      <tr>
        <td>
          <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation">
${highlights}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 28px 0;color:#111827;font-size:14px;line-height:1.5;"><strong>Verdict:</strong> ${escapeHtml(pa.verdict)}</td>
      </tr>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

export function renderBriefingEmail(
  briefing: DailyBriefing,
  subscriber: { email: string; name: string | null; token: string },
  options: { appBaseUrl: string },
): RenderedEmail {
  const providersWithNews = briefing.providers.filter((p) => p.highlights.length > 0);
  const totalHighlights = providersWithNews.reduce((n, p) => n + p.highlights.length, 0);
  const providerNames = providersWithNews.map((p) => getProvider(p.provider)?.displayName ?? p.provider);

  const dateStr = briefing.date;
  const subject =
    providersWithNews.length === 0
      ? `Daily Briefing — ${dateStr} (quiet day)`
      : providersWithNews.length === 1
        ? `${providerNames[0]} briefing — ${dateStr}`
        : `${totalHighlights} update${totalHighlights === 1 ? "" : "s"} across ${providerNames.join(" + ")} — ${dateStr}`;

  const greeting = subscriber.name
    ? `Hi ${escapeHtml(subscriber.name)},`
    : `Hi,`;

  const providerSections = briefing.providers.map(renderProviderSection).join("");

  const manageUrl = `${options.appBaseUrl}/manage?token=${encodeURIComponent(subscriber.token)}`;
  const unsubscribeUrl = `${options.appBaseUrl}/unsubscribe?token=${encodeURIComponent(subscriber.token)}`;

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
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px 32px;border-bottom:1px solid #f3f4f6;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation">
                <tr>
                  <td>
                    <p style="margin:0;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Daily Briefing · ${escapeHtml(dateStr)}</p>
                    <h1 style="margin:6px 0 0 0;color:#111827;font-size:22px;font-weight:700;">What changed in your repos</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Greeting -->
          <tr>
            <td style="padding:24px 32px 8px 32px;color:#111827;font-size:15px;line-height:1.5;">${greeting}</td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px 32px;color:#374151;font-size:14px;line-height:1.55;">
              ${providersWithNews.length === 0
                ? `Nothing notable happened across your subscriptions in the last 24 hours. Enjoy the quiet day.`
                : `Here's what landed in the last 24 hours across the providers you follow.`}
            </td>
          </tr>
          <!-- Providers -->
          <tr>
            <td style="padding:0 32px 8px 32px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation">
${providerSections}
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 28px 32px;border-top:1px solid #f3f4f6;background:#fafafa;">
              <p style="margin:0 0 8px 0;color:#6b7280;font-size:12px;line-height:1.5;">
                You're receiving this because you subscribed to the Resend Daily Briefing.
              </p>
              <p style="margin:0 0 14px 0;color:#9ca3af;font-size:12px;line-height:1.5;">
                <a href="${escapeHtml(manageUrl)}" style="color:#6b7280;">Manage subscriptions</a>
                &nbsp;·&nbsp;
                <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;">Unsubscribe</a>
              </p>
              <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.5;">
                Sent by juansoultrek.com · Built with Resend
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
