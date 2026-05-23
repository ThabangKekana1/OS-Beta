-- Dashboard operator audit events for admin sales surveillance.
-- Service-role only. The app records login/logout events after Supabase Auth.

alter table if exists public.oneos_users
  add column if not exists last_logout_at timestamptz,
  add column if not exists last_seen_at timestamptz;

create table if not exists public.oneos_user_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.oneos_users(id) on delete set null,
  email text not null,
  role text,
  agent_id text,
  event_type text not null check (event_type in ('login', 'logout')),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint oneos_user_audit_events_email_lower check (email = lower(email))
);

create index if not exists oneos_user_audit_events_user_idx
  on public.oneos_user_audit_events(user_id, created_at desc)
  where user_id is not null;

create index if not exists oneos_user_audit_events_agent_idx
  on public.oneos_user_audit_events(agent_id, created_at desc)
  where agent_id is not null;

create index if not exists oneos_user_audit_events_email_idx
  on public.oneos_user_audit_events(email, created_at desc);

create index if not exists oneos_user_audit_events_created_idx
  on public.oneos_user_audit_events(created_at desc);

alter table public.oneos_user_audit_events enable row level security;

drop policy if exists "service role manages oneos user audit events" on public.oneos_user_audit_events;
create policy "service role manages oneos user audit events"
on public.oneos_user_audit_events
for all
to service_role
using (true)
with check (true);

revoke all on public.oneos_user_audit_events from anon, authenticated;
