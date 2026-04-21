-- 1OS backend schema.
-- Applies durable relational storage for workspace state, CRM clients,
-- sales leads, document metadata, and public EOI signing tokens.

create extension if not exists pgcrypto;

create table if not exists public.oneos_admin_state (
  id text primary key default 'singleton',
  active_lead_id text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oneos_admin_state_singleton check (id = 'singleton')
);

create table if not exists public.oneos_admin_leads (
  id text primary key,
  client_profile_id text not null unique,
  company text not null,
  business_registration_number text,
  contact_name text,
  contact_email text,
  owner_id text not null,
  stage text not null,
  priority text not null,
  readiness_score integer not null default 0,
  estimated_value_zar bigint not null default 0,
  eoi_signing_token text unique,
  eoi_signed_at timestamptz,
  onboarding_completed_at timestamptz,
  disqualified_at timestamptz,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oneos_sales_leads (
  id text primary key,
  owner_id text not null,
  contact_name text not null,
  company text not null,
  email text not null,
  qualification_stage text not null,
  qualification_reason text,
  status text not null,
  converted_client_profile_id text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oneos_client_documents (
  id text primary key,
  lead_id text not null references public.oneos_admin_leads(id) on delete cascade,
  client_profile_id text not null,
  title text not null,
  category text not null,
  file_type text not null,
  status text not null,
  uploaded_by text not null,
  uploaded_by_type text not null,
  storage_path text,
  file_name text,
  content_type text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oneos_workspace_states (
  workspace_id text primary key,
  active_case_id text,
  active_workspace_id text not null,
  cases jsonb not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.oneos_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists oneos_admin_state_updated_at on public.oneos_admin_state;
create trigger oneos_admin_state_updated_at
before update on public.oneos_admin_state
for each row execute function public.oneos_set_updated_at();

drop trigger if exists oneos_admin_leads_updated_at on public.oneos_admin_leads;
create trigger oneos_admin_leads_updated_at
before update on public.oneos_admin_leads
for each row execute function public.oneos_set_updated_at();

drop trigger if exists oneos_sales_leads_updated_at on public.oneos_sales_leads;
create trigger oneos_sales_leads_updated_at
before update on public.oneos_sales_leads
for each row execute function public.oneos_set_updated_at();

drop trigger if exists oneos_client_documents_updated_at on public.oneos_client_documents;
create trigger oneos_client_documents_updated_at
before update on public.oneos_client_documents
for each row execute function public.oneos_set_updated_at();

drop trigger if exists oneos_workspace_states_updated_at on public.oneos_workspace_states;
create trigger oneos_workspace_states_updated_at
before update on public.oneos_workspace_states
for each row execute function public.oneos_set_updated_at();

create index if not exists oneos_admin_leads_owner_idx on public.oneos_admin_leads(owner_id);
create index if not exists oneos_admin_leads_stage_idx on public.oneos_admin_leads(stage);
create index if not exists oneos_admin_leads_client_profile_idx on public.oneos_admin_leads(client_profile_id);
create index if not exists oneos_admin_leads_eoi_token_idx on public.oneos_admin_leads(eoi_signing_token) where eoi_signing_token is not null;
create index if not exists oneos_admin_leads_payload_gin_idx on public.oneos_admin_leads using gin(payload);
create index if not exists oneos_sales_leads_owner_idx on public.oneos_sales_leads(owner_id);
create index if not exists oneos_sales_leads_status_idx on public.oneos_sales_leads(status);
create index if not exists oneos_sales_leads_email_idx on public.oneos_sales_leads(email);
create index if not exists oneos_client_documents_lead_idx on public.oneos_client_documents(lead_id);
create index if not exists oneos_client_documents_profile_idx on public.oneos_client_documents(client_profile_id);
create index if not exists oneos_client_documents_status_idx on public.oneos_client_documents(status);

alter table public.oneos_admin_state enable row level security;
alter table public.oneos_admin_leads enable row level security;
alter table public.oneos_sales_leads enable row level security;
alter table public.oneos_client_documents enable row level security;
alter table public.oneos_workspace_states enable row level security;

drop policy if exists "service role manages oneos admin state" on public.oneos_admin_state;
create policy "service role manages oneos admin state"
on public.oneos_admin_state
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages oneos admin leads" on public.oneos_admin_leads;
create policy "service role manages oneos admin leads"
on public.oneos_admin_leads
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages oneos sales leads" on public.oneos_sales_leads;
create policy "service role manages oneos sales leads"
on public.oneos_sales_leads
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages oneos client documents" on public.oneos_client_documents;
create policy "service role manages oneos client documents"
on public.oneos_client_documents
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages oneos workspace states" on public.oneos_workspace_states;
create policy "service role manages oneos workspace states"
on public.oneos_workspace_states
for all
to service_role
using (true)
with check (true);

insert into public.oneos_admin_state (id)
values ('singleton')
on conflict (id) do nothing;
