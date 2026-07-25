-- Reconstructed base DDL for tables whose creation migration was lost
-- (originally applied directly to the old cloud project). Shapes derived from
-- lib/email-threads.ts, lib/notifications.ts and the surviving ALTER migrations.

create extension if not exists pgcrypto;

create table if not exists public.oneos_email_threads (
  id uuid primary key default gen_random_uuid(),
  lead_id text,
  client_profile_id text,
  subject text,
  participants jsonb not null default '[]'::jsonb,
  external_thread_id text,
  last_message_at timestamptz,
  last_direction text,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oneos_email_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.oneos_email_threads(id) on delete cascade,
  direction text not null,
  from_address text,
  from_name text,
  to_addresses jsonb not null default '[]'::jsonb,
  cc_addresses jsonb not null default '[]'::jsonb,
  subject text,
  body_text text,
  body_html text,
  message_id text,
  in_reply_to text,
  reference_ids jsonb not null default '[]'::jsonb,
  provider_id text,
  sent_by_user_id uuid,
  is_read boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oneos_email_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.oneos_email_messages(id) on delete cascade,
  filename text,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.oneos_notifications (
  id uuid primary key default gen_random_uuid(),
  audience text not null,
  recipient_email text,
  kind text not null,
  title text not null,
  body text,
  link text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists oneos_email_threads_lead_idx on public.oneos_email_threads(lead_id);
create index if not exists oneos_email_threads_last_message_idx on public.oneos_email_threads(last_message_at desc);
create index if not exists oneos_email_messages_thread_idx on public.oneos_email_messages(thread_id);
create index if not exists oneos_email_attachments_message_idx on public.oneos_email_attachments(message_id);
create index if not exists oneos_notifications_created_idx on public.oneos_notifications(created_at desc);

drop trigger if exists oneos_email_threads_updated_at on public.oneos_email_threads;
create trigger oneos_email_threads_updated_at
before update on public.oneos_email_threads
for each row execute function public.oneos_set_updated_at();

drop trigger if exists oneos_email_messages_updated_at on public.oneos_email_messages;
create trigger oneos_email_messages_updated_at
before update on public.oneos_email_messages
for each row execute function public.oneos_set_updated_at();

alter table public.oneos_email_threads enable row level security;
alter table public.oneos_email_messages enable row level security;
alter table public.oneos_email_attachments enable row level security;
alter table public.oneos_notifications enable row level security;

drop policy if exists "service role manages oneos email threads" on public.oneos_email_threads;
create policy "service role manages oneos email threads"
on public.oneos_email_threads for all to service_role using (true) with check (true);

drop policy if exists "service role manages oneos email messages" on public.oneos_email_messages;
create policy "service role manages oneos email messages"
on public.oneos_email_messages for all to service_role using (true) with check (true);

drop policy if exists "service role manages oneos email attachments" on public.oneos_email_attachments;
create policy "service role manages oneos email attachments"
on public.oneos_email_attachments for all to service_role using (true) with check (true);

drop policy if exists "service role manages oneos notifications" on public.oneos_notifications;
create policy "service role manages oneos notifications"
on public.oneos_notifications for all to service_role using (true) with check (true);

revoke all on public.oneos_email_threads from anon, authenticated;
revoke all on public.oneos_email_messages from anon, authenticated;
revoke all on public.oneos_email_attachments from anon, authenticated;
revoke all on public.oneos_notifications from anon, authenticated;
