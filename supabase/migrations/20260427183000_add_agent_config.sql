-- Durable agent guardrails / prompt configuration.

create table if not exists public.oneos_agent_config (
  id text primary key default 'default',
  system_prompt text,
  onboarding_playbook text,
  do_not_say jsonb not null default '[]'::jsonb,
  escalation_triggers jsonb not null default '[]'::jsonb,
  tone text,
  mode_overrides jsonb not null default '{}'::jsonb,
  prequalification jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text,
  created_at timestamptz not null default now(),
  constraint oneos_agent_config_singleton check (id = 'default')
);

drop trigger if exists oneos_agent_config_updated_at on public.oneos_agent_config;
create trigger oneos_agent_config_updated_at
before update on public.oneos_agent_config
for each row execute function public.oneos_set_updated_at();

alter table public.oneos_agent_config enable row level security;

drop policy if exists "service role manages oneos agent config" on public.oneos_agent_config;
create policy "service role manages oneos agent config"
on public.oneos_agent_config
for all
to service_role
using (true)
with check (true);

revoke all on public.oneos_agent_config from anon, authenticated;

insert into public.oneos_agent_config (id)
values ('default')
on conflict (id) do nothing;
