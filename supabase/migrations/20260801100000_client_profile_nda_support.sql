-- Client business profile, NDA/POPIA consent step and in-case support thread.
--
-- The dashboard journey becomes: profile -> NDA -> bill pack -> proposal ->
-- EOI. The NDA records POPIA consent and the client's authorisation to share
-- ONLY utility bills and the signed EOI with the funding bank and the wheeling
-- provider's engineers. Support messages give the client a direct line to
-- Foundation-1 from inside the case workspace.

alter table public.migration_cases
        add column if not exists client_profile jsonb;
alter table public.migration_cases
        add column if not exists profile_completed_at timestamptz;
alter table public.migration_cases
        add column if not exists nda_signed_at timestamptz;
alter table public.migration_cases
        add column if not exists active_nda_id uuid;

create table if not exists public.migration_case_ndas (
        id uuid primary key default gen_random_uuid(),
        case_id uuid not null references public.migration_cases(id) on delete cascade,
        created_at timestamptz not null default now(),
        signed_at timestamptz not null default now(),
        signer_name text not null,
        signer_position text not null,
        popia_consent boolean not null default false,
        sharing_consent boolean not null default false,
        agreement_version text not null,
        client_ip_hash text,
        user_agent text,
        pdf_storage_path text,
        pdf_sha256 text,
        constraint migration_case_ndas_one_per_case unique (case_id)
);

create index if not exists migration_case_ndas_case_idx
        on public.migration_case_ndas (case_id);

create table if not exists public.migration_case_support_messages (
        id uuid primary key default gen_random_uuid(),
        case_id uuid not null references public.migration_cases(id) on delete cascade,
        created_at timestamptz not null default now(),
        author_type text not null default 'client',
        author_name text,
        message text not null,
        constraint migration_case_support_author_check
                check (author_type in ('client', 'foundation1')),
        constraint migration_case_support_message_check
                check (length(message) between 1 and 4000)
);

create index if not exists migration_case_support_messages_case_idx
        on public.migration_case_support_messages (case_id, created_at);

alter table public.migration_case_ndas enable row level security;
alter table public.migration_case_support_messages enable row level security;

drop policy if exists "service role manages migration case ndas" on public.migration_case_ndas;
create policy "service role manages migration case ndas"
        on public.migration_case_ndas for all
        to service_role using (true) with check (true);

drop policy if exists "service role manages migration case support" on public.migration_case_support_messages;
create policy "service role manages migration case support"
        on public.migration_case_support_messages for all
        to service_role using (true) with check (true);
