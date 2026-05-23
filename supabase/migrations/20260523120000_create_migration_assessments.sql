create extension if not exists pgcrypto;

create table if not exists public.migration_assessments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
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
  status text not null default 'draft_assessment',
  constraint migration_assessments_status_check check (
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
  )
);

create table if not exists public.migration_documents (
  id text primary key,
  assessment_id uuid not null references public.migration_assessments(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  file_url text,
  uploaded_at timestamptz not null default now(),
  status text not null default 'received',
  constraint migration_documents_document_type_check check (
    document_type in ('expression_of_interest', 'utility_bill')
  )
);

create index if not exists migration_assessments_email_idx
  on public.migration_assessments (email);

create index if not exists migration_documents_assessment_id_idx
  on public.migration_documents (assessment_id);

alter table public.migration_assessments enable row level security;
alter table public.migration_documents enable row level security;
