-- Email signatures for dashboard inbox users.
-- Stores one plain-text signature and one small inline footer image per user.

alter table if exists public.oneos_users
  add column if not exists partner_org_id text;

alter table if exists public.oneos_users
  drop constraint if exists oneos_users_role_check;

alter table if exists public.oneos_users
  add constraint oneos_users_role_check
  check (role in ('admin', 'sales', 'partner', 'client'));

create index if not exists oneos_users_partner_org_idx
  on public.oneos_users(partner_org_id)
  where partner_org_id is not null;

alter table if exists public.oneos_email_threads
  drop constraint if exists oneos_email_threads_mailbox_role_check;

alter table if exists public.oneos_email_threads
  add constraint oneos_email_threads_mailbox_role_check
  check (mailbox_role in ('admin', 'sales', 'partner'));

create table if not exists public.oneos_email_signatures (
  owner_user_id uuid primary key references public.oneos_users(id) on delete cascade,
  owner_email text not null,
  owner_role text not null check (owner_role in ('admin', 'sales', 'partner')),
  signature_text text not null default '',
  footer_image_filename text,
  footer_image_mime_type text,
  footer_image_base64 text,
  footer_image_size_bytes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oneos_email_signatures_owner_email_lower check (owner_email = lower(owner_email)),
  constraint oneos_email_signatures_footer_image_size check (
    footer_image_size_bytes is null
    or (footer_image_size_bytes >= 0 and footer_image_size_bytes <= 524288)
  ),
  constraint oneos_email_signatures_footer_image_mime check (
    footer_image_mime_type is null
    or footer_image_mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
  )
);

create index if not exists oneos_email_signatures_owner_email_idx
  on public.oneos_email_signatures(owner_email);

drop trigger if exists oneos_email_signatures_updated_at on public.oneos_email_signatures;
create trigger oneos_email_signatures_updated_at
before update on public.oneos_email_signatures
for each row execute function public.oneos_set_updated_at();

alter table public.oneos_email_signatures enable row level security;

drop policy if exists "service role manages oneos email signatures" on public.oneos_email_signatures;
create policy "service role manages oneos email signatures"
on public.oneos_email_signatures
for all
to service_role
using (true)
with check (true);

revoke all on public.oneos_email_signatures from anon, authenticated;
