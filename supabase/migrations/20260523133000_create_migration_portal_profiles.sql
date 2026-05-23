create table if not exists public.migration_portal_profiles (
  profile_id text primary key,
  access_code_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint migration_portal_profiles_profile_id_check check (profile_id ~ '^[A-Z0-9-]{6,24}$')
);

create index if not exists migration_portal_profiles_updated_at_idx
  on public.migration_portal_profiles (updated_at desc);

alter table public.migration_portal_profiles enable row level security;
