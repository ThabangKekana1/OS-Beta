-- Local development seed only. Supabase runs this after local migrations.
-- Production partner organisations must be created through the audited admin
-- and onboarding flows delivered in later milestones.

insert into public.associations (
  id,
  name,
  sector,
  contact_name,
  contact_email,
  referral_code,
  status,
  partner_type,
  onboarding_status,
  onboarding_completed_at
)
values (
  '00000000-0000-4000-8000-000000000101',
  'Foundation-1 Demo Cooperative',
  'Agriculture',
  'Demo Migration Leader',
  'migration-leader@example.test',
  'F1-DEMO',
  'active',
  'cooperative',
  'active',
  now()
)
on conflict (referral_code) do nothing;

insert into public.association_referrals (
  id,
  association_id,
  invited_email,
  source,
  status,
  invitation_sent_at
)
values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  'member@example.test',
  'paste',
  'invited',
  now()
)
on conflict (id) do nothing;

insert into public.partner_onboarding_invites (
  id,
  token_hash,
  email,
  status,
  expires_at
)
values (
  '00000000-0000-4000-8000-000000000301',
  encode(
    digest('partner-onboarding:F1-DEMO-PARTNER-ACCESS-2026', 'sha256'),
    'hex'
  ),
  'new-partner@example.test',
  'pending',
  now() + interval '30 days'
)
on conflict (id) do nothing;
