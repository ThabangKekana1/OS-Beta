-- In-platform signing of issued funder documents (formal partner proposals,
-- term sheets, other case documents). The client initials EVERY page and
-- signs the final page inside the platform; the signed rendition is stored
-- alongside the untouched original with SHA-256 hashes of both, plus a full
-- audit record (signer, per-page initial timestamps, IP, engine version).
-- Additive only; extends the partner-proposal signing pattern.

create table if not exists public.migration_case_document_signatures (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.migration_cases(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  document_kind text not null default 'partner_proposal',
  document_ref uuid,
  document_title text not null,
  source_storage_path text not null,
  source_sha256 text not null,
  page_count integer,
  status text not null default 'awaiting_signature',
  signer_name text,
  signer_position text,
  signer_initials text,
  signer_ip text,
  page_initials jsonb not null default '[]'::jsonb,
  signed_at timestamptz,
  signed_storage_path text unique,
  signed_sha256 text,
  signed_file_size_bytes bigint,
  submitted_at timestamptz,
  signing_version text not null default 'doc-sign-2026-08-15.1',
  constraint migration_case_document_signatures_kind_check
    check (document_kind in ('partner_proposal', 'term_sheet', 'case_document')),
  constraint migration_case_document_signatures_status_check
    check (status in ('awaiting_signature', 'signed', 'submitted_by_client')),
  constraint migration_case_document_signatures_source_sha_check
    check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint migration_case_document_signatures_signed_sha_check
    check (signed_sha256 is null or signed_sha256 ~ '^[0-9a-f]{64}$'),
  constraint migration_case_document_signatures_page_count_check
    check (page_count is null or (page_count > 0 and page_count <= 80)),
  constraint migration_case_document_signatures_signed_size_check
    check (
      signed_file_size_bytes is null
      or (signed_file_size_bytes > 0 and signed_file_size_bytes <= 62914560)
    ),
  constraint migration_case_document_signatures_signed_consistency_check
    check (
      status = 'awaiting_signature'
      or (
        signed_at is not null
        and signed_storage_path is not null
        and signed_sha256 is not null
        and signer_name is not null
        and signer_initials is not null
      )
    ),
  constraint migration_case_document_signatures_submitted_consistency_check
    check (status <> 'submitted_by_client' or submitted_at is not null),
  constraint migration_case_document_signatures_document_unique
    unique (case_id, document_kind, document_ref)
);

create index if not exists migration_case_document_signatures_case_created_idx
  on public.migration_case_document_signatures(case_id, created_at desc);
create index if not exists migration_case_document_signatures_status_idx
  on public.migration_case_document_signatures(status, updated_at desc);

alter table public.migration_case_document_signatures enable row level security;
revoke all on table public.migration_case_document_signatures from anon, authenticated;
grant all on table public.migration_case_document_signatures to service_role;

drop policy if exists "service role manages migration case document signatures"
  on public.migration_case_document_signatures;
create policy "service role manages migration case document signatures"
on public.migration_case_document_signatures
for all to service_role using (true) with check (true);

drop trigger if exists migration_case_document_signatures_updated_at
  on public.migration_case_document_signatures;
create trigger migration_case_document_signatures_updated_at
before update on public.migration_case_document_signatures
for each row execute function public.oneos_set_updated_at();
