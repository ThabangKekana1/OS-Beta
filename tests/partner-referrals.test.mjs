import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  createPartnerReferralToken,
  parsePartnerAttribution,
  PartnerAttributionError,
  partnerReferralTokenHash,
} from "../lib/partner-distribution/referrals.ts";

function source(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("member invitation tokens are opaque and only domain-separated hashes persist", () => {
  const token = createPartnerReferralToken();
  const hash = partnerReferralTokenHash(token);
  assert.match(token, /^[A-Za-z0-9_-]{40,60}$/);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(hash, partnerReferralTokenHash(token));
});

test("public attribution accepts one bounded link type and rejects ambiguity", () => {
  assert.deepEqual(parsePartnerAttribution("a".repeat(43), null), {
    inviteToken: "a".repeat(43),
    campaignCode: null,
  });
  assert.deepEqual(parsePartnerAttribution(null, "f1-coop-01"), {
    inviteToken: null,
    campaignCode: "F1-COOP-01",
  });
  assert.deepEqual(parsePartnerAttribution(null, null), {
    inviteToken: null,
    campaignCode: null,
  });
  assert.throws(
    () => parsePartnerAttribution("a".repeat(43), "F1-COOP-01"),
    PartnerAttributionError,
  );
  assert.throws(
    () => parsePartnerAttribution("short", null),
    PartnerAttributionError,
  );
});

test("database attribution handles expiry, cancellation, duplicates and campaign ownership", () => {
  const migration = source(
    "supabase/migrations/20260723200000_partner_invitation_attribution.sql",
  );
  assert.match(migration, /invitation_expires_at timestamptz/);
  assert.match(migration, /resolve_partner_case_attribution/);
  assert.match(migration, /status <> 'invited'/);
  assert.match(migration, /invitation_expires_at <= now\(\)/);
  assert.match(migration, /already has an active migration case/);
  assert.match(migration, /source,[\s\S]*status[\s\S]*'campaign_link'/);
  assert.match(migration, /cancel_partner_member_invitation/);
  assert.match(migration, /invite_token_hash = null/);
  assert.match(
    migration,
    /revoke all on function public\.resolve_partner_case_attribution[\s\S]*from public, anon, authenticated/,
  );
});

test("invitation delivery has finite batch and concurrency limits", () => {
  const referrals = source("lib/partner-distribution/referrals.ts");
  const route = source("app/api/partner/invitations/route.ts");
  assert.match(referrals, /MAX_INVITATIONS_PER_BATCH = 100/);
  assert.match(referrals, /DELIVERY_CONCURRENCY = 5/);
  assert.match(referrals, /issue_partner_member_invitation/);
  assert.match(referrals, /record_partner_invitation_delivery/);
  assert.match(referrals, /partnerInvitationUrl\(token\)/);
  assert.match(referrals, /PARTNER_REFERRAL_DELIVERY_ENABLED/);
  assert.match(route, /session\?\.role === "partner"/);
  assert.match(route, /rawInvitations\.length > 100/);
});

test("onboarding sends the first member invitations after canonical completion", () => {
  const route = source("app/api/partner/onboarding/complete/route.ts");
  assert.match(route, /completePartnerOnboarding/);
  assert.match(route, /sendPendingPartnerInvitations/);
  assert.match(route, /organisationId: onboarding\.organisationId/);
});

test("public case creation resolves server-side attribution and links only its referral ID", () => {
  const route = source("app/api/migration-cases/route.ts");
  assert.match(route, /parsePartnerAttribution/);
  assert.match(route, /resolvePartnerCaseAttribution/);
  assert.match(
    route,
    /partnerReferralId: resolvedAttribution\?\.referralId \?\? null/,
  );
  assert.doesNotMatch(route, /body\.partnerReferralId/);
  assert.match(route, /status = error instanceof PartnerAttributionError/);
});

test("the public site carries individual and campaign attribution through its proxy", () => {
  const builder = source(
    "../NEW F-1/src/components/MigrationCaseBuilder.tsx",
  );
  const proxyRoute = source(
    "../NEW F-1/src/app/api/migration-cases/route.ts",
  );
  const campaignRoute = source(
    "../NEW F-1/src/app/migrate/[code]/page.tsx",
  );
  assert.match(builder, /params\.get\("r"\)/);
  assert.match(builder, /params\.get\("p"\)/);
  assert.match(builder, /partnerInviteToken: attribution\.partnerInviteToken/);
  assert.match(builder, /partnerCampaignCode: attribution\.partnerCampaignCode/);
  assert.match(proxyRoute, /\.\.\.body/);
  // Published campaign links land on the co-branded member entry, which itself
  // falls back to /pricing when the partner has no brand enabled.
  assert.match(campaignRoute, /redirect\(`\/estimate\/a\//);
});
