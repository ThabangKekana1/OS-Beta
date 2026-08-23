-- Dawn: the conversational migration workspace agent
-- 2026-08-22
--
-- Three concerns, one migration:
--   1. Conversation spine    — case-scoped conversations and messages, so the
--      client's thread survives devices and sessions and the founder can audit
--      every word Dawn has ever said.
--   2. Self-improvement loop — a versioned playbook Dawn maintains about how to
--      help clients better. Every change carries its reason and feeds the
--      founder's ontology through foundation1_improvement_insights.
--   3. Ontology extension    — the existing improvement-insight rails learn two
--      new vocabulary items: category 'conversation' and generator 'dawn'.

-- ---------------------------------------------------------------------------
-- 1. Conversation spine
-- ---------------------------------------------------------------------------

create table if not exists public.foundation1_dawn_conversations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.migration_cases (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  title text not null default 'Conversation',
  constraint foundation1_dawn_conversations_title_check
    check (length(title) between 1 and 160)
);

create index if not exists foundation1_dawn_conversations_case_idx
  on public.foundation1_dawn_conversations (case_id, last_message_at desc);

create table if not exists public.foundation1_dawn_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.foundation1_dawn_conversations (id) on delete cascade,
  case_id uuid not null references public.migration_cases (id) on delete cascade,
  created_at timestamptz not null default now(),
  role text not null,
  content text not null,
  context jsonb not null default '{}'::jsonb,
  constraint foundation1_dawn_messages_role_check
    check (role in ('client', 'dawn')),
  constraint foundation1_dawn_messages_content_check
    check (length(content) between 1 and 20000)
);

create index if not exists foundation1_dawn_messages_conversation_idx
  on public.foundation1_dawn_messages (conversation_id, created_at);
create index if not exists foundation1_dawn_messages_case_idx
  on public.foundation1_dawn_messages (case_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Self-improvement playbook (versioned, auditable, reversible)
-- ---------------------------------------------------------------------------

create table if not exists public.foundation1_dawn_playbook (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  key text not null,
  version integer not null,
  content text not null,
  reason text not null,
  source_insight_id uuid references public.foundation1_improvement_insights (id) on delete set null,
  active boolean not null default true,
  constraint foundation1_dawn_playbook_key_check
    check (length(key) between 1 and 120),
  constraint foundation1_dawn_playbook_content_check
    check (length(content) between 1 and 4000),
  constraint foundation1_dawn_playbook_reason_check
    check (length(reason) between 1 and 2000),
  constraint foundation1_dawn_playbook_version_check
    check (version >= 1),
  unique (key, version)
);

create index if not exists foundation1_dawn_playbook_active_idx
  on public.foundation1_dawn_playbook (active, key, version desc);

-- ---------------------------------------------------------------------------
-- 3. Message feedback: the client grades Dawn, and explains why
-- ---------------------------------------------------------------------------

create table if not exists public.foundation1_dawn_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message_id uuid not null references public.foundation1_dawn_messages (id) on delete cascade,
  case_id uuid not null references public.migration_cases (id) on delete cascade,
  rating text not null,
  comment text,
  constraint foundation1_dawn_feedback_rating_check
    check (rating in ('like', 'dislike')),
  constraint foundation1_dawn_feedback_comment_check
    check (comment is null or length(comment) <= 2000),
  unique (message_id)
);

create index if not exists foundation1_dawn_feedback_case_idx
  on public.foundation1_dawn_feedback (case_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Demand intelligence: what South African businesses want, in their words
-- ---------------------------------------------------------------------------

create table if not exists public.foundation1_dawn_demand_signals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  case_id uuid not null references public.migration_cases (id) on delete cascade,
  conversation_id uuid references public.foundation1_dawn_conversations (id) on delete set null,
  signal_kind text not null,
  content text not null,
  intent text,
  sentiment text,
  constraint foundation1_dawn_demand_kind_check
    check (signal_kind in (
      'want', 'challenge', 'objection', 'competitor_mention',
      'budget_signal', 'timing_signal', 'complaint', 'excitement', 'risk_flag'
    )),
  constraint foundation1_dawn_demand_content_check
    check (length(content) between 1 and 2000),
  constraint foundation1_dawn_demand_sentiment_check
    check (sentiment is null or sentiment in ('negative', 'neutral', 'positive'))
);

create index if not exists foundation1_dawn_demand_case_idx
  on public.foundation1_dawn_demand_signals (case_id, created_at desc);
create index if not exists foundation1_dawn_demand_kind_idx
  on public.foundation1_dawn_demand_signals (signal_kind, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Memory: what Dawn remembers about each case across conversations
-- ---------------------------------------------------------------------------

create table if not exists public.foundation1_dawn_memory (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.migration_cases (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  key text not null,
  content text not null,
  constraint foundation1_dawn_memory_key_check
    check (key ~ '^[a-z0-9_]{2,60}$'),
  constraint foundation1_dawn_memory_content_check
    check (length(content) between 1 and 1000),
  unique (case_id, key)
);

create index if not exists foundation1_dawn_memory_case_idx
  on public.foundation1_dawn_memory (case_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- 6. Ontology vocabulary: Dawn generates conversation insights
-- ---------------------------------------------------------------------------

alter table public.foundation1_improvement_insights
  drop constraint if exists foundation1_improvement_category_check;
alter table public.foundation1_improvement_insights
  add constraint foundation1_improvement_category_check
  check (category in ('funnel', 'friction', 'engagement', 'graph_quality', 'data_quality', 'conversation'));

alter table public.foundation1_improvement_insights
  drop constraint if exists foundation1_improvement_generated_by_check;
alter table public.foundation1_improvement_insights
  add constraint foundation1_improvement_generated_by_check
  check (generated_by in ('deterministic_analyzer', 'codex', 'operator', 'dawn'));

-- ---------------------------------------------------------------------------
-- Row level security: service-role only, same posture as the rest of the spine
-- ---------------------------------------------------------------------------

alter table public.foundation1_dawn_conversations enable row level security;
alter table public.foundation1_dawn_messages enable row level security;
alter table public.foundation1_dawn_playbook enable row level security;
alter table public.foundation1_dawn_feedback enable row level security;
alter table public.foundation1_dawn_demand_signals enable row level security;
alter table public.foundation1_dawn_memory enable row level security;

revoke all on table public.foundation1_dawn_conversations from anon, authenticated;
revoke all on table public.foundation1_dawn_messages from anon, authenticated;
revoke all on table public.foundation1_dawn_playbook from anon, authenticated;
revoke all on table public.foundation1_dawn_feedback from anon, authenticated;
revoke all on table public.foundation1_dawn_demand_signals from anon, authenticated;
revoke all on table public.foundation1_dawn_memory from anon, authenticated;

grant all on table public.foundation1_dawn_conversations to service_role;
grant all on table public.foundation1_dawn_messages to service_role;
grant all on table public.foundation1_dawn_playbook to service_role;
grant all on table public.foundation1_dawn_feedback to service_role;
grant all on table public.foundation1_dawn_demand_signals to service_role;
grant all on table public.foundation1_dawn_memory to service_role;
