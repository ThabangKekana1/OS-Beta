-- The Selemo Initiative: a public pledge for food security in South Africa,
-- powered by the sun. Public surfaces show the COMPANY only; the person who
-- signed stays private to the platform.
create table if not exists public.foundation1_selemo_pledges (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.migration_cases(id) on delete set null,
  company_name text not null,
  signer_name text not null,
  signer_position text not null default '',
  signed_at timestamptz not null default now(),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  unique (case_id)
);
alter table public.foundation1_selemo_pledges enable row level security;
