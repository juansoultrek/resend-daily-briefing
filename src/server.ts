import express from "express";
import { loadConfig } from "./config.js";
import { createGitHubClient, splitRepo, collectForRepo } from "./github/index.js";
import { createAnalyzer } from "./ai/index.js";
import { PROVIDERS, getProvider, resolveRepos } from "./providers.js";
import { createDbClient, SubscribersRepo, DispatchesRepo } from "./db/index.js";
import { createMailer } from "./email/client.js";
import { renderConfirmationEmail } from "./email/confirm-template.js";
import { runDailyBriefing } from "./cron/briefing.js";
import { generateToken } from "./auth/token.js";
import { isValidProviderSlug, PROVIDER_SLUGS } from "./providers.js";

const config = loadConfig();
const gh = createGitHubClient({ token: config.ghToken });
const analyzer = createAnalyzer({
  apiKey: config.openaiApiKey,
  model: config.openaiModel,
});

// DB is optional at boot — only wire it if both Supabase vars are set.
let subscribers: SubscribersRepo | null = null;
let dispatches: DispatchesRepo | null = null;
if (config.supabaseUrl && config.supabaseServiceRoleKey) {
  const db = createDbClient({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
  });
  subscribers = new SubscribersRepo(db);
  dispatches = new DispatchesRepo(db);
}

// Mailer is optional at boot — only wire it if RESEND_API_KEY is set.
const mailer = config.resendApiKey && config.resendFrom
  ? createMailer({ apiKey: config.resendApiKey, from: config.resendFrom })
  : null;

// Public base URL used to build manage/unsubscribe links in the emails.
// Defaults to the cPanel mount path; override with APP_BASE_URL in env.
const appBaseUrl = (process.env.APP_BASE_URL ?? `https://juansoultrek.com${config.basePath || ""}`).replace(/\/$/, "");

const app = express();
app.use(express.json());

// Minimal health endpoint — no auth, safe to expose.
app.get(`${config.basePath}/health`, (_req, res) => {
  res.json({
    ok: true,
    service: "resend-daily-briefing",
    version: process.env.npm_package_version ?? "0.0.0",
    basePath: config.basePath || "/",
    watchedRepos: config.watchedRepos,
    keys: {
      ghToken: !!config.ghToken,
      openaiApiKey: !!config.openaiApiKey,
      resendApiKey: !!config.resendApiKey,
      supabase: !!config.supabaseUrl && !!config.supabaseServiceRoleKey,
      cronSecret: !!config.cronSecret,
    },
  });
});

/**
 * Public list of providers the user can subscribe to.
 * Consumed by the landing page UI (added in a later commit).
 */
app.get(`${config.basePath}/providers`, (_req, res) => {
  res.json({
    ok: true,
    providers: PROVIDERS.map((p) => ({
      slug: p.slug,
      displayName: p.displayName,
      tagline: p.tagline,
      accent: p.accent,
      repoCount: p.repos.length,
    })),
  });
});

/**
 * Debug endpoint: returns the normalized RepoEvents for one repo within the
 * last 24h. Useful while wiring the GitHub integration. No auth — it only
 * reads public data. Will be removed (or auth-gated) before production cron.
 *
 * Example: GET /test/github?repo=resend/resend
 */
app.get(`${config.basePath}/test/github`, async (req, res) => {
  const repo = typeof req.query.repo === "string" ? req.query.repo : config.watchedRepos[0] ?? "";
  if (!repo) {
    res.status(400).json({ ok: false, error: "Missing ?repo=owner/repo" });
    return;
  }
  try {
    const [owner, name] = splitRepo(repo);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [commits, pulls, issues] = await Promise.all([
      gh.getCommits(owner, name, since.toISOString()),
      gh.getPulls(owner, name),
      gh.getIssues(owner, name, since.toISOString()),
    ]);
    const events = collectForRepo(repo, { commits, pulls, issues }, 24);
    res.json({
      ok: true,
      repo,
      windowHours: 24,
      counts: { commits: commits.length, pulls: pulls.length, issues: issues.length },
      events,
    });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
        ? (err as { status: number }).status
        : 500;
    const message = err instanceof Error ? err.message : String(err);
    res.status(status).json({ ok: false, repo, error: message });
  }
});

/**
 * Debug endpoint: runs the full pipeline (GitHub fetch → AI analysis) for one
 * provider and returns the structured ProviderAnalysis. Requires OPENAI_API_KEY.
 *
 * Example: GET /test/ai?provider=resend
 */
app.get(`${config.basePath}/test/ai`, async (req, res) => {
  const providerSlug = typeof req.query.provider === "string" ? req.query.provider : "";
  if (!providerSlug) {
    res.status(400).json({ ok: false, error: "Missing ?provider=slug" });
    return;
  }
  const provider = getProvider(providerSlug);
  if (!provider) {
    res.status(400).json({ ok: false, error: `Unknown provider: ${providerSlug}` });
    return;
  }
  try {
    const repos = provider.repos;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const allEvents = [];
    for (const repo of repos) {
      const [owner, name] = splitRepo(repo);
      const [commits, pulls, issues] = await Promise.all([
        gh.getCommits(owner, name, since.toISOString()),
        gh.getPulls(owner, name),
        gh.getIssues(owner, name, since.toISOString()),
      ]);
      allEvents.push(...collectForRepo(repo, { commits, pulls, issues }, 24));
    }
    const analysis = await analyzer.analyze(providerSlug, allEvents);
    res.json({
      ok: true,
      provider: providerSlug,
      eventsAnalyzed: allEvents.length,
      analysis,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, provider: providerSlug, error: message });
  }
});

/**
 * Health check for the Supabase connection — does a trivial query.
 * Also useful as a keep-alive ping target.
 */
app.get(`${config.basePath}/health-db`, async (_req, res) => {
  if (!subscribers) {
    res.status(503).json({ ok: false, error: "Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)" });
    return;
  }
  try {
    const active = await subscribers.listActiveConfirmed();
    res.json({ ok: true, activeSubscribers: active.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

const port = config.port;

/**
 * Cron entrypoint: runs the daily briefing for all confirmed subscribers.
 * Protected by the X-Cron-Secret header (shared with the cron scheduler).
 *
 * Requires: GH_TOKEN, OPENAI_API_KEY, RESEND_API_KEY, RESEND_FROM,
 *           SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
 *
 * Trigger with:
 *   curl -X POST https://juansoultrek.com/resend/cron/briefing \
 *        -H "X-Cron-Secret: $CRON_SECRET"
 */
app.post(`${config.basePath}/cron/briefing`, async (req, res) => {
  const provided = req.get("X-Cron-Secret") ?? "";
  if (!config.cronSecret || provided !== config.cronSecret) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  if (!subscribers || !dispatches) {
    res.status(503).json({ ok: false, error: "Supabase not configured" });
    return;
  }
  if (!mailer) {
    res.status(503).json({ ok: false, error: "Resend not configured (RESEND_API_KEY / RESEND_FROM missing)" });
    return;
  }
  try {
    const result = await runDailyBriefing({
      subscribers,
      dispatches,
      gh,
      analyzer,
      mailer,
      appBaseUrl,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

// --- Subscription endpoints (public) ---

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && EMAIL_RE.test(v) && v.length <= 254;
}

function sanitizeProviders(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const slugs = input.filter((s): s is string => typeof s === "string" && isValidProviderSlug(s));
  if (slugs.length === 0) return null;
  // dedupe preserving order
  return [...new Set(slugs)];
}

/**
 * POST /subscribe
 * Body: { email, name?, providers[] }
 *
 * - If already confirmed & active → returns { alreadySubscribed: true, providers }
 * - If new (or unconfirmed) → creates/reuses subscriber, sends double opt-in email.
 */
app.post(`${config.basePath}/subscribe`, async (req, res) => {
  if (!subscribers || !mailer) {
    res.status(503).json({ ok: false, error: "Subscriptions not configured (Supabase/Resend missing)" });
    return;
  }
  const body = req.body ?? {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    res.status(400).json({ ok: false, error: "Invalid email" });
    return;
  }
  const name = typeof body.name === "string" && body.name.trim().length > 0 ? body.name.trim().slice(0, 120) : null;
  const providers = sanitizeProviders(body.providers);
  if (!providers) {
    res.status(400).json({ ok: false, error: `providers must be a non-empty array of valid slugs: ${PROVIDER_SLUGS.join(", ")}` });
    return;
  }

  try {
    const existing = await subscribers.findByEmail(email);
    if (existing && existing.confirmed) {
      res.json({ ok: true, alreadySubscribed: true, providers: existing.providers });
      return;
    }

    // Create new subscriber or reuse the unconfirmed row with a fresh token.
    let sub;
    if (existing) {
      // Re-send confirmation to the already-existing unconfirmed subscriber.
      sub = existing;
    } else {
      sub = await subscribers.create({ email, name, token: generateToken(), providers });
    }

    const { subject, html } = renderConfirmationEmail(sub, sub.providers, { appBaseUrl });
    await mailer.send({ to: sub.email, subject, html });
    res.json({ ok: true, confirmationSent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

/**
 * GET /confirm?token=...
 * Double opt-in: marks the subscriber as confirmed.
 */
app.get(`${config.basePath}/confirm`, async (req, res) => {
  if (!subscribers) {
    res.status(503).json({ ok: false, error: "Supabase not configured" });
    return;
  }
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).json({ ok: false, error: "Missing ?token" });
    return;
  }
  try {
    const sub = await subscribers.confirm(token);
    if (!sub) {
      res.status(404).json({ ok: false, error: "Token not found or already unsubscribed" });
      return;
    }
    res.json({ ok: true, confirmed: true, email: sub.email, providers: sub.providers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

/**
 * POST /manage
 * Body: { email, providers[] }
 * Updates which providers an existing confirmed subscriber receives.
 */
app.post(`${config.basePath}/manage`, async (req, res) => {
  if (!subscribers) {
    res.status(503).json({ ok: false, error: "Supabase not configured" });
    return;
  }
  const body = req.body ?? {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    res.status(400).json({ ok: false, error: "Invalid email" });
    return;
  }
  const providers = sanitizeProviders(body.providers);
  if (!providers) {
    res.status(400).json({ ok: false, error: "providers must be a non-empty array of valid slugs" });
    return;
  }
  try {
    const sub = await subscribers.updateProviders({ email, providers });
    if (!sub) {
      res.status(404).json({ ok: false, error: "Subscriber not found or unsubscribed" });
      return;
    }
    res.json({ ok: true, updated: true, providers: sub.providers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

/**
 * GET /unsubscribe?token=...
 * Soft-delete: sets unsubscribed_at. Preserves dispatch history.
 */
app.get(`${config.basePath}/unsubscribe`, async (req, res) => {
  if (!subscribers) {
    res.status(503).json({ ok: false, error: "Supabase not configured" });
    return;
  }
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).json({ ok: false, error: "Missing ?token" });
    return;
  }
  try {
    const sub = await subscribers.unsubscribe(token);
    if (!sub) {
      res.status(404).json({ ok: false, error: "Token not found or already unsubscribed" });
      return;
    }
    res.json({ ok: true, unsubscribed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

app.listen(port, () => {
  console.log(`[resend-daily-briefing] listening on :${port} (basePath: ${config.basePath || "/"})`);
  console.log(`[resend-daily-briefing] health: http://localhost:${port}${config.basePath}/health`);
});
