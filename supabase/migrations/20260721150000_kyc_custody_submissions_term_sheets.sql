-- KYC custody (Model B), readiness gate, funder submissions and term sheets.
--
-- Decision record 2026-07-21 (06_OUTREACH_TO_TERM_SHEET_SYSTEM_PLAN.md §6):
-- Foundation-1 now takes custody of the six-item bank KYC pack inside the
-- migration case. Custody exists so the pack can be verified complete BEFORE
-- a funder submission slot is consumed, released to named recipients with an
-- exact manifest, and mined (with consent under the accepted terms) as
-- structured data for the case record. The previous zero-custody
-- direct-to-UFMS attestation flow is superseded; its stage and columns are
-- retained for historical rows only.

-- ---------------------------------------------------------------------------
-- Stage machine
-- ---------------------------------------------------------------------------

alter table public.migration_cases
  drop constraint if exists migration_cases_stage_check;
alter table public.migration_cases
  add constraint migration_cases_stage_check check (
    stage in (
      'bill_pack_required',
      'bill_pack_processing',
      'bill_pack_review',
      'proposal_ready',
      'proposal_not_recommended',
      'eoi_signed',
      'kyc_ready',
      'submitted_to_funder',
      'partner_proposal_ready',
      'partner_proposal_signed',
      'kyc_verified',
      'kyc_handed_off',
      'term_sheet_issued',
      -- legacy zero-custody stage, kept for historical rows
      'kyc_direct_submitted'
    )
  );

alter table public.migration_cases
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists kyc_self_check jsonb,
  add column if not exists kyc_readiness_confirmed_at timestamptz,
  add column if not exists submitted_to_funder_at timestamptz,
  add column if not exists funder_sla_due_at timestamptz,
  add column if not exists funder_acknowledged_at timestamptz,
  add column if not exists kyc_pack_complete_at timestamptz,
  add column if not exists kyc_verified_at timestamptz,
  add column if not exists kyc_handed_off_at timestamptz,
  add column if not exists term_sheet_issued_at timestamptz,
  add column if not exists active_submission_id uuid;

-- ---------------------------------------------------------------------------
-- KYC readiness attestation (S7 gate) — one living record per case
-- ---------------------------------------------------------------------------

create table if not exists public.migration_case_kyc_readiness (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.migration_cases(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null,
  confirmed_by text not null,
  attestation_version text not null,
  items jsonb not null,
  fix_it_plan jsonb not null default '[]'::jsonb,
  reassess_on date,
  confirmed_at timestamptz,
  constraint migration_case_kyc_readiness_status_check
    check (status in ('confirmed', 'parked')),
  constraint migration_case_kyc_readiness_confirmed_check
    check (status <> 'confirmed' or confirmed_at is not null)
);

-- ---------------------------------------------------------------------------
-- KYC document custody (the data asset)
-- ---------------------------------------------------------------------------

create table if not exists public.migration_case_kyc_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.migration_cases(id) on delete cascade,
  created_at timestamptz not null default now(),
  document_type text not null,
  original_name text not null,
  storage_path text not null unique,
  content_type text not null,
  file_size_bytes bigint not null,
  sha256 text not null,
  status text not null default 'received',
  review_note text,
  reviewed_at timestamptz,
  reviewed_by text,
  extracted jsonb not null default '{}'::jsonb,
  extraction_version text,
  constraint migration_case_kyc_documents_type_check check (
    document_type in (
      'company_registration',
      'director_fica',
      'audited_financials',
      'management_accounts',
      'bank_statements',
      'tax_clearance'
    )
  ),
  constraint migration_case_kyc_documents_status_check
    check (status in ('received', 'verified', 'rejected')),
  constraint migration_case_kyc_documents_size_check
    check (file_size_bytes > 0 and file_size_bytes <= 20971520),
  constraint migration_case_kyc_documents_sha256_check
    check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint migration_case_kyc_documents_review_check
    check (status = 'received' or (reviewed_at is not null and reviewed_by is not null)),
  unique (case_id, sha256)
);

-- ---------------------------------------------------------------------------
-- Funder submissions (the drum) — SLA clock per submission
-- ---------------------------------------------------------------------------

create table if not exists public.migration_case_submissions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.migration_cases(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  channel text not null,
  submitted_at timestamptz not null default now(),
  submitted_by text not null,
  batch_reference text,
  manifest jsonb not null default '{}'::jsonb,
  sla_days integer not null default 7,
  sla_due_at timestamptz not null,
  acknowledged_at timestamptz,
  outcome text not null default 'pending',
  outcome_at timestamptz,
  notes text,
  constraint migration_case_submissions_channel_check
    check (channel in ('eden_ufms', 'awaken_wheeling', 'both')),
  constraint migration_case_submissions_sla_days_check
    check (sla_days between 1 and 60),
  constraint migration_case_submissions_outcome_check
    check (outcome in ('pending', 'proposal_received', 'declined', 'withdrawn'))
);

alter table public.migration_cases
  drop constraint if exists migration_cases_active_submission_id_fkey;
alter table public.migration_cases
  add constraint migration_cases_active_submission_id_fkey
  foreign key (active_submission_id)
  references public.migration_case_submissions(id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- Term sheets (the deal book) — a case may hold Eden AND Awaken term sheets
-- ---------------------------------------------------------------------------

create table if not exists public.migration_case_term_sheets (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.migration_cases(id) on delete cascade,
  created_at timestamptz not null default now(),
  pathway text not null,
  source text not null,
  issued_at timestamptz not null,
  deal_value_rands numeric(16, 2) not null,
  reference text,
  notes text,
  original_name text,
  storage_path text unique,
  content_type text,
  file_size_bytes bigint,
  sha256 text,
  recorded_by text not null,
  constraint migration_case_term_sheets_pathway_check
    check (pathway in ('eden', 'nightshade', 'awaken')),
  constraint migration_case_term_sheets_source_check
    check (source in ('funder_direct', 'foundation1')),
  constraint migration_case_term_sheets_value_check
    check (deal_value_rands > 0),
  constraint migration_case_term_sheets_size_check
    check (file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 20971520)),
  constraint migration_case_term_sheets_sha256_check
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$')
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists migration_case_kyc_documents_case_type_idx
  on public.migration_case_kyc_documents (case_id, document_type, created_at desc);
create index if not exists migration_case_kyc_documents_status_idx
  on public.migration_case_kyc_documents (status, created_at desc);
create index if not exists migration_case_submissions_case_created_idx
  on public.migration_case_submissions (case_id, created_at desc);
create index if not exists migration_case_submissions_sla_idx
  on public.migration_case_submissions (outcome, sla_due_at);
create index if not exists migration_case_term_sheets_case_idx
  on public.migration_case_term_sheets (case_id, created_at desc);
create index if not exists migration_case_term_sheets_issued_idx
  on public.migration_case_term_sheets (issued_at desc);

-- ---------------------------------------------------------------------------
-- RLS: service-role only, matching the rest of the case pipeline
-- ---------------------------------------------------------------------------

alter table public.migration_case_kyc_readiness enable row level security;
alter table public.migration_case_kyc_documents enable row level security;
alter table public.migration_case_submissions enable row level security;
alter table public.migration_case_term_sheets enable row level security;

revoke all on table public.migration_case_kyc_readiness from anon, authenticated;
revoke all on table public.migration_case_kyc_documents from anon, authenticated;
revoke all on table public.migration_case_submissions from anon, authenticated;
revoke all on table public.migration_case_term_sheets from anon, authenticated;

grant all on table public.migration_case_kyc_readiness to service_role;
grant all on table public.migration_case_kyc_documents to service_role;
grant all on table public.migration_case_submissions to service_role;
grant all on table public.migration_case_term_sheets to service_role;

drop policy if exists "service role manages migration case kyc readiness"
  on public.migration_case_kyc_readiness;
create policy "service role manages migration case kyc readiness"
on public.migration_case_kyc_readiness for all to service_role using (true) with check (true);

drop policy if exists "service role manages migration case kyc documents"
  on public.migration_case_kyc_documents;
create policy "service role manages migration case kyc documents"
on public.migration_case_kyc_documents for all to service_role using (true) with check (true);

drop policy if exists "service role manages migration case submissions"
  on public.migration_case_submissions;
create policy "service role manages migration case submissions"
on public.migration_case_submissions for all to service_role using (true) with check (true);

drop policy if exists "service role manages migration case term sheets"
  on public.migration_case_term_sheets;
create policy "service role manages migration case term sheets"
on public.migration_case_term_sheets for all to service_role using (true) with check (true);

drop trigger if exists migration_case_kyc_readiness_updated_at
  on public.migration_case_kyc_readiness;
create trigger migration_case_kyc_readiness_updated_at
before update on public.migration_case_kyc_readiness
for each row execute function public.oneos_set_updated_at();

drop trigger if exists migration_case_submissions_updated_at
  on public.migration_case_submissions;
create trigger migration_case_submissions_updated_at
before update on public.migration_case_submissions
for each row execute function public.oneos_set_updated_at();
