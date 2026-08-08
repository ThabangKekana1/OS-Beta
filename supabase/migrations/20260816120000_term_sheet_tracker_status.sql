-- Term-sheet tracker (doc 06 §4 S12): status + received date on the deal book.
--
-- STAGED LOCALLY — apply with the other staged migrations at production
-- rollout. Every reader degrades gracefully while this is absent: rows
-- without a status count as 'received', and inserts retry without the new
-- columns when the remote schema does not carry them yet.
--
-- The tracker records, per term sheet:
--   received_at — when the term sheet physically arrived (issued_at remains
--                 the funder's issue date on the document);
--   status      — received → signed | declined. Declined sheets leave the
--                 deal-book total; signed sheets are the hard book.

alter table public.migration_case_term_sheets
  add column if not exists status text not null default 'received',
  add column if not exists received_at timestamptz,
  add column if not exists status_updated_at timestamptz;

alter table public.migration_case_term_sheets
  drop constraint if exists migration_case_term_sheets_status_check;
alter table public.migration_case_term_sheets
  add constraint migration_case_term_sheets_status_check
    check (status in ('received', 'signed', 'declined'));

comment on column public.migration_case_term_sheets.status is
  'Deal-book status: received (default), signed, or declined.';
comment on column public.migration_case_term_sheets.received_at is
  'When the term sheet reached Foundation-1/the client; issued_at is the funder''s own issue date.';
