import type { SubscribersRepo, Subscriber } from "../db/subscribers.js";
import type { DispatchesRepo } from "../db/dispatches.js";
import type { Analyzer } from "../ai/analyzer.js";
import type { ProviderAnalysis, DailyBriefing } from "../ai/schema.js";
import type { RepoEvent } from "../github/types.js";
import type { Mailer } from "../email/client.js";
import { createGitHubClient, splitRepo, collectForRepo } from "../github/index.js";
import { getProvider, PROVIDERS } from "../providers.js";

export interface BriefingRunDeps {
  subscribers: SubscribersRepo;
  dispatches: DispatchesRepo;
  gh: ReturnType<typeof createGitHubClient>;
  analyzer: Analyzer;
  mailer: Mailer;
  /** Public base URL of the app, used to build manage/unsubscribe links. */
  appBaseUrl: string;
  /** Window in hours to look back for GitHub events. Default 24. */
  windowHours?: number;
}

export interface BriefingRunResult {
  runDate: string;
  totalSubscribers: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: { email: string; error: string }[];
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fetch GitHub events for all repos of a provider and run the AI analyzer.
 * Cached per provider slug so multiple subscribers sharing a provider
 * don't trigger duplicate fetches / OpenAI calls.
 */
async function buildProviderAnalysis(
  providerSlug: string,
  deps: BriefingRunDeps,
  cache: Map<string, ProviderAnalysis>,
  windowHours: number,
): Promise<ProviderAnalysis> {
  const cached = cache.get(providerSlug);
  if (cached) return cached;

  const provider = getProvider(providerSlug);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerSlug}`);
  }

  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const allEvents: RepoEvent[] = [];
  for (const repo of provider.repos) {
    const [owner, name] = splitRepo(repo);
    const [commits, pulls, issues] = await Promise.all([
      deps.gh.getCommits(owner, name, since.toISOString()),
      deps.gh.getPulls(owner, name),
      deps.gh.getIssues(owner, name, since.toISOString()),
    ]);
    allEvents.push(...collectForRepo(repo, { commits, pulls, issues }, windowHours));
  }

  const analysis = await deps.analyzer.analyze(providerSlug, allEvents);
  cache.set(providerSlug, analysis);
  return analysis;
}

/**
 * Orchestrates the daily briefing run.
 *
 * Flow:
 * 1. List all confirmed, active subscribers.
 * 2. For each unique provider across all subscribers, fetch + analyze once (cached).
 * 3. For each subscriber:
 *    - Skip if already dispatched today (idempotency).
 *    - Build a DailyBriefing with their providers' analyses.
 *    - If no provider has highlights → log "skipped", no email.
 *    - Else render HTML, send via Resend, log "sent" (or "failed").
 */
export async function runDailyBriefing(deps: BriefingRunDeps): Promise<BriefingRunResult> {
  const windowHours = deps.windowHours ?? 24;
  const runDate = todayUtc();

  const active = await deps.subscribers.listActiveConfirmed();
  const analysisCache = new Map<string, ProviderAnalysis>();

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: { email: string; error: string }[] = [];

  for (const sub of active) {
    try {
      // Idempotency: don't double-send if the cron fires twice.
      const already = await deps.dispatches.existsForDate(sub.id, runDate);
      if (already) {
        skipped++;
        continue;
      }

      // Resolve provider slugs the subscriber is opted into (drop unknowns).
      const slugs = sub.providers.filter((s) => getProvider(s) !== undefined);
      if (slugs.length === 0) {
        skipped++;
        continue;
      }

      // Build the per-provider analyses (cached across subscribers).
      const providerAnalyses: ProviderAnalysis[] = [];
      for (const slug of slugs) {
        providerAnalyses.push(await buildProviderAnalysis(slug, deps, analysisCache, windowHours));
      }

      const briefing: DailyBriefing = {
        date: runDate,
        providers: providerAnalyses,
      };

      const hasNews = providerAnalyses.some((p) => p.highlights.length > 0);
      const reposIncluded = providerAnalyses.flatMap((p) => {
        const prov = getProvider(p.provider);
        return prov ? prov.repos : [];
      });

      if (!hasNews) {
        await deps.dispatches.create({
          run_date: runDate,
          subscriber_id: sub.id,
          repos_included: reposIncluded,
          status: "skipped",
        });
        skipped++;
        continue;
      }

      const { renderBriefingEmail } = await import("../email/template.js");
      const { subject, html } = renderBriefingEmail(briefing, sub, { appBaseUrl: deps.appBaseUrl });

      const result = await deps.mailer.send({
        to: sub.email,
        subject,
        html,
        headers: {
          "List-Unsubscribe": `<${deps.appBaseUrl}/resend/unsubscribe?token=${encodeURIComponent(sub.token)}>; <mailto:briefing@juansoultrek.com?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      await deps.dispatches.create({
        run_date: runDate,
        subscriber_id: sub.id,
        repos_included: reposIncluded,
        status: "sent",
        resend_id: result.id || null,
      });
      sent++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ email: sub.email, error: message });
      try {
        await deps.dispatches.create({
          run_date: runDate,
          subscriber_id: sub.id,
          repos_included: [],
          status: "failed",
          error: message,
        });
      } catch {
        // best-effort log; don't mask the original error
      }
    }
  }

  return { runDate, totalSubscribers: active.length, sent, skipped, failed, errors };
}

/** Convenience: the set of all provider slugs (for diagnostics / health). */
export function allProviderSlugs(): string[] {
  return PROVIDERS.map((p) => p.slug);
}
