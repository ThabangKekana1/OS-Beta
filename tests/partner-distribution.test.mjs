import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  assertOrganisationAccess,
  calculatePartnerMissionMetrics,
  calculatePartnerSuccessChecklist,
  buildPartnerMemberSummary,
  organisationScopeForSession,
  PartnerAccessError,
  partnerPipelineStage,
} from "../lib/partner-distribution/index.ts";

const organisationA = "00000000-0000-4000-8000-000000000101";
const organisationB = "00000000-0000-4000-8000-000000000102";

function session(role, partnerOrgId = null) {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    email: `${role}@example.test`,
    name: role,
    role,
    agentId: null,
    partnerOrgId,
  };
}

function member(overrides = {}) {
  return {
    referralId: "referral-1",
    company: "Example Cooperative Member",
    contactName: "Member",
    contactEmail: "member@example.test",
    invitedAt: "2026-07-23T10:00:00.000Z",
    registeredAt: null,
    caseId: null,
    currentStage: "invited",
    canonicalStage: null,
    activeBillFileCount: 0,
    proposalGeneratedAt: null,
    proposalEconomicallyPositive: null,
    estimatedMonthlySavingsRands: null,
    qualifiedDealBookRands: 0,
    whatFoundationOneIsDoing: "Waiting.",
    clientNextAction: "Open invitation.",
    ...overrides,
  };
}

test("partner permissions fail closed and scope every partner to one UUID organisation", () => {
  assert.deepEqual(organisationScopeForSession(session("admin")), {
    mode: "all",
  });
  assert.deepEqual(
    organisationScopeForSession(session("partner", organisationA)),
    { mode: "single", organisationId: organisationA },
  );
  assert.throws(
    () => organisationScopeForSession(session("partner", "legacy-code")),
    PartnerAccessError,
  );
  assert.throws(
    () => organisationScopeForSession(session("partner")),
    PartnerAccessError,
  );
  assert.throws(
    () => organisationScopeForSession(session("sales")),
    PartnerAccessError,
  );
  assert.throws(
    () =>
      assertOrganisationAccess(
        session("partner", organisationA),
        organisationB,
      ),
    PartnerAccessError,
  );
  assert.doesNotThrow(() =>
    assertOrganisationAccess(session("partner", organisationA), organisationA),
  );
  assert.doesNotThrow(() =>
    assertOrganisationAccess(session("admin"), organisationB),
  );
});

test("canonical stages project to the simple partner migration language", () => {
  const expected = {
    bill_pack_required: "waiting_for_utility_bills",
    bill_pack_processing: "bills_under_review",
    bill_pack_review: "bills_under_review",
    proposal_ready: "proposal_ready",
    proposal_not_recommended: "proposal_ready",
    eoi_signed: "proposal_being_prepared",
    partner_proposal_ready: "awaiting_decision",
    partner_proposal_signed: "kyc",
    kyc_ready: "kyc",
    kyc_verified: "kyc",
    submitted_to_funder: "funding",
    kyc_handed_off: "funding",
    kyc_direct_submitted: "funding",
    term_sheet_issued: "term_sheet",
  };

  assert.equal(partnerPipelineStage(null), "invited");
  for (const [canonical, projected] of Object.entries(expected)) {
    assert.equal(partnerPipelineStage(canonical), projected, canonical);
  }
  assert.equal(Object.values(expected).includes("migration"), false);
  assert.equal(Object.values(expected).includes("completed"), false);
});

test("legacy registered referrals remain visible without fabricating a canonical case stage", () => {
  const summary = buildPartnerMemberSummary(
    {
      id: "referral-legacy",
      associationId: organisationA,
      invitedEmail: "member@example.test",
      memberBusinessName: "Legacy Member",
      source: "legacy",
      status: "registered",
      createdAt: "2026-07-23T10:00:00.000Z",
      invitationSentAt: null,
      registeredAt: "2026-07-23T11:00:00.000Z",
    },
    null,
  );

  assert.equal(summary.currentStage, "registered");
  assert.equal(summary.canonicalStage, null);
  assert.equal(summary.caseId, null);
});

test("mission metrics use canonical proposal and term-sheet values without inventing calculations", () => {
  const members = [
    member(),
    member({
      referralId: "referral-2",
      caseId: "case-2",
      registeredAt: "2026-07-23T11:00:00.000Z",
      canonicalStage: "term_sheet_issued",
      currentStage: "term_sheet",
      activeBillFileCount: 6,
      proposalGeneratedAt: "2026-07-23T12:00:00.000Z",
      proposalEconomicallyPositive: true,
      estimatedMonthlySavingsRands: 4_500,
      qualifiedDealBookRands: 1_200_000,
    }),
  ];
  const revenues = [
    {
      id: "revenue-1",
      associationId: organisationA,
      caseId: "case-2",
      status: "estimated",
      amountRands: 12_000,
    },
    {
      id: "revenue-2",
      associationId: organisationA,
      caseId: "case-2",
      status: "paid",
      amountRands: 4_000,
    },
  ];

  assert.deepEqual(calculatePartnerMissionMetrics(members, revenues), {
    businessesInvited: 2,
    businessesRegistered: 1,
    utilityBillsUploaded: 1,
    migrationProposals: 1,
    qualifiedMigrationCases: 1,
    activeMigrations: 0,
    estimatedMonthlyMemberSavingsRands: 4_500,
    qualifiedDealBookRands: 1_200_000,
    businessesMigrated: 0,
    rewards: {
      configured: true,
      estimatedRevenuePipelineRands: 12_000,
      confirmedRevenueRands: 4_000,
      paymentsReceivedRands: 4_000,
    },
  });
});

test("success checklist is deterministic and does not fabricate migration completion", () => {
  const checklist = calculatePartnerSuccessChecklist([
    member({
      caseId: "case-1",
      registeredAt: "2026-07-23T11:00:00.000Z",
      canonicalStage: "partner_proposal_signed",
      currentStage: "kyc",
      activeBillFileCount: 6,
      proposalGeneratedAt: "2026-07-23T12:00:00.000Z",
    }),
  ]);

  assert.deepEqual(checklist, {
    firstMemberInvited: true,
    firstRegistration: true,
    firstBillsUploaded: true,
    firstProposalGenerated: true,
    firstProposalAccepted: true,
    firstMigration: false,
  });
});

test("database migration reuses canonical records and locks partner data to service-role access", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260723180000_partner_distribution_foundation.sql",
    ),
    "utf8",
  );

  assert.match(migration, /alter table public\.associations/);
  assert.match(migration, /alter table public\.oneos_users/);
  assert.match(migration, /alter table public\.association_referrals/);
  assert.match(migration, /alter table public\.migration_cases/);
  assert.match(
    migration,
    /foreign key \(partner_referral_id\)[\s\S]*public\.association_referrals/,
  );
  assert.match(
    migration,
    /unique index[\s\S]*migration_cases_partner_referral_id_uidx/,
  );
  assert.match(
    migration,
    /Partner referral attribution is immutable once assigned/,
  );
  assert.match(
    migration,
    /migration case email does not match the partner invitation/i,
  );
  assert.match(migration, /create table if not exists public\.partner_agreements/);
  assert.match(migration, /create table if not exists public\.partner_revenues/);
  assert.match(migration, /create table if not exists public\.partner_activities/);
  assert.match(
    migration,
    /revoke all on table public\.partner_activities from anon, authenticated/,
  );
  assert.doesNotMatch(migration, /create table if not exists public\.partner_users/);
  assert.doesNotMatch(migration, /create table if not exists public\.partner_organisations/);
  assert.doesNotMatch(migration, /create table if not exists public\.partner_clients/);
});

test("canonical case creation accepts one validated referral foreign key", () => {
  const store = readFileSync(
    join(process.cwd(), "lib/migration-case-store.ts"),
    "utf8",
  );
  assert.match(store, /partnerReferralId\?: string \| null/);
  assert.match(
    store,
    /partner_referral_id: input\.partnerReferralId \?\? null/,
  );
});

test("partner data store selects safe projections and no protected document payloads", () => {
  const store = readFileSync(
    join(process.cwd(), "lib/partner-distribution/store.ts"),
    "utf8",
  );

  assert.match(store, /\.eq\("association_id", organisationId\)/);
  assert.match(store, /\.in\("partner_referral_id", referralIds\)/);
  assert.doesNotMatch(store, /migration_case_bill_files/);
  assert.doesNotMatch(store, /migration_case_kyc_documents/);
  assert.doesNotMatch(store, /migration_case_events/);
  assert.doesNotMatch(store, /review_note|notes|storage_path|manifest/);
});
