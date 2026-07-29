import express from "express";
import { loadConfig } from "./config.js";

const config = loadConfig();

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

const port = config.port;
app.listen(port, () => {
  console.log(`[resend-daily-briefing] listening on :${port} (basePath: ${config.basePath || "/"})`);
  console.log(`[resend-daily-briefing] health: http://localhost:${port}${config.basePath}/health`);
});
