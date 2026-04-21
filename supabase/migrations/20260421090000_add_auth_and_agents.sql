-- 1OS production hardening: users, agents, auth sessions, rate limits.
-- All tables live in `public` (Data API never touches them; service-role only).

create extension if not exists pgcrypto;

-- =============================================================================
-- Agents (sales reps + admins). Seeded from app, looked up by id.
-- =============================================================================
create table if not exists public.oneos_agents (
  id text primary key,
  name text not null,
  role text not null check (role in ('Admin', 'Sales Agent', 'Sales Manager', 'RevOps')),
  region text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists oneos_agents_active_idx on public.oneos_agents(is_active) where is_active;

drop trigger if exists oneos_agents_updated_at on public.oneos_agents;
create trigger oneos_agents_updated_at
before update on public.oneos_agents
for each row execute function public.oneos_set_updated_at();

-- =============================================================================
-- Users (operators of the dashboard). Email + PBKDF2 password hash.
-- agent_id links a user to a row in oneos_agents (nullable).
-- =============================================================================
create table if not exists public.oneos_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  role text not null check (role in ('admin', 'sales')),
  password_hash text not null,
  agent_id text references public.oneos_agents(id) on delete set null,
  is_active boolean not null default true,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oneos_users_email_lower check (email = lower(email)),
  constraint oneos_users_password_format check (password_hash like 'pbkdf2:%')
);

create index if not exists oneos_users_email_idx on public.oneos_users(email);
create index if not exists oneos_users_role_idx on public.oneos_users(role);
create index if not exists oneos_users_agent_idx on public.oneos_users(agent_id) where agent_id is not null;

drop trigger if exists oneos_users_updated_at on public.oneos_users;
create trigger oneos_users_updated_at
before update on public.oneos_users
for each row execute function public.oneos_set_updated_at();

-- =============================================================================
-- Auth sessions. One row per active session token. Hash of token, not the token.
-- Allows server-side revocation and per-user session listing.
-- =============================================================================
create table if not exists public.oneos_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.oneos_users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip_address text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists oneos_auth_sessions_user_idx on public.oneos_auth_sessions(user_id);
create index if not exists oneos_auth_sessions_active_idx on public.oneos_auth_sessions(expires_at) where revoked_at is null;

-- =============================================================================
-- Rate limit buckets. Keyed by (scope, key). TTL via expires_at.
-- =============================================================================
create table if not exists public.oneos_rate_limits (
  scope text not null,
  key text not null,
  count integer not null default 0,
  window_started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (scope, key)
);

create index if not exists oneos_rate_limits_expires_idx on public.oneos_rate_limits(expires_at);

-- =============================================================================
-- RLS lockdown. Service role only — these tables must never be reachable from
-- the Data API by anon/authenticated roles.
-- =============================================================================
alter table public.oneos_agents enable row level security;
alter table public.oneos_users enable row level security;
alter table public.oneos_auth_sessions enable row level security;
alter table public.oneos_rate_limits enable row level security;

drop policy if exists "service role manages oneos agents" on public.oneos_agents;
create policy "service role manages oneos agents"
on public.oneos_agents
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages oneos users" on public.oneos_users;
create policy "service role manages oneos users"
on public.oneos_users
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages oneos auth sessions" on public.oneos_auth_sessions;
create policy "service role manages oneos auth sessions"
on public.oneos_auth_sessions
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages oneos rate limits" on public.oneos_rate_limits;
create policy "service role manages oneos rate limits"
on public.oneos_rate_limits
for all
to service_role
using (true)
with check (true);

-- Explicitly revoke from anon + authenticated for defense in depth.
revoke all on public.oneos_agents from anon, authenticated;
revoke all on public.oneos_users from anon, authenticated;
revoke all on public.oneos_auth_sessions from anon, authenticated;
revoke all on public.oneos_rate_limits from anon, authenticated;

-- =============================================================================
-- Helper: prune expired rate-limit rows. Schedule via pg_cron if available.
-- =============================================================================
create or replace function public.oneos_prune_rate_limits()
returns void
language sql
as $$
  delete from public.oneos_rate_limits where expires_at < now();
$$;

-- =============================================================================
-- Helper: prune expired or revoked sessions older than 7 days.
-- =============================================================================
create or replace function public.oneos_prune_auth_sessions()
returns void
language sql
as $$
  delete from public.oneos_auth_sessions
  where (expires_at < now() - interval '7 days')
     or (revoked_at is not null and revoked_at < now() - interval '7 days');
$$;
