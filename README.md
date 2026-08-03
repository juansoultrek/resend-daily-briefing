# Resend Daily Briefing

**An AI-analyzed morning email of the GitHub changes that actually matter.**

Each day, subscribers get one briefing covering the providers they follow
(Resend, Supabase, Nango). The model does not dump commit lists — it answers:

- What actually changed?
- Why does it matter?
- Who is affected?
- Feature, bugfix, perf, refactor, or possible breaking change?
- Worth opening GitHub today?

**Read it in under two minutes. Decide where to spend attention.**

| | |
|---|---|
| **Live demo** | [juansoultrek.com/resend](https://juansoultrek.com/resend) |
| **Portfolio** | [juansoultrek.com](https://juansoultrek.com) |
| **Repo** | [github.com/juansoultrek/resend-daily-briefing](https://github.com/juansoultrek/resend-daily-briefing) |

---

## Why I built this

I wanted a portfolio piece that shows **modern API integration + AI + email UX**,
not another contact form.

Resend is the product being showcased: the briefing email *is* the product.
GitHub supplies the signal, OpenAI turns noise into judgment, Supabase stores
subscriptions, and a cron job runs the pipeline every morning.

The three default providers (Resend, Supabase, Nango) are intentional — they are
the tools this portfolio already explores, and they give a coherent “devtools
watchlist” story.

---

## Why Resend

This project is built to demonstrate Resend, not “any SMTP API”.

| Capability | How this project uses it |
|---|---|
| **Verified domain sending** | `RESEND_FROM` on a DNS-verified domain (SPF / DKIM / DMARC) |
| **Transactional product email** | Daily briefing HTML designed for readability in mail clients |
| **Double opt-in** | Confirmation email before any briefing is sent |
| **List-Unsubscribe headers** | One-click unsubscribe + manage links in every briefing |
| **Resend Node SDK** | Thin `Mailer` wrapper around `resend.emails.send()` |

If you only look at one line of code (`emails.send`), you miss the point:
the **email design, confirmation flow, and deliverability setup** are the showcase.

---

## How it works

```
GitHub API ──► normalize events (24h window)
                      │
                      ▼
              OpenAI (JSON + Zod schema)
                      │
                      ▼
         Per-provider analysis (cached)
                      │
                      ▼
     Aggregate by subscriber preferences
                      │
                      ▼
         Resend ──► subscriber inbox
                      │
                      ▼
              Supabase dispatch log
```

1. **Subscribe** — email + optional name + provider checkboxes.
2. **Confirm** — double opt-in link (no briefings until confirmed).
3. **Cron** — `POST /cron/briefing` with `X-Cron-Secret`.
4. **Collect** — commits / PRs / issues for each provider’s repos.
5. **Analyze** — one AI pass per provider (shared across subscribers).
6. **Send** — one email per subscriber; **skip** if nothing notable that day.
7. **Idempotent** — `dispatches` prevents double-sends for the same date.

---

## Architecture

```
src/
  server.ts           Express routes (health, subscribe, cron, pages)
  config.ts           Env loading + validation
  providers.ts        Provider → repo mapping (add a provider in one place)
  github/             REST client + event normalizer
  ai/                 Prompts, Zod schema, OpenAI analyzer
  email/              Resend client + briefing + confirmation HTML
  cron/               Daily briefing orchestration + analysis cache
  db/                 Supabase repos (subscribers, dispatches)
  auth/               Opaque confirm / manage / unsubscribe tokens
public/               Subscribe / manage / confirm / unsubscribe UI
```

**Separation of concerns (intentionally simple):**

| Layer | Responsibility |
|---|---|
| `github/` | Fetch + normalize — no AI, no email |
| `ai/` | Structured analysis — no GitHub, no Resend |
| `email/` | Render + send — no DB, no GitHub |
| `cron/` | Orchestrate the pipeline |
| `providers.ts` | Single place to add Stripe / Vercel / etc. |

AI output is validated with Zod (`change_type`, `what_changed`, `why_it_matters`,
`who_is_affected`, `should_open_github`, `confidence`, `url`).

---

## What’s in the email

Each briefing includes, per provider:

- Accent bar + short day summary
- Highlights with change-type badges (`BREAKING`, `SECURITY`, `NEW`, `FIX`, …)
- **What changed / Why it matters / Who is affected**
- Confidence + “worth opening GitHub?” signal
- Direct links to the PR / commit / issue
- Manage + Unsubscribe footer

Quiet providers are omitted from a busy day when appropriate —
subscribers are never spammed with empty digests when *nothing* notable happened.

---

## Tech stack

- **Node.js 22+** · **TypeScript 5.9** · **Express 5**
- **Resend** — briefing + confirmation emails
- **OpenAI** (`gpt-4o-mini` by default) — analysis
- **Supabase Postgres** — subscribers + dispatch log
- **GitHub REST API** — commits, pulls, issues
- **GitHub Actions** — SSH deploy + scheduled daily briefing cron

---

## Quick start

```bash
git clone https://github.com/juansoultrek/resend-daily-briefing.git
cd resend-daily-briefing
cp .env.example .env   # fill in keys (see below)
npm ci
npm run dev            # http://localhost:8787/health
```

With `APP_BASE_PATH=/resend` (production style):

- UI → `http://localhost:8787/resend`
- Health → `http://localhost:8787/resend/health`

### Required env

| Variable | Purpose |
|---|---|
| `GH_TOKEN` | GitHub API (higher rate limits) |
| `OPENAI_API_KEY` | Analysis |
| `RESEND_API_KEY` / `RESEND_FROM` | Send mail from a verified domain |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Subscribers + dispatches |
| `CRON_SECRET` | Protects `POST /cron/briefing` |

Optional: `APP_BASE_PATH`, `APP_BASE_URL`, `OPENAI_MODEL`, `PORT`.

See [`.env.example`](.env.example) for comments on each value.

### Trigger a briefing manually

```bash
curl -X POST https://juansoultrek.com/resend/cron/briefing \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -d '{}'
```

### Daily cron (GitHub Actions)

The workflow [`.github/workflows/daily-briefing.yml`](.github/workflows/daily-briefing.yml)
runs on a schedule (`0 13 * * *` UTC ≈ 7:00 AM Mexico City) and also supports
**Actions → Daily briefing → Run workflow**.

Required GitHub secret (same `production` environment as deploy, or repo secrets):

| Secret | Value |
|---|---|
| `CRON_SECRET` | Same string as the app’s `CRON_SECRET` |
| `BRIEFING_CRON_URL` | Optional override; defaults to `https://juansoultrek.com/resend/cron/briefing` |

After each run, open **Actions → Daily briefing** for the HTTP response (`sent` / `skipped` / `failed`).

---

## Adding a provider

Edit [`src/providers.ts`](src/providers.ts) — one object with `slug`, `displayName`,
`tagline`, `accent`, and `repos[]`. Existing subscribers keep their slug; they
automatically pick up new repos for that provider. No DB migration.

---

## Future improvements

- **React Email** templates for the briefing (more Resend-native authoring)
- **Delivery webhooks** (delivered / bounced / complained) logged next to dispatches
- Daily metrics footer (repos scanned, events analyzed, processing time)
- Weekly digest mode
- Optional Slack / Discord sinks for the same analysis payload

---

## Lessons learned

- **Double opt-in is non-negotiable** for a public subscribe form — confirmation
  email is part of the Resend story, not overhead.
- **Cache analysis per provider**, not per subscriber — 50 people on Resend
  should not mean 50 OpenAI calls.
- **Skip quiet days** — empty digests train people to ignore you.
- **Absolute asset paths under a subpath** (`/resend`) matter on shared hosting;
  relative `assets/` breaks when the URL has no trailing slash.
- **LiteSpeed may 403 bare POSTs** — always send `Content-Type: application/json`
  from cron `curl`.

---

## Commit style

`Resend Daily Briefing | short imperative summary`

## License

MIT
