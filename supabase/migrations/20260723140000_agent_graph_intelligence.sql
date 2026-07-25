-- Foundation-1 bounded agent-graph operations and privacy-safe product intelligence.
--
-- This migration is intentionally isolated from migration-case stages and all
-- transactional origination operations. Agent graphs can persist runs,
-- evidence and draft artifacts, but cannot mutate cases, calculations,
-- signatures, submissions, term sheets or final proposal documents.

create table if not exists public.foundation1_graph_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  graph_key text not null,
  graph_version text not null,
  environment text not null default 'production',
  case_id uuid references public.migration_cases(id) on delete set null,
  status text not null default 'queued',
  requested_by text not null,
  input_summary jsonb not null default '{}'::jsonb,
  running_notes jsonb not null default '[]'::jsonb,
  max_nodes integer not null,
  max_parallel_nodes integer not null,
  max_attempts_per_node integer not null,
  max_rounds integer not null,
  node_count integer not null default 0,
  stop_reason text,
  failure_reason text,
  constraint foundation1_graph_runs_key_check check (
    graph_key in (
      'account_research',
      'outreach_preparation',
      'migration_analysis_explanation',
      'proposal_content',
      'kyc_review_assistance',
      'operations_improvement'
    )
  ),
  constraint foundation1_graph_runs_environment_check
    check (environment in ('production', 'preview', 'development', 'test')),
  constraint foundation1_graph_runs_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed', 'needs_review', 'cancelled')),
  constraint foundation1_graph_runs_max_nodes_check
    check (max_nodes between 1 and 16),
  constraint foundation1_graph_runs_parallel_check
    check (max_parallel_nodes between 1 and 4),
  constraint foundation1_graph_runs_attempts_check
    check (max_attempts_per_node between 1 and 3),
  constraint foundation1_graph_runs_rounds_check
    check (max_rounds between 1 and 3),
  constraint foundation1_graph_runs_node_count_check
    check (node_count between 0 and 16)
);

create table if not exists public.foundation1_graph_node_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.foundation1_graph_runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  node_key text not null,
  node_kind text not null,
  attempt integer not null,
  status text not null,
  input_digest text,
  output_digest text,
  output_summary jsonb not null default '{}'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  verification jsonb not null default '{}'::jsonb,
  failure_reason text,
  constraint foundation1_graph_node_runs_kind_check
    check (node_kind in ('agent', 'deterministic', 'verifier', 'merge')),
  constraint foundation1_graph_node_runs_attempt_check
    check (attempt between 0 and 3),
  constraint foundation1_graph_node_runs_status_check
    check (status in ('queued', 'running', 'passed', 'failed', 'needs_review', 'blocked')),
  constraint foundation1_graph_node_runs_input_digest_check
    check (input_digest is null or input_digest ~ '^[0-9a-f]{64}$'),
  constraint foundation1_graph_node_runs_output_digest_check
    check (output_digest is null or output_digest ~ '^[0-9a-f]{64}$'),
  unique (run_id, node_key, attempt)
);

create table if not exists public.foundation1_graph_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.foundation1_graph_runs(id) on delete cascade,
  case_id uuid references public.migration_cases(id) on delete set null,
  created_at timestamptz not null default now(),
  artifact_key text not null,
  artifact_version integer not null default 1,
  writer_node_key text not null,
  status text not null default 'draft',
  content jsonb not null,
  content_sha256 text not null,
  constraint foundation1_graph_artifacts_version_check
    check (artifact_version between 1 and 1000),
  constraint foundation1_graph_artifacts_status_check
    check (status in ('draft', 'verified', 'rejected', 'merged')),
  constraint foundation1_graph_artifacts_hash_check
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint foundation1_graph_artifacts_protected_write_check check (
    artifact_key not in (
      'final_proposal',
      'final_proposal_document',
      'migration_case_state',
      'funding_submission',
      'term_sheet_decision'
    )
  ),
  unique (run_id, artifact_key, artifact_version)
);

create table if not exists public.foundation1_behavior_events (
  id uuid primary key,
  received_at timestamptz not null default now(),
  occurred_at timestamptz not null,
  environment text not null,
  surface text not null,
  event_name text not null,
  page_key text not null,
  visitor_hash text not null,
  session_hash text not null,
  consent_basis text not null,
  properties jsonb not null default '{}'::jsonb,
  schema_version text not null,
  constraint foundation1_behavior_events_environment_check
    check (environment in ('production', 'preview', 'development', 'test')),
  constraint foundation1_behavior_events_surface_check
    check (surface in ('public_website', 'migration_workspace')),
  constraint foundation1_behavior_events_name_check check (
    event_name in (
      'consent_updated',
      'page_view',
      'interaction',
      'form_submit',
      'scroll_depth',
      'engagement',
      'client_error'
    )
  ),
  constraint foundation1_behavior_events_visitor_hash_check
    check (visitor_hash ~ '^[0-9a-f]{64}$'),
  constraint foundation1_behavior_events_session_hash_check
    check (session_hash ~ '^[0-9a-f]{64}$'),
  constraint foundation1_behavior_events_consent_check
    check (consent_basis in ('analytics_consent', 'test')),
  constraint foundation1_behavior_events_page_key_check
    check (length(page_key) between 1 and 180),
  constraint foundation1_behavior_events_time_check
    check (
      occurred_at >= received_at - interval '7 days'
      and occurred_at <= received_at + interval '10 minutes'
    )
);

create table if not exists public.foundation1_behavior_daily_metrics (
  metric_date date not null,
  environment text not null,
  surface text not null,
  event_name text not null,
  page_key text not null,
  event_count bigint not null default 0,
  session_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (metric_date, environment, surface, event_name, page_key),
  constraint foundation1_behavior_daily_environment_check
    check (environment in ('production', 'preview', 'development', 'test')),
  constraint foundation1_behavior_daily_surface_check
    check (surface in ('public_website', 'migration_workspace')),
  constraint foundation1_behavior_daily_counts_check
    check (event_count >= 0 and session_count >= 0)
);

create table if not exists public.foundation1_improvement_insights (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  insight_key text not null,
  environment text not null,
  period_start date not null,
  period_end date not null,
  category text not null,
  severity text not null,
  status text not null default 'proposed',
  headline text not null,
  evidence text not null,
  recommendation text not null,
  metrics jsonb not null default '{}'::jsonb,
  generated_by text not null,
  generator_version text not null,
  constraint foundation1_improvement_environment_check
    check (environment in ('production', 'preview', 'development', 'test')),
  constraint foundation1_improvement_period_check
    check (period_end >= period_start),
  constraint foundation1_improvement_category_check
    check (category in ('funnel', 'friction', 'engagement', 'graph_quality', 'data_quality')),
  constraint foundation1_improvement_severity_check
    check (severity in ('info', 'low', 'medium', 'high')),
  constraint foundation1_improvement_status_check
    check (status in ('proposed', 'accepted', 'rejected', 'implemented')),
  constraint foundation1_improvement_generated_by_check
    check (generated_by in ('deterministic_analyzer', 'codex', 'operator')),
  unique (insight_key, environment, period_start, period_end)
);

create table if not exists public.foundation1_improvement_decisions (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid not null references public.foundation1_improvement_insights(id) on delete cascade,
  created_at timestamptz not null default now(),
  decision text not null,
  decided_by text not null,
  notes text,
  constraint foundation1_improvement_decision_check
    check (decision in ('accepted', 'rejected', 'implemented'))
);

create index if not exists foundation1_graph_runs_status_created_idx
  on public.foundation1_graph_runs (status, created_at desc);
create index if not exists foundation1_graph_runs_case_created_idx
  on public.foundation1_graph_runs (case_id, created_at desc);
create index if not exists foundation1_graph_node_runs_run_idx
  on public.foundation1_graph_node_runs (run_id, created_at);
create index if not exists foundation1_graph_artifacts_case_created_idx
  on public.foundation1_graph_artifacts (case_id, created_at desc);
create index if not exists foundation1_behavior_events_time_idx
  on public.foundation1_behavior_events (environment, occurred_at desc);
create index if not exists foundation1_behavior_events_funnel_idx
  on public.foundation1_behavior_events (environment, event_name, page_key, occurred_at desc);
create index if not exists foundation1_behavior_events_session_idx
  on public.foundation1_behavior_events (session_hash, occurred_at);
create index if not exists foundation1_improvement_insights_status_idx
  on public.foundation1_improvement_insights (status, severity, created_at desc);

alter table public.foundation1_graph_runs enable row level security;
alter table public.foundation1_graph_node_runs enable row level security;
alter table public.foundation1_graph_artifacts enable row level security;
alter table public.foundation1_behavior_events enable row level security;
alter table public.foundation1_behavior_daily_metrics enable row level security;
alter table public.foundation1_improvement_insights enable row level security;
alter table public.foundation1_improvement_decisions enable row level security;

revoke all on table public.foundation1_graph_runs from anon, authenticated;
revoke all on table public.foundation1_graph_node_runs from anon, authenticated;
revoke all on table public.foundation1_graph_artifacts from anon, authenticated;
revoke all on table public.foundation1_behavior_events from anon, authenticated;
revoke all on table public.foundation1_behavior_daily_metrics from anon, authenticated;
revoke all on table public.foundation1_improvement_insights from anon, authenticated;
revoke all on table public.foundation1_improvement_decisions from anon, authenticated;

grant all on table public.foundation1_graph_runs to service_role;
grant all on table public.foundation1_graph_node_runs to service_role;
grant all on table public.foundation1_graph_artifacts to service_role;
grant all on table public.foundation1_behavior_events to service_role;
grant all on table public.foundation1_behavior_daily_metrics to service_role;
grant all on table public.foundation1_improvement_insights to service_role;
grant all on table public.foundation1_improvement_decisions to service_role;

drop policy if exists "service role manages foundation1 graph runs"
  on public.foundation1_graph_runs;
create policy "service role manages foundation1 graph runs"
on public.foundation1_graph_runs for all to service_role using (true) with check (true);
drop policy if exists "service role manages foundation1 graph node runs"
  on public.foundation1_graph_node_runs;
create policy "service role manages foundation1 graph node runs"
on public.foundation1_graph_node_runs for all to service_role using (true) with check (true);
drop policy if exists "service role manages foundation1 graph artifacts"
  on public.foundation1_graph_artifacts;
create policy "service role manages foundation1 graph artifacts"
on public.foundation1_graph_artifacts for all to service_role using (true) with check (true);
drop policy if exists "service role manages foundation1 behavior events"
  on public.foundation1_behavior_events;
create policy "service role manages foundation1 behavior events"
on public.foundation1_behavior_events for all to service_role using (true) with check (true);
drop policy if exists "service role manages foundation1 behavior daily metrics"
  on public.foundation1_behavior_daily_metrics;
create policy "service role manages foundation1 behavior daily metrics"
on public.foundation1_behavior_daily_metrics for all to service_role using (true) with check (true);
drop policy if exists "service role manages foundation1 improvement insights"
  on public.foundation1_improvement_insights;
create policy "service role manages foundation1 improvement insights"
on public.foundation1_improvement_insights for all to service_role using (true) with check (true);
drop policy if exists "service role manages foundation1 improvement decisions"
  on public.foundation1_improvement_decisions;
create policy "service role manages foundation1 improvement decisions"
on public.foundation1_improvement_decisions for all to service_role using (true) with check (true);

create or replace function public.prune_foundation1_behavior_events(
  retention_days integer default 90
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  if retention_days < 30 or retention_days > 365 then
    raise exception 'retention_days must be between 30 and 365';
  end if;

  delete from public.foundation1_behavior_events
  where received_at < now() - make_interval(days => retention_days);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.prune_foundation1_behavior_events(integer) from public, anon, authenticated;
grant execute on function public.prune_foundation1_behavior_events(integer) to service_role;
