-- Association channel + outreach spine
-- 2026-07-25
--
-- Three concerns, one migration:
--   1. Suppression list  — POPIA opt-out and deliverability protection. Nothing
--      may be sent to an address recorded here, ever.
--   2. Attribution spine — a migration case can now name the lead and/or the
--      association it originated from, closing the outreach -> case -> term
--      sheet loop that was previously broken.
--   3. Association channel — the association record carries enough campaign
--      state to run the secretariat outreach motion, plus an event log.

-- ---------------------------------------------------------------------------
-- 1. Suppression list
-- ---------------------------------------------------------------------------

create table if not exists public.outreach_suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email_normalised text not null,
  reason text not null,
  source text,
  detail text,
  constraint outreach_suppressions_email_key unique (email_normalised),
  constraint outreach_suppressions_reason_check check (
    reason in ('unsubscribed', 'hard_bounce', 'complaint', 'manual', 'invalid')
  )
);

create index if not exists outreach_suppressions_created_at_idx
  on public.outreach_suppressions (created_at desc);

alter table public.outreach_suppressions enable row level security;
revoke all on table public.outreach_suppressions from anon, authenticated;
grant all on table public.outreach_suppressions to service_role;

-- ---------------------------------------------------------------------------
-- 2. Attribution spine
-- ---------------------------------------------------------------------------

alter table public.migration_cases
  add column if not exists origin_lead_id text,
  add column if not exists origin_association_id uuid,
  add column if not exists origin_channel text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'migration_cases_origin_association_id_fkey'
  ) then
    alter table public.migration_cases
      add constraint migration_cases_origin_association_id_fkey
      foreign key (origin_association_id) references public.associations (id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'migration_cases_origin_channel_check'
  ) then
    alter table public.migration_cases
      add constraint migration_cases_origin_channel_check check (
        origin_channel is null or origin_channel in
          ('association', 'cold_outreach', 'partner', 'organic', 'referral')
      );
  end if;
end $$;

create index if not exists migration_cases_origin_lead_idx
  on public.migration_cases (origin_lead_id) where origin_lead_id is not null;
create index if not exists migration_cases_origin_association_idx
  on public.migration_cases (origin_association_id) where origin_association_id is not null;

-- Click-tracked outreach token on the prospect record.
alter table public.oneos_admin_leads
  add column if not exists outreach_token text;

create unique index if not exists oneos_admin_leads_outreach_token_key
  on public.oneos_admin_leads (outreach_token) where outreach_token is not null;

-- ---------------------------------------------------------------------------
-- 3. Association channel state
-- ---------------------------------------------------------------------------

alter table public.associations
  add column if not exists website text,
  add column if not exists sub_sector text,
  add column if not exists member_base text,
  add column if not exists priority_tier int,
  add column if not exists priority_score int,
  add column if not exists product_fit text,
  add column if not exists why_it_matters text,
  add column if not exists partnership_angle text,
  add column if not exists recommended_action text,
  add column if not exists outreach_stage text not null default 'not_started',
  add column if not exists outreach_owner text,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_action_at timestamptz,
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'associations_outreach_stage_check'
  ) then
    alter table public.associations
      add constraint associations_outreach_stage_check check (
        outreach_stage in (
          'not_started', 'researching', 'contacted', 'in_conversation',
          'proposal_sent', 'agreed', 'live', 'declined', 'dormant'
        )
      );
  end if;
end $$;

create index if not exists associations_outreach_stage_idx
  on public.associations (outreach_stage);
create index if not exists associations_priority_idx
  on public.associations (priority_tier, priority_score desc);

-- Every touch with an association secretariat.
create table if not exists public.association_outreach_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  association_id uuid not null references public.associations (id) on delete cascade,
  event_type text not null,
  actor text,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  constraint association_outreach_events_type_check check (
    event_type in (
      'researched', 'email_sent', 'email_replied', 'call_logged', 'meeting_held',
      'pack_sent', 'agreement_sent', 'agreement_signed', 'programme_launched',
      'declined', 'note'
    )
  )
);

create index if not exists association_outreach_events_assoc_idx
  on public.association_outreach_events (association_id, created_at desc);

alter table public.association_outreach_events enable row level security;
revoke all on table public.association_outreach_events from anon, authenticated;
grant all on table public.association_outreach_events to service_role;
