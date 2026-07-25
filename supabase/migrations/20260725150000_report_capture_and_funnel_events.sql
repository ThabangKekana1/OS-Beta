-- Soft capture + named funnel events
-- 2026-07-25
--
-- The indicative report is generated entirely client-side and its PDF is built
-- in the browser, so a prospect could consume the full report and leave without
-- the business ever knowing they existed. Below the R10,000 threshold they hit
-- a hard wall with no capture at all.
--
-- report_captures records anyone who asks for their report by email, including
-- those below the programme threshold, who are kept as a real register rather
-- than discarded.
--
-- funnel_events records the named steps that were previously unmeasurable. The
-- behaviour telemetry table holds generic clicks and scrolls; it cannot answer
-- "how many saw a report and did not open a case".

create table if not exists public.report_captures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email_normalised text not null,
  contact_name text,
  business_name text,
  site_city text,
  province text,
  supply_type text,
  monthly_spend_ex_vat numeric(14, 2),
  tariff_family text,
  below_threshold boolean not null default false,
  report jsonb,
  source_campaign text,
  partner_campaign_code text,
  converted_case_id uuid references public.migration_cases(id) on delete set null,
  constraint report_captures_email_check check (position('@' in email_normalised) > 1)
);

create index if not exists report_captures_email_idx
  on public.report_captures (email_normalised, created_at desc);
create index if not exists report_captures_threshold_idx
  on public.report_captures (below_threshold, created_at desc);

alter table public.report_captures enable row level security;
revoke all on table public.report_captures from anon, authenticated;
grant all on table public.report_captures to service_role;

create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null,
  session_hash text,
  email_normalised text,
  monthly_spend_ex_vat numeric(14, 2),
  province text,
  place_context text,
  source_campaign text,
  partner_campaign_code text,
  metadata jsonb not null default '{}'::jsonb,
  constraint funnel_events_event_check check (
    event in (
      'report_generated',
      'report_captured',
      'threshold_blocked',
      'case_opened',
      'bills_added',
      'bill_pack_audited',
      'proposal_ready',
      'eoi_signed'
    )
  )
);

create index if not exists funnel_events_event_created_idx
  on public.funnel_events (event, created_at desc);
create index if not exists funnel_events_created_idx
  on public.funnel_events (created_at desc);

alter table public.funnel_events enable row level security;
revoke all on table public.funnel_events from anon, authenticated;
grant all on table public.funnel_events to service_role;
