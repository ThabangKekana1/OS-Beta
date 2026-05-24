create extension if not exists pgcrypto;

create or replace function public.oneos_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.migration_assessments (
  id uuid primary key default gen_random_uuid(),
  profile_id text,
  lead_id text,
  client_profile_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text not null,
  company_registration_number text,
  monthly_spend numeric not null,
  monthly_kwh numeric not null,
  annual_spend numeric not null,
  ten_year_spend numeric not null,
  business_type text,
  province text,
  utility_provider text,
  pain_point text,
  qualification_status text not null,
  recommended_pathway text not null,
  solar_monthly_saving numeric not null,
  solar_annual_saving numeric not null,
  solar_ten_year_saving numeric not null,
  solar_saving_percentage numeric not null,
  wheeling_conservative_monthly_saving numeric not null,
  wheeling_conservative_annual_saving numeric not null,
  wheeling_conservative_ten_year_saving numeric not null,
  wheeling_conservative_percentage numeric not null,
  wheeling_best_monthly_saving numeric not null,
  wheeling_best_annual_saving numeric not null,
  wheeling_best_ten_year_saving numeric not null,
  wheeling_best_percentage numeric not null,
  status text not null default 'draft_assessment'
);

alter table public.migration_assessments
  add column if not exists profile_id text,
  add column if not exists lead_id text,
  add column if not exists client_profile_id text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'migration_assessments_status_check'
      and conrelid = 'public.migration_assessments'::regclass
  ) then
    alter table public.migration_assessments
      add constraint migration_assessments_status_check check (
        status in (
          'draft_assessment',
          'instant_report_generated',
          'registered',
          'utility_profile_uploaded',
          'proposal_pending',
          'proposal_ready',
          'term_sheet_pending',
          'approved',
          'declined'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'migration_assessments_profile_id_key'
      and conrelid = 'public.migration_assessments'::regclass
  ) then
    alter table public.migration_assessments
      add constraint migration_assessments_profile_id_key unique (profile_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'migration_assessments_lead_id_fkey'
      and conrelid = 'public.migration_assessments'::regclass
  ) then
    alter table public.migration_assessments
      add constraint migration_assessments_lead_id_fkey
      foreign key (lead_id)
      references public.oneos_admin_leads(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'migration_assessments_client_profile_id_fkey'
      and conrelid = 'public.migration_assessments'::regclass
  ) then
    alter table public.migration_assessments
      add constraint migration_assessments_client_profile_id_fkey
      foreign key (client_profile_id)
      references public.oneos_admin_leads(client_profile_id)
      on delete set null
      not valid;
  end if;
end $$;

create table if not exists public.migration_documents (
  id text primary key,
  assessment_id uuid not null,
  profile_id text,
  lead_id text,
  client_profile_id text,
  document_type text not null,
  file_name text not null,
  file_url text,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'received'
);

alter table public.migration_documents
  add column if not exists profile_id text,
  add column if not exists lead_id text,
  add column if not exists client_profile_id text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'migration_documents_assessment_id_fkey'
      and conrelid = 'public.migration_documents'::regclass
  ) then
    alter table public.migration_documents
      add constraint migration_documents_assessment_id_fkey
      foreign key (assessment_id)
      references public.migration_assessments(id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'migration_documents_document_type_check'
      and conrelid = 'public.migration_documents'::regclass
  ) then
    alter table public.migration_documents
      add constraint migration_documents_document_type_check check (
        document_type in ('expression_of_interest', 'utility_bill')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'migration_documents_lead_id_fkey'
      and conrelid = 'public.migration_documents'::regclass
  ) then
    alter table public.migration_documents
      add constraint migration_documents_lead_id_fkey
      foreign key (lead_id)
      references public.oneos_admin_leads(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'migration_documents_client_profile_id_fkey'
      and conrelid = 'public.migration_documents'::regclass
  ) then
    alter table public.migration_documents
      add constraint migration_documents_client_profile_id_fkey
      foreign key (client_profile_id)
      references public.oneos_admin_leads(client_profile_id)
      on delete set null
      not valid;
  end if;
end $$;

create index if not exists migration_assessments_email_idx
  on public.migration_assessments (email);

create index if not exists migration_assessments_profile_id_idx
  on public.migration_assessments (profile_id)
  where profile_id is not null;

create index if not exists migration_assessments_lead_id_idx
  on public.migration_assessments (lead_id)
  where lead_id is not null;

create index if not exists migration_assessments_client_profile_id_idx
  on public.migration_assessments (client_profile_id)
  where client_profile_id is not null;

create index if not exists migration_documents_assessment_id_idx
  on public.migration_documents (assessment_id);

create index if not exists migration_documents_lead_id_idx
  on public.migration_documents (lead_id)
  where lead_id is not null;

create index if not exists migration_documents_client_profile_id_idx
  on public.migration_documents (client_profile_id)
  where client_profile_id is not null;

drop trigger if exists migration_assessments_updated_at on public.migration_assessments;
create trigger migration_assessments_updated_at
before update on public.migration_assessments
for each row execute function public.oneos_set_updated_at();

drop trigger if exists migration_documents_updated_at on public.migration_documents;
create trigger migration_documents_updated_at
before update on public.migration_documents
for each row execute function public.oneos_set_updated_at();

drop trigger if exists migration_portal_profiles_updated_at on public.migration_portal_profiles;
create trigger migration_portal_profiles_updated_at
before update on public.migration_portal_profiles
for each row execute function public.oneos_set_updated_at();

alter table public.migration_assessments enable row level security;
alter table public.migration_documents enable row level security;
alter table public.migration_portal_profiles enable row level security;

drop policy if exists "service role manages migration assessments" on public.migration_assessments;
create policy "service role manages migration assessments"
on public.migration_assessments
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages migration documents" on public.migration_documents;
create policy "service role manages migration documents"
on public.migration_documents
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages migration portal profiles" on public.migration_portal_profiles;
create policy "service role manages migration portal profiles"
on public.migration_portal_profiles
for all
to service_role
using (true)
with check (true);