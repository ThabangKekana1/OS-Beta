-- Add per-user mailbox ownership for the in-app email inbox.
-- Admin users can still inspect all threads; sales users are filtered to their
-- own mailbox owner/profile or mailbox address in the application layer.

alter table public.oneos_email_threads
  add column if not exists mailbox_owner_user_id uuid references public.oneos_users(id) on delete set null,
  add column if not exists mailbox_address text,
  add column if not exists mailbox_role text check (mailbox_role in ('admin', 'sales'));

update public.oneos_email_threads
set mailbox_role = 'admin'
where mailbox_role is null;

create index if not exists oneos_email_threads_mailbox_owner_idx
  on public.oneos_email_threads(mailbox_owner_user_id)
  where mailbox_owner_user_id is not null;

create index if not exists oneos_email_threads_mailbox_address_idx
  on public.oneos_email_threads(mailbox_address)
  where mailbox_address is not null;

create index if not exists oneos_email_threads_mailbox_role_idx
  on public.oneos_email_threads(mailbox_role);

create unique index if not exists oneos_email_messages_provider_id_uidx
  on public.oneos_email_messages(provider_id)
  where provider_id is not null;

create unique index if not exists oneos_email_messages_message_id_uidx
  on public.oneos_email_messages(message_id)
  where message_id is not null;
