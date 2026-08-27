-- Harness runs share the graph-run ledger (doc 20): admit their keys.
alter table public.foundation1_graph_runs drop constraint if exists foundation1_graph_runs_key_check;
alter table public.foundation1_graph_runs add constraint foundation1_graph_runs_key_check check (
  graph_key = any (array[
    'account_research'::text,
    'outreach_preparation'::text,
    'migration_analysis_explanation'::text,
    'proposal_content'::text,
    'kyc_review_assistance'::text,
    'operations_improvement'::text,
    'harness:sales-harness'::text,
    'harness:dawn'::text,
    'harness:operations'::text
  ])
);
