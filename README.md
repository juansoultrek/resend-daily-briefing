# Resend Daily Briefing

A daily email digest of GitHub repo activity, analyzed by AI and sent via **Resend**.

Each morning, subscribers receive a single email summarizing the most relevant
changes from the last 24 hours across a configurable list of repositories.
The AI does not just list commits — it answers:

- What actually changed?
- Why does this change matter?
- Who is affected?
- Is it a feature, a bugfix, a perf improvement, a refactor, or a possible breaking change?
- Is it worth opening GitHub to review in detail?

The goal: read the email in under two minutes and decide which repos deserve
your attention that day.

## Status

🚧 Scaffold — endpoints and integrations are added incrementally.
See `ARCHITECTURE.md` (added in a later commit) for the full design.

## Stack

- **Node.js 20+** + **TypeScript 5.9**
- **Express 5** — HTTP server
- **tsx** — dev runner with watch mode
- **Supabase Postgres** — subscribers + dispatch log
- **OpenAI** (`gpt-4o-mini` by default) — analysis of repo changes
- **Resend** — email delivery (briefing + confirmation)
- **GitHub Actions** — daily cron trigger + SSH deploy

## Quick start (local dev)

```bash
git clone https://github.com/juansoultrek/resend-daily-briefing.git
cd resend-daily-briefing
cp .env.example .env      # fill in RESEND_API_KEY, OPENAI_API_KEY, GH_TOKEN, SUPABASE_*
npm ci
npm run dev               # http://localhost:8787/health
```

Without keys filled in, the server still boots; `/health` reports which keys
are present, and service endpoints return a clear error until the matching
key is set.

## Project layout

```
src/
  server.ts        Express app + /health
  config.ts        env reading + validation
  github/          GitHub API client + normalizer      (added later)
  ai/              OpenAI analyzer + prompts           (added later)
  email/           React Email template + Resend sender (added later)
  db/              Supabase client + subscribers CRUD  (added later)
  routes/          public, cron, unsubscribe endpoints (added later)
  public/          landing page + form (static HTML)   (added later)
```

## Commit style

`Resend Daily Briefing | short imperative summary`

## License

MIT
