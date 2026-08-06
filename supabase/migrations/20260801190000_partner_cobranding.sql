-- Partner co-branding: member-facing brand identity for association partners,
-- plus an immutable brand snapshot on each attributed migration case so the
-- client dashboard stays co-branded even if the partner record later changes.

alter table public.associations
  add column if not exists brand_display_name text,
  add column if not exists brand_short_name text,
  add column if not exists brand_logo_url text,
  add column if not exists brand_tagline text,
  add column if not exists brand_enabled boolean not null default false;

alter table public.migration_cases
  add column if not exists partner_brand jsonb;

create index if not exists associations_brand_enabled_idx
  on public.associations (referral_code)
  where brand_enabled;

-- North West African Farmers Association of South Africa (nwafasa.org).
insert into public.associations (
  name, sector, referral_code, website, status, partner_type, onboarding_status,
  commission_model, commission_value
)
select
  'North West African Farmers Association of South Africa',
  'Agriculture',
  'NWAFASA',
  'https://nwafasa.org',
  'active',
  'association',
  'active',
  'flat_per_deal',
  0
where not exists (
  select 1 from public.associations where referral_code = 'NWAFASA'
);

update public.associations
set
  brand_display_name = 'North West African Farmers Association of South Africa',
  brand_short_name = 'NWAFASA',
  brand_tagline = 'Member energy migration programme',
  brand_enabled = true
where referral_code = 'NWAFASA';

update public.associations
set
  brand_display_name = 'Milk Producers Organisation',
  brand_short_name = 'MPO',
  brand_tagline = 'Member energy migration programme',
  brand_enabled = true
where referral_code = 'MPODAIRY';
