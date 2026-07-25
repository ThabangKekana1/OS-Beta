-- Foundation-1 Partner Distribution Platform v0.1: invitation-only onboarding.
--
-- A Supabase account alone never grants partner access. Foundation-1 must
-- first issue a single-use onboarding invitation. Claiming that invitation
-- creates the canonical association and linked oneos_users partner profile.

create table if not exists public.partner_onboarding_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  token_hash text not null unique,
  email text,
  status text not null default 'pending',
  expires_at timestamptz not null,
  created_by_user_id uuid references public.oneos_users(id) on delete set null,
  claimed_by_auth_user_id uuid references auth.users(id) on delete restrict,
  association_id uuid references public.associations(id) on delete restrict,
  completion_token_hash text unique,
  claimed_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  constraint partner_onboarding_invites_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint partner_onboarding_invites_completion_hash_check
    check (
      completion_token_hash is null
      or completion_token_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint partner_onboarding_invites_email_check
    check (
      email is null
      or (
        email = lower(email)
        and position('@' in email) > 1
      )
    ),
  constraint partner_onboarding_invites_status_check
    check (status in ('pending', 'claimed', 'completed', 'revoked')),
  constraint partner_onboarding_invites_claim_check
    check (
      status = 'pending'
      or status = 'revoked'
      or (
        claimed_by_auth_user_id is not null
        and association_id is not null
        and claimed_at is not null
      )
    ),
  constraint partner_onboarding_invites_complete_check
    check (status <> 'completed' or completed_at is not null)
);

create index if not exists partner_onboarding_invites_status_expiry_idx
  on public.partner_onboarding_invites (status, expires_at);
create index if not exists partner_onboarding_invites_email_idx
  on public.partner_onboarding_invites (email, created_at desc)
  where email is not null;

drop trigger if exists partner_onboarding_invites_updated_at
  on public.partner_onboarding_invites;
create trigger partner_onboarding_invites_updated_at
before update on public.partner_onboarding_invites
for each row execute function public.oneos_set_updated_at();

create or replace function public.claim_partner_onboarding_invite(
  p_invite_token_hash text,
  p_completion_token_hash text,
  p_auth_user_id uuid,
  p_email text,
  p_contact_name text,
  p_organisation_name text,
  p_partner_type text,
  p_referral_code text
)
returns table (organisation_id uuid, organisation_referral_code text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  invite_row public.partner_onboarding_invites%rowtype;
  created_organisation_id uuid;
  normalized_email text := lower(trim(p_email));
begin
  if p_invite_token_hash !~ '^[0-9a-f]{64}$'
     or p_completion_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid partner onboarding token.';
  end if;

  select *
  into invite_row
  from public.partner_onboarding_invites
  where token_hash = p_invite_token_hash
  for update;

  if not found
     or invite_row.revoked_at is not null
     or invite_row.expires_at <= now() then
    raise exception 'Partner onboarding invitation is invalid or expired.';
  end if;

  if invite_row.status = 'claimed'
     and invite_row.claimed_by_auth_user_id = p_auth_user_id
     and invite_row.association_id is not null then
    update public.partner_onboarding_invites
    set completion_token_hash = p_completion_token_hash
    where id = invite_row.id;

    return query
    select associations.id, associations.referral_code
    from public.associations
    where associations.id = invite_row.association_id;
    return;
  end if;

  if invite_row.status <> 'pending' then
    raise exception 'Partner onboarding invitation has already been used.';
  end if;

  if invite_row.email is not null
     and invite_row.email <> normalized_email then
    raise exception 'This partner invitation was issued to another email address.';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = p_auth_user_id
      and lower(email) = normalized_email
  ) then
    raise exception 'The Supabase account does not match this invitation.';
  end if;

  if exists (
    select 1
    from public.oneos_users
    where email = normalized_email
       or supabase_auth_user_id = p_auth_user_id
  ) then
    raise exception 'This account already has a Foundation-1 access profile.';
  end if;

  insert into public.associations (
    name,
    contact_name,
    contact_email,
    referral_code,
    status,
    partner_type,
    onboarding_status
  )
  values (
    trim(p_organisation_name),
    trim(p_contact_name),
    normalized_email,
    p_referral_code,
    'active',
    p_partner_type,
    'pending'
  )
  returning id into created_organisation_id;

  insert into public.oneos_users (
    email,
    name,
    role,
    password_hash,
    is_active,
    supabase_auth_user_id,
    partner_organisation_id,
    partner_org_id
  )
  values (
    normalized_email,
    trim(p_contact_name),
    'partner',
    null,
    true,
    p_auth_user_id,
    created_organisation_id,
    created_organisation_id::text
  );

  update public.partner_onboarding_invites
  set
    status = 'claimed',
    claimed_by_auth_user_id = p_auth_user_id,
    association_id = created_organisation_id,
    completion_token_hash = p_completion_token_hash,
    claimed_at = now()
  where id = invite_row.id;

  insert into public.partner_activities (
    association_id,
    event_type,
    safe_detail
  )
  values (
    created_organisation_id,
    'onboarding_started',
    'A Foundation-1 partner invitation was claimed.'
  );

  return query
  select created_organisation_id, p_referral_code;
end;
$$;

create or replace function public.complete_partner_onboarding(
  p_completion_token_hash text,
  p_referrals jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invite_row public.partner_onboarding_invites%rowtype;
  inserted_count integer := 0;
begin
  if p_completion_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid partner onboarding session.';
  end if;

  if jsonb_typeof(p_referrals) <> 'array'
     or jsonb_array_length(p_referrals) < 1
     or jsonb_array_length(p_referrals) > 100 then
    raise exception 'Submit between 1 and 100 member email addresses.';
  end if;

  select *
  into invite_row
  from public.partner_onboarding_invites
  where completion_token_hash = p_completion_token_hash
  for update;

  if not found
     or invite_row.status <> 'claimed'
     or invite_row.expires_at <= now()
     or invite_row.association_id is null then
    raise exception 'Partner onboarding session is invalid or expired.';
  end if;

  insert into public.association_referrals (
    association_id,
    invited_email,
    source,
    status,
    invited_by_user_id
  )
  select
    invite_row.association_id,
    lower(trim(referral.value->>'email')),
    referral.value->>'source',
    'invited',
    users.id
  from jsonb_array_elements(p_referrals) as referral(value)
  join public.oneos_users as users
    on users.supabase_auth_user_id = invite_row.claimed_by_auth_user_id
  where position('@' in lower(trim(referral.value->>'email'))) > 1
    and referral.value->>'source' in ('paste', 'csv')
  on conflict do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count < 1 then
    raise exception 'No new member invitations were created.';
  end if;

  update public.associations
  set
    onboarding_status = 'active',
    onboarding_completed_at = now()
  where id = invite_row.association_id;

  update public.partner_onboarding_invites
  set
    status = 'completed',
    completed_at = now(),
    completion_token_hash = null
  where id = invite_row.id;

  insert into public.partner_activities (
    association_id,
    event_type,
    safe_detail,
    safe_metadata
  )
  values (
    invite_row.association_id,
    'onboarding_completed',
    'Partner onboarding was completed.',
    jsonb_build_object('member_count', inserted_count)
  );

  return inserted_count;
end;
$$;

alter table public.partner_onboarding_invites enable row level security;

revoke all on table public.partner_onboarding_invites from anon, authenticated;
grant all on table public.partner_onboarding_invites to service_role;

drop policy if exists "service role manages partner onboarding invites"
  on public.partner_onboarding_invites;
create policy "service role manages partner onboarding invites"
on public.partner_onboarding_invites
for all to service_role
using (true)
with check (true);

revoke all on function public.claim_partner_onboarding_invite(
  text, text, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.claim_partner_onboarding_invite(
  text, text, uuid, text, text, text, text, text
) to service_role;

revoke all on function public.complete_partner_onboarding(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_partner_onboarding(text, jsonb)
  to service_role;
