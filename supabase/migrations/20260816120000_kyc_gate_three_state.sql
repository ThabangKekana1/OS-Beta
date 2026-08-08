-- KYC document gate: three-state item tracker (S7/S8).
--
-- Decision record 2026-08-16 (06_OUTREACH_TO_TERM_SHEET_SYSTEM_PLAN.md §4 S7,
-- §9-P0-1). Founder rule: clients upload whatever KYC documents they have —
-- partial packs are fine and never block the client's journey. Missing items
-- carry a client-declared plan ("promised by [date]" / "don't have") with a
-- Fix-It hint, and Foundation-1 only forwards a pack to the bank once it is
-- complete (the submission action WARNS the operator, it never blocks).
--
-- The living plan is stored on the existing migration_case_kyc_readiness row
-- (items/fix_it_plan jsonb already carry the per-item detail). This migration
-- is purely additive: it widens the status vocabulary with 'in_progress' for
-- a plan that is still being worked, distinct from the legacy attestation
-- outcomes 'confirmed' and 'parked'.
--
-- Runtime degrades gracefully while this is unapplied: the kyc-plan route
-- retries with status 'parked' when the check constraint rejects
-- 'in_progress' (SQLSTATE 23514), so nothing breaks before deploy.

alter table public.migration_case_kyc_readiness
  drop constraint if exists migration_case_kyc_readiness_status_check;
alter table public.migration_case_kyc_readiness
  add constraint migration_case_kyc_readiness_status_check
  check (status in ('confirmed', 'parked', 'in_progress'));

comment on column public.migration_case_kyc_readiness.status is
  'confirmed = pack proven (attested or 6/6 in custody); parked = legacy attestation with missing items (also the pre-migration fallback for in-progress plans); in_progress = document gate open with a live three-state item plan.';
