/**
 * Provider configuration.
 *
 * A "provider" is the unit the user subscribes to in the UI (e.g. "Resend").
 * Internally, each provider maps to one or more GitHub repos that the cron
 * watches. Storing provider slugs in `subscribers.repos` (instead of full
 * repo paths) means we can add/remove repos from a provider without migrating
 * existing subscribers — they automatically pick up the new list.
 */

export interface ProviderConfig {
  /** URL-safe slug, stored in subscribers.repos[]. */
  slug: string;
  /** Human-readable name shown in the UI and email. */
  displayName: string;
  /** Short tagline for the UI (one line). */
  tagline: string;
  /** Accent color used in the email + UI (hex without #). */
  accent: string;
  /** GitHub repos to watch, in "owner/repo" format. */
  repos: string[];
}

export const PROVIDERS: readonly ProviderConfig[] = [
  {
    slug: "resend",
    displayName: "Resend",
    tagline: "Email API for developers",
    accent: "6366f1",
    repos: ["resend/resend-node", "resend/react-email", "resend/resend-mcp"],
  },
  {
    slug: "supabase",
    displayName: "Supabase",
    tagline: "Open source Firebase alternative",
    accent: "3ecf8e",
    repos: ["supabase/supabase", "supabase/supabase-js"],
  },
  {
    slug: "nango",
    displayName: "Nango",
    tagline: "Unified API for integrations",
    accent: "8b5cf6",
    repos: ["NangoHQ/nango"],
  },
];

const BY_SLUG = new Map(PROVIDERS.map((p) => [p.slug, p]));

export function getProvider(slug: string): ProviderConfig | undefined {
  return BY_SLUG.get(slug);
}

/** All valid provider slugs — used to validate subscribe payloads. */
export const PROVIDER_SLUGS = PROVIDERS.map((p) => p.slug) as readonly string[];

export function isValidProviderSlug(slug: string): boolean {
  return BY_SLUG.has(slug);
}

/**
 * Resolve a list of provider slugs to the full list of repos to watch.
 * Unknown slugs are dropped silently (defensive — the form should validate).
 */
export function resolveRepos(providerSlugs: string[]): string[] {
  const out = new Set<string>();
  for (const slug of providerSlugs) {
    const p = BY_SLUG.get(slug);
    if (p) for (const r of p.repos) out.add(r);
  }
  return [...out];
}

/**
 * Group a flat list of repo paths by their provider slug.
 * Useful when the cron has fetched events for many repos and needs to
 * re-bucket them per provider for the AI analyzer.
 */
export function groupReposByProvider(repoPaths: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of PROVIDERS) {
    const matched = repoPaths.filter((r) => p.repos.includes(r));
    if (matched.length > 0) out.set(p.slug, matched);
  }
  return out;
}
