# Partner Distribution Platform v0.1

## Milestone 1 implemented

- Existing `associations` records are the canonical partner organisations.
- Existing `oneos_users` records are the canonical partner users.
- Existing `association_referrals` records are the canonical invitations and
  referrals.
- Existing `migration_cases` records remain the single source of truth for a
  member's migration.
- A referral may link to at most one canonical migration case.
- Partner agreement, manual revenue, and safe activity records have been added.
- Partner-facing pipeline stages and metrics are deterministic projections of
  canonical migration data.
- Partners are scoped to one UUID organisation and malformed or missing
  mappings fail closed.
- Partner reads explicitly exclude bills, KYC documents, banking notes and raw
  migration event metadata.

## Milestone 2 implemented

- Foundation-1 administrators issue single-use, expiring onboarding links.
- A Supabase account alone grants no partner access.
- Partners create a password of at least 12 characters during onboarding.
- Supabase owns the password credential; it never passes through a 1OS API.
- Email confirmation is required before normal partner access.
- Authentication resolves the provisioned Supabase user ID before falling back
  to legacy email profile lookup.
- Onboarding contains exactly three screens: partner type, account details, and
  the first member invitations.
- Pasted and CSV emails create real partner-owned referral records. CSV content
  is processed in the browser and the file is not stored.
- Anonymous, client, sales, malformed and unlinked users fail closed on partner
  routes.

## Milestone 3 implemented

- Partner invitations use single-use random tokens; only domain-separated
  hashes are stored.
- Invitation delivery is capped at 100 recipients per request and five
  concurrent sends.
- Resending rotates the invitation token. Cancelling clears it.
- Individual invitation links expire and can open only one canonical migration
  case for the invited email.
- General campaign links resolve the active partner from its referral code and
  create or reuse one partner-owned referral for the submitted business email.
- The public pricing site sends only invitation tokens or campaign codes. 1OS
  resolves them server-side and writes the resulting referral foreign key to
  the canonical migration case.
- Duplicate, invalid, expired, inactive and cancelled paths fail explicitly.
- Production invitation delivery defaults off unless
  `PARTNER_REFERRAL_DELIVERY_ENABLED=true`; Vercel preview/test environments
  default on.

## Release gate implemented

- The public website closes Get Started, Client Access, migration workspaces and
  their APIs by default on Vercel production.
- Vercel preview deployments and local development keep the full test flow
  available.
- `FOUNDATION1_PUBLIC_INTAKE_ENABLED=true|false` is the explicit override.
- The production website release is live at `https://foundation-1.co.za`.
- Production `/pricing`, `/login`, `/register`, `/migration/*` and
  `/migrate/*` redirect to `/coming-soon`; migration APIs return HTTP 503.
- The Awaken public pathway now states savings of up to 58%, subject to the
  bill-audited case.

## Not yet implemented

- Mission Control and member views
- Impact and Rewards interface
- Partner administration interface
- Deployment of the partner workflow or its database migrations
- An active isolated Supabase test database for the 1OS preview deployment

These remain separate milestones and must not introduce a parallel client,
proposal, calculation or migration workflow.
