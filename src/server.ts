import express from "express";
import { loadConfig } from "./config.js";
import { createGitHubClient, splitRepo, collectForRepo } from "./github/index.js";
import { PROVIDERS } from "./providers.js";

const config = loadConfig();
const gh = createGitHubClient({ token: config.ghToken });

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

const port = config.port;
app.listen(port, () => {
  console.log(`[resend-daily-briefing] listening on :${port} (basePath: ${config.basePath || "/"})`);
  console.log(`[resend-daily-briefing] health: http://localhost:${port}${config.basePath}/health`);
});
