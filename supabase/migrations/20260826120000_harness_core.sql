-- 1-MI harness core (doc 20): shared runtime tables for the sales harness and Dawn.
-- Compatibility rule stands: foundation1_* prefixes continue.

-- The approval gate. Every outward-facing artifact is a draft here first.
-- Status machine: draft -> approved -> sent | rejected   (draft can also be rejected).
-- Declared invariant: a row can never reach 'sent' without an approval on record.
create table if not exists public.foundation1_send_queue (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  channel text not null default 'email',
  prospect_key text not null,
  template_key text,
  to_address text,
  subject text,
  body_text text,
  body_html text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'rejected', 'sent')),
  approved_by text,
  approved_at timestamptz,
  rejected_reason text,
  rejected_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint send_queue_sent_requires_approval
    check (status <> 'sent' or (approved_at is not null and approved_by is not null))
);
create index if not exists send_queue_status_idx on public.foundation1_send_queue (status, created_at);
create index if not exists send_queue_prospect_idx on public.foundation1_send_queue (prospect_key, sent_at);

-- Scores with their inputs. A score without inputs is treated as fabricated
-- and rejected by application code; the check keeps honest shape in the table.
create table if not exists public.foundation1_scores (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('lead', 'case', 'message')),
  entity_id text not null,
  score_kind text not null,
  score numeric not null check (score >= 0 and score <= 100),
  breakdown jsonb not null default '{}'::jsonb,
  scorer_version text not null,
  computed_at timestamptz not null default now()
);
create index if not exists scores_lookup_idx on public.foundation1_scores
  (entity_type, entity_id, score_kind, computed_at desc);

-- Generalised agent playbook + episodic memory (the Dawn pattern, per agent).
create table if not exists public.foundation1_agent_playbooks (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  key text not null,
  content text not null,
  version integer not null default 1,
  reason text not null,
  source_insight uuid,
  updated_at timestamptz not null default now(),
  unique (agent, key, version)
);

create table if not exists public.foundation1_agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  kind text not null,
  scope_key text not null,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_memory_scope_idx on public.foundation1_agent_memory (agent, scope_key, created_at desc);

-- The direct book, ingested from Target Machine so tools never read workspace files.
create table if not exists public.foundation1_sales_book (
  book_id text primary key,
  company_name text not null,
  cipc_reg_no text,
  sector text not null,
  sub_sector text,
  site_type text,
  province text,
  town text,
  scale_signal text,
  electricity_rationale text,
  est_spend_band text check (est_spend_band in ('10k-50k', '50k-250k', '250k+', 'unknown') or est_spend_band is null),
  website text,
  contact_channel text,
  verification text check (verification in ('V', 'I') or verification is null),
  source_name text,
  source_url text,
  source_accessed text,
  popia_basis text,
  status text not null default 'new',
  pre_score integer,
  ingested_at timestamptz not null default now()
);
create index if not exists sales_book_sector_idx on public.foundation1_sales_book (sector, status);

-- Outcome ledger feeding the learning loop: one row per observed conversion event.
create table if not exists public.foundation1_outcomes (
  id uuid primary key default gen_random_uuid(),
  send_queue_id uuid references public.foundation1_send_queue(id) on delete set null,
  prospect_key text,
  case_id uuid,
  event text not null check (event in ('sent','reply','bills_in','assessment_out','meeting','eoi_signed','proposal_accepted','mandate_signed','term_sheet')),
  occurred_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create index if not exists outcomes_funnel_idx on public.foundation1_outcomes (event, occurred_at desc);
