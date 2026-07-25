-- Foundation-1 Partner Distribution Platform v0.1: member invitation delivery
-- and canonical public-site attribution.
--
-- Raw invitation tokens never enter the database. The public site submits
-- either one token hash or one campaign code; this service-role-only resolver
-- returns the single association_referrals row that migration_cases may link.

alter table public.association_referrals
  add column if not exists invitation_expires_at timestamptz;

alter table public.association_referrals
  drop constraint if exists association_referrals_invitation_expiry_check;
alter table public.association_referrals
  add constraint association_referrals_invitation_expiry_check check (
    invite_token_hash is null
    or invitation_expires_at is not null
  );

alter table public.partner_activities
  drop constraint if exists partner_activities_event_type_check;
alter table public.partner_activities
  add constraint partner_activities_event_type_check check (
    event_type in (
      'onboarding_started',
      'onboarding_completed',
      'invitation_created',
      'invitation_sent',
      'invitation_failed',
      'invitation_cancelled',
      'referral_registered',
      'campaign_link_copied',
      'partner_login',
      'agreement_accepted',
      'revenue_recorded'
    )
  );

create or replace function public.issue_partner_member_invitation(
  p_association_id uuid,
  p_actor_user_id uuid,
  p_email text,
  p_source text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(trim(p_email));
  referral_row public.association_referrals%rowtype;
  referral_id uuid;
begin
  if normalized_email = ''
     or position('@' in normalized_email) <= 1 then
    raise exception 'Enter a valid member email address.';
  end if;
  if p_source not in ('paste', 'csv', 'individual_link') then
    raise exception 'Invalid partner invitation source.';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= now() then
    raise exception 'Invalid partner invitation token or expiry.';
  end if;
  if not exists (
    select 1
    from public.associations
    where id = p_association_id
      and status = 'active'
      and onboarding_status = 'active'
  ) then
    raise exception 'Partner organisation is not active.';
  end if;
  if not exists (
    select 1
    from public.oneos_users
    where id = p_actor_user_id
      and role = 'partner'
      and is_active = true
      and partner_organisation_id = p_association_id
  ) then
    raise exception 'Partner invitation access is not authorised.';
  end if;

  select referrals.*
  into referral_row
  from public.association_referrals as referrals
  where referrals.association_id = p_association_id
    and referrals.invited_email = normalized_email
    and referrals.status not in ('cancelled', 'failed')
  order by referrals.created_at desc
  limit 1
  for update;

  if found then
    if referral_row.status <> 'invited'
       or exists (
         select 1
         from public.migration_cases
         where partner_referral_id = referral_row.id
       ) then
      raise exception 'This member already has an active migration case.';
    end if;

    update public.association_referrals
    set
      source = case
        when source = 'legacy' then p_source
        else source
      end,
      invite_token_hash = p_token_hash,
      invitation_expires_at = p_expires_at,
      invitation_sent_at = null,
      invited_by_user_id = p_actor_user_id,
      last_error = null
    where id = referral_row.id
    returning id into referral_id;
  else
    insert into public.association_referrals (
      association_id,
      invited_email,
      source,
      status,
      invite_token_hash,
      invitation_expires_at,
      invited_by_user_id
    )
    values (
      p_association_id,
      normalized_email,
      p_source,
      'invited',
      p_token_hash,
      p_expires_at,
      p_actor_user_id
    )
    returning id into referral_id;
  end if;

  insert into public.partner_activities (
    association_id,
    actor_user_id,
    referral_id,
    event_type,
    safe_detail,
    safe_metadata
  )
  values (
    p_association_id,
    p_actor_user_id,
    referral_id,
    'invitation_created',
    'A secure member invitation was issued.',
    jsonb_build_object(
      'source', p_source,
      'expires_at', p_expires_at
    )
  );

  return referral_id;
end;
$$;

create or replace function public.record_partner_invitation_delivery(
  p_association_id uuid,
  p_actor_user_id uuid,
  p_referral_id uuid,
  p_token_hash text,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.oneos_users
    where id = p_actor_user_id
      and role = 'partner'
      and is_active = true
      and partner_organisation_id = p_association_id
  ) then
    raise exception 'Partner invitation access is not authorised.';
  end if;

  update public.association_referrals
  set
    invitation_sent_at = case when p_success then now() else null end,
    last_error = case
      when p_success then null
      else left(coalesce(nullif(trim(p_error), ''), 'Invitation delivery failed.'), 500)
    end
  where id = p_referral_id
    and association_id = p_association_id
    and status = 'invited'
    and invite_token_hash = p_token_hash;

  if not found then
    raise exception 'Partner invitation is no longer current.';
  end if;

  insert into public.partner_activities (
    association_id,
    actor_user_id,
    referral_id,
    event_type,
    safe_detail
  )
  values (
    p_association_id,
    p_actor_user_id,
    p_referral_id,
    case when p_success then 'invitation_sent' else 'invitation_failed' end,
    case
      when p_success then 'A secure member invitation was delivered.'
      else 'A secure member invitation could not be delivered.'
    end
  );
end;
$$;

create or replace function public.cancel_partner_member_invitation(
  p_association_id uuid,
  p_actor_user_id uuid,
  p_referral_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.oneos_users
    where id = p_actor_user_id
      and role = 'partner'
      and is_active = true
      and partner_organisation_id = p_association_id
  ) then
    raise exception 'Partner invitation access is not authorised.';
  end if;

  update public.association_referrals
  set
    status = 'cancelled',
    invite_token_hash = null,
    invitation_expires_at = null,
    last_error = null
  where id = p_referral_id
    and association_id = p_association_id
    and status = 'invited'
    and not exists (
      select 1
      from public.migration_cases
      where partner_referral_id = p_referral_id
    );

  if not found then
    raise exception 'Only an unused member invitation can be cancelled.';
  end if;

  insert into public.partner_activities (
    association_id,
    actor_user_id,
    referral_id,
    event_type,
    safe_detail
  )
  values (
    p_association_id,
    p_actor_user_id,
    p_referral_id,
    'invitation_cancelled',
    'A member invitation was cancelled.'
  );
end;
$$;

create or replace function public.resolve_partner_case_attribution(
  p_invite_token_hash text,
  p_campaign_code text,
  p_contact_email text,
  p_business_name text
)
returns table (
  referral_id uuid,
  association_id uuid,
  attribution_source text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(trim(p_contact_email));
  normalized_campaign_code text := upper(trim(coalesce(p_campaign_code, '')));
  referral_row public.association_referrals%rowtype;
  organisation_id uuid;
  created_referral_id uuid;
begin
  if normalized_email = ''
     or position('@' in normalized_email) <= 1 then
    raise exception 'Enter a valid email address.';
  end if;
  if (p_invite_token_hash is null) = (normalized_campaign_code = '') then
    raise exception 'Submit exactly one partner invitation or campaign code.';
  end if;

  if p_invite_token_hash is not null then
    if p_invite_token_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'Partner invitation is invalid, expired, or closed.';
    end if;

    select referrals.*
    into referral_row
    from public.association_referrals as referrals
    join public.associations as associations
      on associations.id = referrals.association_id
    where referrals.invite_token_hash = p_invite_token_hash
      and associations.status = 'active'
      and associations.onboarding_status = 'active'
    for update of referrals;

    if not found
       or referral_row.status <> 'invited'
       or referral_row.invitation_expires_at is null
       or referral_row.invitation_expires_at <= now() then
      raise exception 'Partner invitation is invalid, expired, or closed.';
    end if;
    if referral_row.invited_email <> normalized_email then
      raise exception 'Use the email address that received this invitation.';
    end if;
    if exists (
      select 1
      from public.migration_cases
      where partner_referral_id = referral_row.id
    ) then
      raise exception 'This partner invitation has already been used.';
    end if;

    return query
    select referral_row.id, referral_row.association_id, 'individual_link'::text;
    return;
  end if;

  select associations.id
  into organisation_id
  from public.associations as associations
  where upper(associations.referral_code) = normalized_campaign_code
    and associations.status = 'active'
    and associations.onboarding_status = 'active';

  if not found then
    raise exception 'Partner campaign is invalid or inactive.';
  end if;

  select referrals.*
  into referral_row
  from public.association_referrals as referrals
  where referrals.association_id = organisation_id
    and referrals.invited_email = normalized_email
    and referrals.status not in ('cancelled', 'failed')
  order by referrals.created_at desc
  limit 1
  for update;

  if found then
    if referral_row.status <> 'invited'
       or exists (
         select 1
         from public.migration_cases
         where partner_referral_id = referral_row.id
       ) then
      raise exception 'This referred business already has an active migration case.';
    end if;
    created_referral_id := referral_row.id;
  else
    insert into public.association_referrals (
      association_id,
      invited_email,
      member_business_name,
      source,
      status
    )
    values (
      organisation_id,
      normalized_email,
      nullif(trim(p_business_name), ''),
      'campaign_link',
      'invited'
    )
    on conflict do nothing
    returning id into created_referral_id;

    if created_referral_id is null then
      select referrals.id
      into created_referral_id
      from public.association_referrals as referrals
      where referrals.association_id = organisation_id
        and referrals.invited_email = normalized_email
        and referrals.status not in ('cancelled', 'failed')
      order by referrals.created_at desc
      limit 1
      for update;
    else
      insert into public.partner_activities (
        association_id,
        referral_id,
        event_type,
        safe_detail,
        safe_metadata
      )
      values (
        organisation_id,
        created_referral_id,
        'invitation_created',
        'A member entered through a partner campaign link.',
        jsonb_build_object('source', 'campaign_link')
      );
    end if;
  end if;

  if created_referral_id is null
     or exists (
       select 1
       from public.migration_cases
       where partner_referral_id = created_referral_id
     ) then
    raise exception 'This referred business already has an active migration case.';
  end if;

  return query
  select created_referral_id, organisation_id, 'campaign_link'::text;
end;
$$;

revoke all on function public.issue_partner_member_invitation(
  uuid, uuid, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.issue_partner_member_invitation(
  uuid, uuid, text, text, text, timestamptz
) to service_role;

revoke all on function public.record_partner_invitation_delivery(
  uuid, uuid, uuid, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.record_partner_invitation_delivery(
  uuid, uuid, uuid, text, boolean, text
) to service_role;

revoke all on function public.cancel_partner_member_invitation(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.cancel_partner_member_invitation(
  uuid, uuid, uuid
) to service_role;

revoke all on function public.resolve_partner_case_attribution(
  text, text, text, text
) from public, anon, authenticated;
grant execute on function public.resolve_partner_case_attribution(
  text, text, text, text
) to service_role;
