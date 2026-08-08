-- F5 (funnel audit 01): the completed proposal is released before the EOI.
-- The EOI now records the SHA-256 of the proposal content the signer reviewed
-- (operator document hash, or hash of the engine proposal snapshot). Additive.

alter table public.migration_case_eois
	add column if not exists reviewed_proposal_sha256 text;

alter table public.migration_case_eois
	drop constraint if exists migration_case_eois_reviewed_proposal_sha256_check;

alter table public.migration_case_eois
	add constraint migration_case_eois_reviewed_proposal_sha256_check
	check (reviewed_proposal_sha256 is null or reviewed_proposal_sha256 ~ '^[0-9a-f]{64}$');
