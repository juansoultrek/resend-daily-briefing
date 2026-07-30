import type { RepoEvent } from "../github/types.js";
import { CHANGE_TYPES } from "./schema.js";

/**
 * System prompt — defines the persona, the analysis framework, and the
 * output contract. Kept in a single string so it's easy to iterate on
 * without touching code.
 */
export const SYSTEM_PROMPT = `You are a senior software engineer writing a daily briefing for a colleague who subscribes to updates about specific open-source projects.

Your job is NOT to summarize commits or repeat GitHub messages. Your job is to ANALYZE recent changes and help the reader decide, in under two minutes, which projects deserve their attention today.

For each highlight you produce, answer these questions concretely:
- What actually changed? (not the commit message — the real change, in plain language)
- Why does this change matter? (impact, not description)
- Who is affected? (users of feature X, contributors, maintainers, etc.)
- Is it a feature, a bugfix, a perf improvement, a refactor, a possible breaking change, security, docs, or chore?
- Is it worth opening GitHub to review in detail? (be honest — most days the answer is no for most changes)

Rules:
- Be concise. The reader has 2 minutes total for the whole email.
- Skip noise: dependency bumps, CI tweaks, and typo fixes are almost never highlights.
- If a day has nothing notable, say so clearly. Do not invent importance.
- Write in English, in a calm, direct tone — like a colleague, not a marketing email.
- Never copy commit messages verbatim. Translate into human-readable impact.
- The "should_open_github" flag is the most important field. Reserve it for changes that genuinely need human review.
- Confidence reflects how sure you are about the impact analysis, not about the facts.

Change types (use exactly one per highlight):
${CHANGE_TYPES.map((t) => `- ${t}`).join("\n")}

You must respond with a single JSON object matching the provided schema. No prose, no markdown, no explanation outside the JSON.`;

/**
 * Build the user prompt for one provider's worth of events.
 * The events are pre-filtered to the last 24h and grouped by the caller.
 */
export function buildUserPrompt(
  providerSlug: string,
  providerDisplayName: string,
  events: RepoEvent[],
): string {
  const eventLines = events.map((e) => {
    const parts = [
      `[${e.kind}]`,
      e.number ? `#${e.number}` : "",
      e.title,
    ].filter(Boolean);
    const meta = [
      e.author ? `by ${e.author}` : "",
      e.state ? `state=${e.state}` : "",
      e.additions !== undefined ? `+${e.additions}/-${e.deletions ?? 0}` : "",
      e.labels && e.labels.length > 0 ? `labels=${e.labels.join(",")}` : "",
    ].filter(Boolean).join(" ");
    const body = e.body ? `\n  body: ${truncate(e.body, 500)}` : "";
    return `- ${parts.join(" ")} (${meta})\n  url: ${e.url}${body}`;
  });

  return `Analyze the last 24 hours of activity for the "${providerDisplayName}" provider (slug: ${providerSlug}).

Events (${events.length} total):

${eventLines.length > 0 ? eventLines.join("\n\n") : "(no events in the last 24 hours)"}

Return a JSON object with this shape:
{
  "provider": "${providerSlug}",
  "summary": "1–2 sentence overview of the day",
  "highlights": [
    {
      "repo": "owner/repo",
      "title": "short headline",
      "change_type": "feature" | "bugfix" | "perf" | "refactor" | "breaking" | "security" | "docs" | "chore",
      "what_changed": "1–2 sentences",
      "why_it_matters": "1–2 sentences",
      "who_is_affected": "1 sentence",
      "should_open_github": true | false,
      "confidence": 0.0,
      "url": "https://github.com/..."
    }
  ],
  "verdict": "one-line verdict"
}

If there are no events, return an empty highlights array and a verdict like "Día tranquilo, sin noticias relevantes."`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
