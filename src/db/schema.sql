-- Resend Daily Briefing — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query → Run).
-- Safe to re-run: uses IF NOT EXISTS for tables and indexes.

-- ============================================================================
-- subscribers: one row per person subscribed to the briefing.
-- The `providers` column stores provider slugs (e.g. ['resend', 'supabase']),
-- NOT full repo paths. The mapping slug → repos lives in src/providers.ts.
-- ============================================================================
create table if not exists public.subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  name            text,
  token           text not null unique,
  providers       text[] not null default '{}',
  confirmed       boolean not null default false,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz
);

create index if not exists subscribers_email_idx on public.subscribers (email);
create index if not exists subscribers_token_idx on public.subscribers (token);

-- ============================================================================
-- dispatches: one row per email sent per subscriber per day.
-- repos_included records which provider repos had news in that run.
-- ============================================================================
create table if not exists public.dispatches (
  id             uuid primary key default gen_random_uuid(),
  run_date       date not null,
  subscriber_id  uuid not null references public.subscribers (id) on delete restrict,
  repos_included text[] not null default '{}',
  status         text not null check (status in ('sent', 'failed', 'skipped')),
  resend_id      text,
  error          text,
  created_at     timestamptz not null default now()
);

create index if not exists dispatches_run_date_idx on public.dispatches (run_date);
create index if not exists dispatches_subscriber_idx on public.dispatches (subscriber_id);

-- ============================================================================
-- Row Level Security
-- Enable RLS but add NO policies. This means:
--   - anon key (frontend): blocked — cannot read or write
--   - service_role key (server): bypasses RLS — full access
-- Our Express server uses the service_role key, so it can do everything.
-- The anon key is never used against these tables (all access goes through
-- our Express endpoints, which validate input and use the service_role key).
-- ============================================================================
alter table public.subscribers enable row level security;
alter table public.dispatches enable row level security;

-- ============================================================================
-- Helpful comment for anyone browsing the schema in the dashboard
-- ============================================================================
comment on table public.subscribers is 'Subscribers to the Resend Daily Briefing. providers[] stores slugs from src/providers.ts.';
comment on table public.dispatches is 'Log of emails sent. One row per subscriber per day. status: sent | failed | skipped.';
