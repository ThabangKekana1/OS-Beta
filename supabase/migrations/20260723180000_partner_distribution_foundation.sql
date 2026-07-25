-- Foundation-1 Partner Distribution Platform v0.1: data foundation.
--
-- The existing associations, oneos_users, association_referrals and
-- migration_cases tables remain canonical. This migration adds the minimum
-- partner-domain fields, a one-referral-to-one-case linkage, and manual
-- agreement/revenue/activity records. All access remains service-role only.

-- ---------------------------------------------------------------------------
-- Partner organisations
-- ---------------------------------------------------------------------------

alter table public.associations
  add column if not exists partner_type text,
  add column if not exists onboarding_status text,
  add column if not exists onboarding_completed_at timestamptz;

update public.associations
set
  partner_type = coalesce(partner_type, 'association'),
  onboarding_status = coalesce(onboarding_status, 'active'),
  onboarding_completed_at = coalesce(onboarding_completed_at, created_at)
where partner_type is null
   or onboarding_status is null
   or onboarding_completed_at is null;

alter table public.associations
  alter column partner_type set default 'association',
  alter column partner_type set not null,
  alter column onboarding_status set default 'pending',
  alter column onboarding_status set not null;

alter table public.associations
  drop constraint if exists associations_partner_type_check;
alter table public.associations
  add constraint associations_partner_type_check check (
    partner_type in (
      'association',
      'cooperative',
      'government_programme',
      'consultant',
      'introducer'
    )
  );

alter table public.associations
  drop constraint if exists associations_onboarding_status_check;
alter table public.associations
  add constraint associations_onboarding_status_check check (
    onboarding_status in ('pending', 'active', 'suspended')
  );

-- ---------------------------------------------------------------------------
-- Partner users
-- ---------------------------------------------------------------------------

alter table public.oneos_users
  add column if not exists supabase_auth_user_id uuid,
  add column if not exists partner_organisation_id uuid;

update public.oneos_users as users
set partner_organisation_id = users.partner_org_id::uuid
where users.partner_organisation_id is null
  and users.partner_org_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.associations
    where associations.id = users.partner_org_id::uuid
  );

alter table public.oneos_users
  drop constraint if exists oneos_users_supabase_auth_user_id_fkey;
alter table public.oneos_users
  add constraint oneos_users_supabase_auth_user_id_fkey
  foreign key (supabase_auth_user_id)
  references auth.users(id)
  on delete set null;

alter table public.oneos_users
  drop constraint if exists oneos_users_partner_organisation_id_fkey;
alter table public.oneos_users
  add constraint oneos_users_partner_organisation_id_fkey
  foreign key (partner_organisation_id)
  references public.associations(id)
  on delete set null;

alter table public.oneos_users
  alter column password_hash drop not null;
alter table public.oneos_users
  drop constraint if exists oneos_users_password_format;
alter table public.oneos_users
  add constraint oneos_users_password_format check (
    password_hash is null or password_hash like 'pbkdf2:%'
  );

create unique index if not exists oneos_users_supabase_auth_user_id_uidx
  on public.oneos_users (supabase_auth_user_id)
  where supabase_auth_user_id is not null;
create index if not exists oneos_users_partner_organisation_id_idx
  on public.oneos_users (partner_organisation_id)
  where partner_organisation_id is not null;

-- ---------------------------------------------------------------------------
-- Partner referrals and invitations
-- ---------------------------------------------------------------------------

alter table public.association_referrals
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists invited_email text,
  add column if not exists source text not null default 'legacy',
  add column if not exists status text not null default 'invited',
  add column if not exists invite_token_hash text,
  add column if not exists invited_by_user_id uuid,
  add column if not exists invitation_sent_at timestamptz,
  add column if not exists registered_at timestamptz,
  add column if not exists last_error text;

update public.association_referrals
set
  status = case when assessment_id is not null then 'registered' else status end,
  registered_at = case
    when assessment_id is not null then coalesce(registered_at, created_at)
    else registered_at
  end;

alter table public.association_referrals
  drop constraint if exists association_referrals_invited_by_user_id_fkey;
alter table public.association_referrals
  add constraint association_referrals_invited_by_user_id_fkey
  foreign key (invited_by_user_id)
  references public.oneos_users(id)
  on delete set null;

alter table public.association_referrals
  drop constraint if exists association_referrals_email_check;
alter table public.association_referrals
  add constraint association_referrals_email_check check (
    invited_email is null
    or (
      invited_email = lower(invited_email)
      and position('@' in invited_email) > 1
    )
  );

alter table public.association_referrals
  drop constraint if exists association_referrals_source_check;
alter table public.association_referrals
  add constraint association_referrals_source_check check (
    source in ('paste', 'csv', 'individual_link', 'campaign_link', 'legacy')
  );

alter table public.association_referrals
  drop constraint if exists association_referrals_status_check;
alter table public.association_referrals
  add constraint association_referrals_status_check check (
    status in ('invited', 'registered', 'active', 'completed', 'cancelled', 'failed')
  );

alter table public.association_referrals
  drop constraint if exists association_referrals_invite_token_hash_check;
alter table public.association_referrals
  add constraint association_referrals_invite_token_hash_check check (
    invite_token_hash is null or invite_token_hash ~ '^[0-9a-f]{64}$'
  );

create unique index if not exists association_referrals_invite_token_hash_uidx
  on public.association_referrals (invite_token_hash)
  where invite_token_hash is not null;
create unique index if not exists association_referrals_org_email_uidx
  on public.association_referrals (association_id, invited_email)
  where invited_email is not null
    and status not in ('cancelled', 'failed');
create index if not exists association_referrals_status_created_at_idx
  on public.association_referrals (association_id, status, created_at desc);

drop trigger if exists set_updated_at_association_referrals
  on public.association_referrals;
create trigger set_updated_at_association_referrals
before update on public.association_referrals
for each row execute function public.oneos_set_updated_at();

-- ---------------------------------------------------------------------------
-- Canonical referral-to-migration-case relationship
-- ---------------------------------------------------------------------------

alter table public.migration_cases
  add column if not exists partner_referral_id uuid;

alter table public.migration_cases
  drop constraint if exists migration_cases_partner_referral_id_fkey;
alter table public.migration_cases
  add constraint migration_cases_partner_referral_id_fkey
  foreign key (partner_referral_id)
  references public.association_referrals(id)
  on delete set null;

create unique index if not exists migration_cases_partner_referral_id_uidx
  on public.migration_cases (partner_referral_id)
  where partner_referral_id is not null;

-- ---------------------------------------------------------------------------
-- Agreements and the manual revenue ledger
-- ---------------------------------------------------------------------------

create table if not exists public.partner_agreements (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version text not null,
  status text not null default 'draft',
  terms jsonb not null default '{}'::jsonb,
  accepted_by_user_id uuid references public.oneos_users(id) on delete set null,
  accepted_at timestamptz,
  effective_at timestamptz,
  superseded_at timestamptz,
  constraint partner_agreements_status_check check (
    status in ('draft', 'active', 'superseded', 'terminated')
  ),
  constraint partner_agreements_active_check check (
    status <> 'active'
    or (
      accepted_by_user_id is not null
      and accepted_at is not null
      and effective_at is not null
    )
  ),
  unique (association_id, version)
);

create unique index if not exists partner_agreements_one_active_uidx
  on public.partner_agreements (association_id)
  where status = 'active';

create table if not exists public.partner_revenues (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  case_id uuid references public.migration_cases(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'estimated',
  amount_rands numeric(16, 2) not null,
  basis text not null,
  source_reference text,
  recorded_by_user_id uuid not null references public.oneos_users(id) on delete restrict,
  confirmed_at timestamptz,
  paid_at timestamptz,
  notes text,
  constraint partner_revenues_status_check check (
    status in ('estimated', 'confirmed', 'paid', 'void')
  ),
  constraint partner_revenues_amount_check check (amount_rands >= 0),
  constraint partner_revenues_paid_check check (
    status <> 'paid' or paid_at is not null
  )
);

create index if not exists partner_revenues_association_status_idx
  on public.partner_revenues (association_id, status, created_at desc);
create index if not exists partner_revenues_case_idx
  on public.partner_revenues (case_id)
  where case_id is not null;

-- ---------------------------------------------------------------------------
-- Safe partner activity record
-- ---------------------------------------------------------------------------

create table if not exists public.partner_activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  association_id uuid not null references public.associations(id) on delete cascade,
  actor_user_id uuid references public.oneos_users(id) on delete set null,
  referral_id uuid references public.association_referrals(id) on delete set null,
  case_id uuid references public.migration_cases(id) on delete set null,
  event_type text not null,
  safe_detail text,
  safe_metadata jsonb not null default '{}'::jsonb,
  constraint partner_activities_event_type_check check (
    event_type in (
      'onboarding_started',
      'onboarding_completed',
      'invitation_created',
      'invitation_sent',
      'referral_registered',
      'campaign_link_copied',
      'partner_login',
      'agreement_accepted',
      'revenue_recorded'
    )
  )
);

create index if not exists partner_activities_association_created_at_idx
  on public.partner_activities (association_id, created_at desc);
create index if not exists partner_activities_referral_idx
  on public.partner_activities (referral_id, created_at desc)
  where referral_id is not null;
create index if not exists partner_activities_case_idx
  on public.partner_activities (case_id, created_at desc)
  where case_id is not null;

drop trigger if exists partner_agreements_updated_at
  on public.partner_agreements;
create trigger partner_agreements_updated_at
before update on public.partner_agreements
for each row execute function public.oneos_set_updated_at();

drop trigger if exists partner_revenues_updated_at
  on public.partner_revenues;
create trigger partner_revenues_updated_at
before update on public.partner_revenues
for each row execute function public.oneos_set_updated_at();

create or replace function public.partner_register_linked_referral()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  linked_association_id uuid;
  linked_invited_email text;
  linked_referral_status text;
begin
  if new.partner_referral_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.partner_referral_id is not distinct from old.partner_referral_id then
      return new;
    end if;
  end if;

  select association_id, invited_email, status
  into linked_association_id, linked_invited_email, linked_referral_status
  from public.association_referrals
  where id = new.partner_referral_id;

  if linked_referral_status in ('cancelled', 'failed') then
    raise exception 'Closed partner referrals cannot be linked to migration cases.';
  end if;

  if linked_invited_email is not null
     and linked_invited_email <> lower(new.contact_email) then
    raise exception 'The migration case email does not match the partner invitation.';
  end if;

  update public.association_referrals
  set
    status = case when status = 'invited' then 'registered' else status end,
    registered_at = coalesce(registered_at, new.created_at),
    member_business_name = coalesce(member_business_name, new.business_name)
  where id = new.partner_referral_id;

  if linked_association_id is not null then
    insert into public.partner_activities (
      association_id,
      referral_id,
      case_id,
      event_type,
      safe_detail,
      safe_metadata
    )
    values (
      linked_association_id,
      new.partner_referral_id,
      new.id,
      'referral_registered',
      'A referred member opened a Foundation-1 migration case.',
      jsonb_build_object('case_reference', new.public_reference)
    );
  end if;

  return new;
end;
$$;

create or replace function public.partner_prevent_referral_reassignment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.partner_referral_id is not null
     and new.partner_referral_id is distinct from old.partner_referral_id then
    raise exception 'Partner referral attribution is immutable once assigned.';
  end if;
  return new;
end;
$$;

drop trigger if exists migration_case_prevent_partner_referral_reassignment
  on public.migration_cases;
create trigger migration_case_prevent_partner_referral_reassignment
before update of partner_referral_id on public.migration_cases
for each row execute function public.partner_prevent_referral_reassignment();

drop trigger if exists migration_case_register_partner_referral
  on public.migration_cases;
create trigger migration_case_register_partner_referral
after insert or update of partner_referral_id on public.migration_cases
for each row execute function public.partner_register_linked_referral();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.partner_agreements enable row level security;
alter table public.partner_revenues enable row level security;
alter table public.partner_activities enable row level security;

revoke all on table public.associations from anon, authenticated;
revoke all on table public.association_referrals from anon, authenticated;
revoke all on table public.oneos_users from anon, authenticated;
revoke all on table public.migration_cases from anon, authenticated;
revoke all on table public.partner_agreements from anon, authenticated;
revoke all on table public.partner_revenues from anon, authenticated;
revoke all on table public.partner_activities from anon, authenticated;

grant all on table public.associations to service_role;
grant all on table public.association_referrals to service_role;
grant all on table public.oneos_users to service_role;
grant all on table public.migration_cases to service_role;
grant all on table public.partner_agreements to service_role;
grant all on table public.partner_revenues to service_role;
grant select, insert on table public.partner_activities to service_role;

drop policy if exists "service role manages partner agreements"
  on public.partner_agreements;
create policy "service role manages partner agreements"
on public.partner_agreements
for all to service_role
using (true)
with check (true);

drop policy if exists "service role manages partner revenues"
  on public.partner_revenues;
create policy "service role manages partner revenues"
on public.partner_revenues
for all to service_role
using (true)
with check (true);

drop policy if exists "service role reads partner activities"
  on public.partner_activities;
create policy "service role reads partner activities"
on public.partner_activities
for select to service_role
using (true);

drop policy if exists "service role records partner activities"
  on public.partner_activities;
create policy "service role records partner activities"
on public.partner_activities
for insert to service_role
with check (true);
