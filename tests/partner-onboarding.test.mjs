import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  extractPartnerInviteEmails,
  mergePartnerInvites,
  normalisePartnerInviteEmail,
} from "../lib/partner-distribution/invitations.ts";
import {
  createPartnerOnboardingToken,
  partnerOnboardingTokenHash,
} from "../lib/partner-distribution/onboarding.ts";

function source(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("partner invite parsing extracts and deduplicates emails without storing CSV files", () => {
  assert.equal(
    normalisePartnerInviteEmail(" MEMBER@EXAMPLE.CO.ZA "),
    "member@example.co.za",
  );
  assert.equal(normalisePartnerInviteEmail("not-an-email"), null);

  const pasted = extractPartnerInviteEmails(
    "one@example.test; TWO@example.test one@example.test",
    "paste",
  );
  const csv = extractPartnerInviteEmails(
    "name,email\nThree,three@example.test\nTwo,two@example.test",
    "csv",
  );
  assert.deepEqual(mergePartnerInvites(pasted, csv), [
    { email: "one@example.test", source: "paste" },
    { email: "two@example.test", source: "paste" },
    { email: "three@example.test", source: "csv" },
  ]);
});

test("partner onboarding tokens are opaque and only their hashes are persisted", () => {
  const token = createPartnerOnboardingToken();
  const hash = partnerOnboardingTokenHash(token);
  assert.match(token, /^[A-Za-z0-9_-]{40,60}$/);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(hash, partnerOnboardingTokenHash(token));
});

test("partner onboarding is invitation-only and account passwords stay in Supabase", () => {
  const migration = source(
    "supabase/migrations/20260723190000_partner_invitation_only_onboarding.sql",
  );
  const onboarding = source(
    "components/partner/PartnerOnboardingFlow.tsx",
  );
  const startRoute = source(
    "app/api/partner/onboarding/start/route.ts",
  );
  const page = source("app/partner/onboarding/page.tsx");

  assert.match(migration, /partner_onboarding_invites/);
  assert.match(migration, /status <> 'pending'/);
  assert.match(migration, /expires_at <= now\(\)/);
  assert.match(migration, /claimed_by_auth_user_id = p_auth_user_id/);
  assert.match(migration, /security definer/i);
  assert.match(
    migration,
    /revoke all on function public\.claim_partner_onboarding_invite[\s\S]*from public, anon, authenticated/,
  );
  assert.match(page, /findPartnerOnboardingInvite/);
  assert.match(page, /Invitation required/);
  assert.match(onboarding, /supabase\.auth\.signUp/);
  assert.match(onboarding, /supabase\.auth\.signInWithPassword/);
  assert.match(onboarding, /minLength=\{12\}/);
  assert.doesNotMatch(startRoute, /password/);
  assert.match(startRoute, /auth\.admin\.getUserById/);
  assert.match(startRoute, /claimPartnerOnboardingInvite/);
});

test("onboarding contains exactly the three approved screens", () => {
  const onboarding = source(
    "components/partner/PartnerOnboardingFlow.tsx",
  );
  assert.match(onboarding, /Screen one/);
  assert.match(onboarding, /Who are you\?/);
  assert.match(onboarding, /Screen two/);
  assert.match(onboarding, /Organisation Name/);
  assert.match(onboarding, /Contact Person/);
  assert.match(onboarding, /Password/);
  assert.match(onboarding, /Screen three/);
  assert.match(onboarding, /Invite your first members/);
  assert.match(onboarding, /Paste Emails/);
  assert.match(onboarding, /Upload CSV/);
  assert.doesNotMatch(onboarding, /Screen four/);
});

test("completing onboarding creates partner-owned referrals and never stores the CSV", () => {
  const migration = source(
    "supabase/migrations/20260723190000_partner_invitation_only_onboarding.sql",
  );
  const completion = source(
    "app/api/partner/onboarding/complete/route.ts",
  );
  assert.match(migration, /insert into public\.association_referrals/);
  assert.match(migration, /invite_row\.association_id/);
  assert.match(migration, /jsonb_array_length\(p_referrals\) > 100/);
  assert.match(migration, /on conflict do nothing/);
  assert.match(completion, /mergePartnerInvites/);
  assert.doesNotMatch(completion, /storage|bucket|upload/);
});

test("only Foundation-1 administrators can issue onboarding access", () => {
  const route = source(
    "app/api/admin/partner-onboarding-invites/route.ts",
  );
  assert.match(route, /session\.role !== "admin"/);
  assert.match(route, /issuePartnerOnboardingInvite/);
  assert.match(route, /expiresInDays > 30/);
  assert.match(route, /inviteUrl/);
});

test("partner login and routes reject authenticated users without a provisioned partner profile", () => {
  const login = source("components/auth/LoginForm.tsx");
  const authServer = source("lib/auth-server.ts");
  const auth = source("lib/auth.ts");
  const proxy = source("proxy.ts");
  const partnerPage = source("app/partner/(protected)/page.tsx");

  assert.match(login, /profilePayload\.session\?\.role !== "partner"/);
  assert.match(login, /supabase\.auth\.signOut/);
  assert.match(authServer, /!user\.email_confirmed_at/);
  assert.match(authServer, /findProfileByAuthUserId\(user\.id\)/);
  assert.match(auth, /if \(role === "partner"\) return "\/partner"/);
  assert.match(proxy, /pathname === "\/partner"/);
  assert.match(proxy, /"\/partner\/login"/);
  assert.match(partnerPage, /requireServerAuthSession\("partner"\)/);
});
