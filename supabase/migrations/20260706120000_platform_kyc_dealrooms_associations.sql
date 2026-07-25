-- Platform expansion: full KYC document taxonomy, deal stages, funder deal
-- rooms with per-document grants + access logging, and association partners.
-- See "4. Foundation-1 OS/03_PLATFORM_BLUEPRINT.md" (process S0–S9).

-- ---------------------------------------------------------------------------
-- 1. Document taxonomy
-- Live client documents are stored in public.oneos_client_documents (written by
-- the platform's upload/admin flows). Add the taxonomy there. The legacy
-- public.migration_documents table (public-site intake) gets the same expanded
-- type list for forward-compatibility.
-- ---------------------------------------------------------------------------
alter table public.oneos_client_documents
  add column if not exists document_type text;

alter table public.oneos_client_documents
  drop constraint if exists oneos_client_documents_document_type_check;
alter table public.oneos_client_documents
  add constraint oneos_client_documents_document_type_check check (
    document_type is null or document_type in (
      'expression_of_interest',
      'utility_bill',
      'f1_proposal',
      'partner_proposal',
      'signed_proposal',
      'signed_mandate',
      'company_registration',
      'fica_director_id',
      'fica_proof_of_residence',
      'audited_financials',
      'management_accounts',
      'bank_statements',
      'tax_clearance',
      'power_of_attorney',
      'other'
    )
  );

alter table public.migration_documents
  drop constraint if exists migration_documents_document_type_check;

alter table public.migration_documents
  add constraint migration_documents_document_type_check check (
    document_type in (
      -- intake
      'expression_of_interest',
      'utility_bill',
      -- proposal cycle
      'f1_proposal',
      'partner_proposal',
      'signed_proposal',
      'signed_mandate',
      -- KYC / bankability pack (Nedbank requirement list)
      'company_registration',
      'fica_director_id',
      'fica_proof_of_residence',
      'audited_financials',
      'management_accounts',
      'bank_statements',
      'tax_clearance',
      -- misc
      'power_of_attorney',
      'other'
    )
  );

-- Track review state per document (client uploads -> F1 reviews -> accepted).
alter table public.migration_documents
  drop constraint if exists migration_documents_status_check;
alter table public.migration_documents
  add constraint migration_documents_status_check check (
    status in ('received', 'under_review', 'accepted', 'rejected', 'superseded')
  );

alter table public.migration_documents
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists file_size_bytes bigint,
  add column if not exists content_type text;

-- ---------------------------------------------------------------------------
-- 2. Deal stages (S0–S9) on the assessment record
-- ---------------------------------------------------------------------------
alter table public.migration_assessments
  drop constraint if exists migration_assessments_status_check;

alter table public.migration_assessments
  add constraint migration_assessments_status_check check (
    status in (
      -- legacy statuses (kept so existing rows remain valid)
      'draft_assessment',
      'instant_report_generated',
      'registered',
      'utility_profile_uploaded',
      'proposal_pending',
      'proposal_ready',
      'term_sheet_pending',
      'approved',
      'declined',
      -- platform pipeline stages (S0-S9)
      'estimate',
      'bills_in',
      'f1_proposal_issued',
      'mandate_signed',
      'kyc_in_progress',
      'kyc_complete',
      'bankable',
      'submitted_to_funder',
      'term_sheet_issued',
      'closed',
      'parked'
    )
  );

alter table public.migration_assessments
  add column if not exists monthly_kwh_actual numeric,
  add column if not exists blended_tariff numeric,
  add column if not exists qualification_band text,
  add column if not exists engine_snapshot jsonb,
  add column if not exists association_id uuid,
  add column if not exists stage_history jsonb not null default '[]'::jsonb,
  add column if not exists submitted_to_funder_at timestamptz,
  add column if not exists term_sheet_issued_at timestamptz;

-- FK added after associations table exists (see below).

-- ---------------------------------------------------------------------------
-- 3. Associations (partner channel) + referrals
-- ---------------------------------------------------------------------------
create table if not exists public.associations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  sector text,
  contact_name text,
  contact_email text,
  referral_code text not null unique,
  commission_model text not null default 'per_deal_flat',
  commission_value numeric not null default 0,
  status text not null default 'active',
  constraint associations_status_check check (status in ('active', 'paused', 'ended')),
  constraint associations_referral_code_check check (referral_code ~ '^[A-Z0-9-]{4,24}$')
);

create table if not exists public.association_referrals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  association_id uuid not null references public.associations(id) on delete cascade,
  assessment_id uuid references public.migration_assessments(id) on delete set null,
  member_business_name text,
  stage_at_referral text,
  commission_due numeric,
  commission_paid_at timestamptz
);

create index if not exists association_referrals_association_id_idx
  on public.association_referrals (association_id);
create index if not exists association_referrals_assessment_id_idx
  on public.association_referrals (assessment_id);
create index if not exists migration_assessments_association_id_idx
  on public.migration_assessments (association_id);

-- Attribution FK now that associations exists.
alter table public.migration_assessments
  drop constraint if exists migration_assessments_association_id_fkey;
alter table public.migration_assessments
  add constraint migration_assessments_association_id_fkey
  foreign key (association_id) references public.associations(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. Funder deal rooms: curated, granted, logged
-- ---------------------------------------------------------------------------
-- Deal rooms reference migration_assessments when the deal originated from the
-- public funnel; platform-lead deals link via lead_id instead.
create table if not exists public.deal_rooms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assessment_id uuid references public.migration_assessments(id) on delete cascade,
  lead_id text,
  funder_name text not null default 'Nedbank/Eqstra via Green Share',
  access_token_hash text not null,
  status text not null default 'draft',
  bankability_summary jsonb,
  opened_at timestamptz,
  expires_at timestamptz,
  constraint deal_rooms_status_check check (
    status in ('draft', 'active', 'suspended', 'closed')
  ),
  constraint deal_rooms_subject_check check (
    assessment_id is not null or lead_id is not null
  )
);

-- Per-document grants: ONLY granted documents are visible to the funder.
-- References the LIVE platform documents table (oneos_client_documents).
create table if not exists public.deal_room_grants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  deal_room_id uuid not null references public.deal_rooms(id) on delete cascade,
  document_id text not null references public.oneos_client_documents(id) on delete cascade,
  granted_by text not null,
  revoked_at timestamptz,
  unique (deal_room_id, document_id)
);

-- Every open/download by the funder is evidence.
create table if not exists public.deal_room_access_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  deal_room_id uuid not null references public.deal_rooms(id) on delete cascade,
  document_id text,
  action text not null,
  actor_label text,
  ip_hash text,
  user_agent text,
  constraint deal_room_access_log_action_check check (
    action in ('room_opened', 'document_viewed', 'document_downloaded', 'summary_viewed')
  )
);

create index if not exists deal_rooms_assessment_id_idx on public.deal_rooms (assessment_id);
create index if not exists deal_rooms_lead_id_idx on public.deal_rooms (lead_id);
create index if not exists deal_room_grants_deal_room_id_idx on public.deal_room_grants (deal_room_id);
create index if not exists deal_room_access_log_deal_room_id_idx on public.deal_room_access_log (deal_room_id);

-- updated_at triggers (function exists from earlier migrations)
drop trigger if exists set_updated_at_associations on public.associations;
create trigger set_updated_at_associations
before update on public.associations
for each row execute function public.oneos_set_updated_at();

drop trigger if exists set_updated_at_deal_rooms on public.deal_rooms;
create trigger set_updated_at_deal_rooms
before update on public.deal_rooms
for each row execute function public.oneos_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. RLS: service-role only (all access flows through the app's API layer)
-- ---------------------------------------------------------------------------
alter table public.associations enable row level security;
alter table public.association_referrals enable row level security;
alter table public.deal_rooms enable row level security;
alter table public.deal_room_grants enable row level security;
alter table public.deal_room_access_log enable row level security;

drop policy if exists "service role manages associations" on public.associations;
create policy "service role manages associations"
on public.associations for all to service_role using (true) with check (true);

drop policy if exists "service role manages association referrals" on public.association_referrals;
create policy "service role manages association referrals"
on public.association_referrals for all to service_role using (true) with check (true);

drop policy if exists "service role manages deal rooms" on public.deal_rooms;
create policy "service role manages deal rooms"
on public.deal_rooms for all to service_role using (true) with check (true);

drop policy if exists "service role manages deal room grants" on public.deal_room_grants;
create policy "service role manages deal room grants"
on public.deal_room_grants for all to service_role using (true) with check (true);

drop policy if exists "service role manages deal room access log" on public.deal_room_access_log;
create policy "service role manages deal room access log"
on public.deal_room_access_log for all to service_role using (true) with check (true);
