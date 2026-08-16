-- Bills-first Expression of Interest: the client signs the EOI immediately after
-- uploading utility bills, before the bill-audited proposal exists. The EOI row
-- therefore no longer requires a proposal reference; when a proposal exists at
-- signing time it is still recorded.
alter table public.migration_case_eois
	alter column proposal_id drop not null;
