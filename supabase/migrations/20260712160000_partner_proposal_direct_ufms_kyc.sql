-- Post-EOI formal UFMS proposal and direct-to-UFMS KYC handoff.
--
-- Foundation-1 may store the issued and client-signed formal proposal, but must
-- not receive or store the bank KYC pack. The client sends those documents
-- directly to info@ufms.net. This schema stores only the client's transmission
-- confirmation, recipient, attestation version and timestamps — never KYC file
-- names, paths, hashes, bytes or extracted values.

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
      'partner_proposal_ready',
      'partner_proposal_signed',
      'kyc_direct_submitted'
    )
  );

alter table public.migration_cases
  add column if not exists active_partner_proposal_id uuid,
  add column if not exists partner_proposal_ready_at timestamptz,
  add column if not exists partner_proposal_signed_at timestamptz,
  add column if not exists direct_kyc_confirmed_at timestamptz;

create table if not exists public.migration_case_partner_proposals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.migration_cases(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'issued',
  issued_at timestamptz not null default now(),
  issued_by text not null,
  issued_original_name text not null,
  issued_storage_path text not null unique,
  issued_content_type text not null,
  issued_file_size_bytes bigint not null,
  issued_sha256 text not null,
  signed_at timestamptz,
  signed_original_name text,
  signed_storage_path text unique,
  signed_content_type text,
  signed_file_size_bytes bigint,
  signed_sha256 text,
  direct_kyc_confirmed_at timestamptz,
  direct_kyc_confirmed_by text,
  direct_kyc_recipient text,
  direct_kyc_attestation_version text,
  constraint migration_case_partner_proposals_status_check
    check (status in ('issued', 'signed', 'direct_kyc_confirmed')),
  constraint migration_case_partner_proposals_issued_size_check
    check (issued_file_size_bytes > 0 and issued_file_size_bytes <= 20971520),
  constraint migration_case_partner_proposals_issued_sha_check
    check (issued_sha256 ~ '^[0-9a-f]{64}$'),
  constraint migration_case_partner_proposals_signed_size_check
    check (signed_file_size_bytes is null or (signed_file_size_bytes > 0 and signed_file_size_bytes <= 20971520)),
  constraint migration_case_partner_proposals_signed_sha_check
    check (signed_sha256 is null or signed_sha256 ~ '^[0-9a-f]{64}$'),
  constraint migration_case_partner_proposals_kyc_recipient_check
    check (direct_kyc_recipient is null or lower(direct_kyc_recipient) = 'info@ufms.net'),
  constraint migration_case_partner_proposals_kyc_confirmation_check
    check (
      (status <> 'direct_kyc_confirmed') or (
        signed_at is not null
        and direct_kyc_confirmed_at is not null
        and direct_kyc_confirmed_by is not null
        and lower(direct_kyc_recipient) = 'info@ufms.net'
        and direct_kyc_attestation_version is not null
      )
    )
);

alter table public.migration_cases
  drop constraint if exists migration_cases_active_partner_proposal_id_fkey;
alter table public.migration_cases
  add constraint migration_cases_active_partner_proposal_id_fkey
  foreign key (active_partner_proposal_id)
  references public.migration_case_partner_proposals(id)
  on delete set null;

create index if not exists migration_case_partner_proposals_case_created_idx
  on public.migration_case_partner_proposals(case_id, created_at desc);
create index if not exists migration_case_partner_proposals_status_idx
  on public.migration_case_partner_proposals(status, updated_at desc);

alter table public.migration_case_partner_proposals enable row level security;
revoke all on table public.migration_case_partner_proposals from anon, authenticated;
grant all on table public.migration_case_partner_proposals to service_role;

drop policy if exists "service role manages migration case partner proposals"
  on public.migration_case_partner_proposals;
create policy "service role manages migration case partner proposals"
on public.migration_case_partner_proposals
for all to service_role using (true) with check (true);

drop trigger if exists migration_case_partner_proposals_updated_at
  on public.migration_case_partner_proposals;
create trigger migration_case_partner_proposals_updated_at
before update on public.migration_case_partner_proposals
for each row execute function public.oneos_set_updated_at();
