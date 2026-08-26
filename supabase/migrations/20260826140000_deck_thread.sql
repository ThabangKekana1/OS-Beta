-- The Deck thread (doc 21): the persistent founder-harness conversation.
-- One stream both workers write to: the founder, MI (the harness voice), and
-- platform events (draft batches landed, batches dispatched, escalations).
create table if not exists public.foundation1_deck_messages (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('founder', 'harness', 'event')),
  content text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists deck_messages_created_idx on public.foundation1_deck_messages (created_at);
