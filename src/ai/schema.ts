import { z } from "zod";

/**
 * Change type taxonomy used by the analyzer. The IA must classify each
 * highlight into exactly one of these. The order is intentional — more
 * "important" types first, so the email template can sort by severity.
 */
export const CHANGE_TYPES = [
  "breaking",  // possible breaking change — highest priority
  "security",  // security fix or vulnerability
  "feature",   // new functionality
  "bugfix",    // bug fix
  "perf",      // performance improvement
  "refactor",  // internal refactor, no behavior change
  "docs",      // documentation only
  "chore",     // deps, CI, config — low signal
] as const;

export const ChangeType = z.enum(CHANGE_TYPES);
export type ChangeType = z.infer<typeof ChangeType>;

/**
 * One notable change worth surfacing in the briefing.
 * The IA returns 0–5 of these per provider.
 */
export const Highlight = z.object({
  repo: z.string().describe("owner/repo of the source repo"),
  title: z.string().max(120).describe("Short headline, ~60–80 chars, like a PR title"),
  change_type: ChangeType,
  what_changed: z.string().max(400).describe("1–2 sentences: what actually changed, in plain language"),
  why_it_matters: z.string().max(400).describe("1–2 sentences: why this change matters"),
  who_is_affected: z.string().max(300).describe("1 sentence: who is affected (users of X, contributors, etc.)"),
  should_open_github: z.boolean().describe("True if it's worth opening GitHub to review in detail"),
  confidence: z.number().min(0).max(1).describe("0.0–1.0 confidence in the analysis"),
  url: z.string().url().describe("Direct link to the PR, commit, or issue"),
});
export type Highlight = z.infer<typeof Highlight>;

/**
 * Aggregated analysis for one provider (e.g. all Resend repos).
 * The IA receives all events from the provider's repos and returns one
 * of these objects.
 */
export const ProviderAnalysis = z.object({
  provider: z.string().describe("Provider slug, e.g. 'resend'"),
  summary: z.string().max(280).describe("1–2 sentence overview of the day for this provider"),
  highlights: z.array(Highlight).max(5).describe("0–5 most important changes; empty if nothing notable"),
  verdict: z.string().max(200).describe("One-line verdict: 'Vale la pena revisar X' or 'Día tranquilo'"),
});
export type ProviderAnalysis = z.infer<typeof ProviderAnalysis>;

/**
 * Full briefing for one subscriber on one day.
 * One entry per provider the subscriber is opted into.
 */
export const DailyBriefing = z.object({
  date: z.string().describe("ISO date (YYYY-MM-DD) of the briefing run"),
  providers: z.array(ProviderAnalysis),
});
export type DailyBriefing = z.infer<typeof DailyBriefing>;

/**
 * Validate an unknown value against the ProviderAnalysis schema.
 * Throws a ZodError on invalid input — the caller decides whether to
 * retry, fall back, or skip the provider.
 */
export function parseProviderAnalysis(raw: unknown): ProviderAnalysis {
  return ProviderAnalysis.parse(raw);
}
