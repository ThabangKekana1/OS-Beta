-- Sales users receive their own live notifications for mailbox events.

alter table public.oneos_notifications
  drop constraint if exists oneos_notifications_audience_check;

alter table public.oneos_notifications
  add constraint oneos_notifications_audience_check
  check (audience in ('admin', 'sales', 'customer'));

create index if not exists oneos_notifications_audience_recipient_read_idx
  on public.oneos_notifications(audience, recipient_email, read_at);
