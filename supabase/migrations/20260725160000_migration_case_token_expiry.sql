-- Access token expiry
-- 2026-07-25
--
-- A case access token had no lifetime: a link forwarded once, or left in an old
-- inbox, granted permanent access to that client's bills, proposal and KYC
-- status. Expiry is 90 days, refreshed every time the client actually opens the
-- case, so an active client is never interrupted while a dormant link dies.
--
-- An expired link is treated as unknown rather than shown an error; the client
-- recovers through /login, which issues a fresh one. Nothing is lost.
--
-- Existing cases are backfilled 90 days from their last client activity (or
-- creation), so nothing currently live stops working on the day this applies.

alter table public.migration_cases
  add column if not exists access_token_expires_at timestamptz;

update public.migration_cases
set access_token_expires_at =
  coalesce(last_client_seen_at, updated_at, created_at) + interval '90 days'
where access_token_expires_at is null;
