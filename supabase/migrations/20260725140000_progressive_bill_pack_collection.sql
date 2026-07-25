-- Progressive bill collection
-- 2026-07-25
--
-- The AUDIT stays atomic: six billing periods are still aggregated together and
-- no proposal is produced from a partial history. What changes is COLLECTION -
-- a client may add bills as they find them instead of holding everything until
-- all six are in hand in a single browser session.
--
-- Previously `source_file_count` had to be between 6 and 12 on insert, which
-- made a partial pack physically unrepresentable, and the status vocabulary had
-- no term for "open and still gathering".

alter table public.migration_case_bill_packs
  drop constraint if exists migration_case_bill_packs_file_count_check;
alter table public.migration_case_bill_packs
  add constraint migration_case_bill_packs_file_count_check
  check (source_file_count >= 1 and source_file_count <= 12);

alter table public.migration_case_bill_packs
  drop constraint if exists migration_case_bill_packs_status_check;
alter table public.migration_case_bill_packs
  add constraint migration_case_bill_packs_status_check
  check (status in ('collecting', 'processing', 'ready', 'manual_review', 'failed'));
