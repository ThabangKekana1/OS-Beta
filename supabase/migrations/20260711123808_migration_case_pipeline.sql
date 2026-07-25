-- Foundation-1 migration case pipeline (v2).
--
-- This is deliberately independent of the legacy migration_assessments,
-- migration_portal_profiles and oneos_client_documents workflow. The public
-- website creates a passwordless case after the no-bill indicative report;
-- clients then submit one complete bill pack, 1OS snapshots the bill-audited
-- proposal, and only then makes the non-binding EOI available.

create table if not exists public.migration_cases (
	id uuid primary key default gen_random_uuid(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	public_reference text not null unique,
	access_token_hash text not null unique,
	token_hint text not null,
	workflow_version text not null default '2026-07-11.1',
	stage text not null default 'bill_pack_required',
	business_name text not null,
	contact_name text not null,
	contact_email text not null,
	contact_phone text not null,
	preferred_contact_method text not null,
	site_city text not null,
	province text not null,
	supply_type text not null,
	monthly_spend_ex_vat numeric(14, 2) not null,
	monthly_kwh_unverified numeric(14, 2),
	indicative_report jsonb not null,
	source_campaign text,
	referrer text,
	active_bill_pack_id uuid,
	active_proposal_id uuid,
	proposal_ready_at timestamptz,
	eoi_signed_at timestamptz,
	last_client_seen_at timestamptz,
	constraint migration_cases_reference_check
		check (public_reference ~ '^F1-MC-[A-Z0-9]{8,16}$'),
	constraint migration_cases_token_hash_check
		check (access_token_hash ~ '^[0-9a-f]{64}$'),
	constraint migration_cases_token_hint_check
		check (length(token_hint) between 4 and 12),
	constraint migration_cases_stage_check check (
		stage in (
			'bill_pack_required',
			'bill_pack_processing',
			'bill_pack_review',
			'proposal_ready',
			'proposal_not_recommended',
			'eoi_signed'
		)
	),
	constraint migration_cases_contact_email_check
		check (contact_email = lower(contact_email) and position('@' in contact_email) > 1),
	constraint migration_cases_contact_method_check
		check (preferred_contact_method in ('email', 'whatsapp', 'phone')),
	constraint migration_cases_supply_type_check check (
		supply_type in ('eskom-direct', 'municipality', 'landlord-or-body-corporate', 'unsure')
	),
	constraint migration_cases_monthly_spend_check
		check (monthly_spend_ex_vat > 0),
	constraint migration_cases_monthly_kwh_check
		check (monthly_kwh_unverified is null or monthly_kwh_unverified > 0)
);

create table if not exists public.migration_case_bill_packs (
	id uuid primary key default gen_random_uuid(),
	case_id uuid not null references public.migration_cases(id) on delete cascade,
	created_at timestamptz not null default now(),
	completed_at timestamptz,
	status text not null default 'processing',
	source_file_count integer not null,
	recognised_period_count integer not null default 0,
	covered_days integer not null default 0,
	portfolio jsonb not null default '{}'::jsonb,
	blockers jsonb not null default '[]'::jsonb,
	warnings jsonb not null default '[]'::jsonb,
	failure_reason text,
	constraint migration_case_bill_packs_status_check
		check (status in ('processing', 'ready', 'manual_review', 'failed')),
	constraint migration_case_bill_packs_file_count_check
		check (source_file_count between 6 and 12),
	constraint migration_case_bill_packs_period_count_check
		check (recognised_period_count >= 0),
	constraint migration_case_bill_packs_covered_days_check
		check (covered_days >= 0)
);

create table if not exists public.migration_case_bill_files (
	id uuid primary key default gen_random_uuid(),
	case_id uuid not null references public.migration_cases(id) on delete cascade,
	bill_pack_id uuid not null references public.migration_case_bill_packs(id) on delete cascade,
	created_at timestamptz not null default now(),
	original_name text not null,
	storage_path text not null unique,
	content_type text not null,
	file_size_bytes bigint not null,
	sha256 text not null,
	analysis jsonb not null default '{}'::jsonb,
	constraint migration_case_bill_files_size_check
		check (file_size_bytes > 0 and file_size_bytes <= 12582912),
	constraint migration_case_bill_files_sha256_check
		check (sha256 ~ '^[0-9a-f]{64}$'),
	unique (bill_pack_id, sha256)
);

create table if not exists public.migration_case_proposals (
	id uuid primary key default gen_random_uuid(),
	case_id uuid not null references public.migration_cases(id) on delete cascade,
	bill_pack_id uuid not null references public.migration_case_bill_packs(id) on delete cascade,
	created_at timestamptz not null default now(),
	status text not null,
	economically_positive boolean not null,
	year_one_monthly_difference numeric(14, 2) not null,
	ten_year_difference numeric(16, 2) not null,
	preview_snapshot jsonb not null,
	proposal_snapshot jsonb not null,
	engine_version text not null,
	constraint migration_case_proposals_status_check
		check (status in ('ready', 'not_recommended')),
	unique (case_id, bill_pack_id)
);

create table if not exists public.migration_case_eois (
	id uuid primary key default gen_random_uuid(),
	case_id uuid not null unique references public.migration_cases(id) on delete cascade,
	proposal_id uuid not null unique references public.migration_case_proposals(id) on delete cascade,
	signed_at timestamptz not null default now(),
	signer_name text not null,
	signer_position text not null,
	company_registration_number text,
	authority_confirmed boolean not null,
	non_binding_terms_accepted boolean not null,
	declarations_version text not null,
	client_ip_hash text,
	user_agent text,
	pdf_storage_path text,
	pdf_sha256 text,
	constraint migration_case_eois_authority_check
		check (authority_confirmed),
	constraint migration_case_eois_terms_check
		check (non_binding_terms_accepted),
	constraint migration_case_eois_pdf_sha256_check
		check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$')
);

create table if not exists public.migration_case_events (
	id uuid primary key default gen_random_uuid(),
	case_id uuid not null references public.migration_cases(id) on delete cascade,
	created_at timestamptz not null default now(),
	event_type text not null,
	actor_type text not null,
	detail text not null,
	metadata jsonb not null default '{}'::jsonb,
	constraint migration_case_events_actor_check
		check (actor_type in ('client', 'system', 'operator'))
);

alter table public.migration_cases
	drop constraint if exists migration_cases_active_bill_pack_id_fkey;
alter table public.migration_cases
	add constraint migration_cases_active_bill_pack_id_fkey
	foreign key (active_bill_pack_id)
	references public.migration_case_bill_packs(id)
	on delete set null;

alter table public.migration_cases
	drop constraint if exists migration_cases_active_proposal_id_fkey;
alter table public.migration_cases
	add constraint migration_cases_active_proposal_id_fkey
	foreign key (active_proposal_id)
	references public.migration_case_proposals(id)
	on delete set null;

create index if not exists migration_cases_contact_email_idx
	on public.migration_cases (contact_email, created_at desc);
create index if not exists migration_cases_stage_created_at_idx
	on public.migration_cases (stage, created_at desc);
create index if not exists migration_case_bill_packs_case_created_at_idx
	on public.migration_case_bill_packs (case_id, created_at desc);
create index if not exists migration_case_bill_files_pack_idx
	on public.migration_case_bill_files (bill_pack_id);
create index if not exists migration_case_proposals_case_created_at_idx
	on public.migration_case_proposals (case_id, created_at desc);
create index if not exists migration_case_events_case_created_at_idx
	on public.migration_case_events (case_id, created_at desc);

alter table public.migration_cases enable row level security;
alter table public.migration_case_bill_packs enable row level security;
alter table public.migration_case_bill_files enable row level security;
alter table public.migration_case_proposals enable row level security;
alter table public.migration_case_eois enable row level security;
alter table public.migration_case_events enable row level security;

revoke all on table public.migration_cases from anon, authenticated;
revoke all on table public.migration_case_bill_packs from anon, authenticated;
revoke all on table public.migration_case_bill_files from anon, authenticated;
revoke all on table public.migration_case_proposals from anon, authenticated;
revoke all on table public.migration_case_eois from anon, authenticated;
revoke all on table public.migration_case_events from anon, authenticated;

grant all on table public.migration_cases to service_role;
grant all on table public.migration_case_bill_packs to service_role;
grant all on table public.migration_case_bill_files to service_role;
grant all on table public.migration_case_proposals to service_role;
grant all on table public.migration_case_eois to service_role;
grant all on table public.migration_case_events to service_role;

drop policy if exists "service role manages migration cases" on public.migration_cases;
create policy "service role manages migration cases"
on public.migration_cases for all to service_role using (true) with check (true);

drop policy if exists "service role manages migration case bill packs" on public.migration_case_bill_packs;
create policy "service role manages migration case bill packs"
on public.migration_case_bill_packs for all to service_role using (true) with check (true);

drop policy if exists "service role manages migration case bill files" on public.migration_case_bill_files;
create policy "service role manages migration case bill files"
on public.migration_case_bill_files for all to service_role using (true) with check (true);

drop policy if exists "service role manages migration case proposals" on public.migration_case_proposals;
create policy "service role manages migration case proposals"
on public.migration_case_proposals for all to service_role using (true) with check (true);

drop policy if exists "service role manages migration case eois" on public.migration_case_eois;
create policy "service role manages migration case eois"
on public.migration_case_eois for all to service_role using (true) with check (true);

drop policy if exists "service role manages migration case events" on public.migration_case_events;
create policy "service role manages migration case events"
on public.migration_case_events for all to service_role using (true) with check (true);
