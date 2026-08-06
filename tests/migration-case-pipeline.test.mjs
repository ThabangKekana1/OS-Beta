import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildIndicativeMigrationReport,
  REQUIRED_FORMAL_BILLING_PERIODS,
} from "../lib/indicative-migration-report.ts";
import {
  buildMigrationCaseEoiPdf,
  MIGRATION_CASE_EOI_DECLARATIONS_VERSION,
} from "../lib/migration-case-eoi-pdf.ts";
import { publicMigrationCaseState } from "../lib/migration-case-store.ts";
import { buildF1Proposal } from "../lib/f1-proposal.ts";
import { currentiseEskomBill } from "../lib/eskom-tariff-currentisation.ts";
import {
  aggregateUtilityBills,
  analyseUtilityBillText,
} from "../lib/utility-bill-analysis.ts";
import { ENGINE_CONSTANTS, runPricingEngine } from "../lib/pricing-engine.ts";

const workspace = join(process.cwd(), "..");

function source(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("first migration report is generated without a utility bill", () => {
  const report = buildIndicativeMigrationReport({
    monthlySpendExVat: 25_000,
    siteCity: "Katlehong",
    province: "Gauteng",
    supplyType: "eskom-direct",
    generatedAt: "2026-07-11T00:00:00.000Z",
  });

  assert.equal(report.evidenceLevel, "indicative-no-bills");
  assert.equal(report.input.monthlyKwh, null);
  assert.equal(report.input.kwhSource, "tariff-band-assumption");
  assert.equal(report.scenarios.length, 3);
  assert.ok(report.scenarios.every((scenario) => scenario.pvKwp >= 35));
  assert.equal(report.nextStep.requiredBillingPeriods, 6);
  assert.match(report.limitations[0], /no utility bill/i);
  assert.match(report.limitations.join(" "), /(cannot|do not) identify an exact.*tariff/i);
});

test("migration-case pricing enforces the smallest commercially evidenced product", () => {
  const unrestricted = runPricingEngine({ monthlySpend: 14_436.15, monthlyKwh: 4_843.66 });
  const verifiedProduct = runPricingEngine({
    monthlySpend: 14_436.15,
    monthlyKwh: 4_843.66,
    minimumPvKwp: ENGINE_CONSTANTS.verifiedCommercialMinimumPvKwp,
  });

  assert.equal(unrestricted.ufms.sizing.pvKwp, 25);
  assert.equal(verifiedProduct.ufms.sizing.pvKwp, 35);
  assert.ok(verifiedProduct.ufms.monthlySaving < 0);
});

test("Sams screening data exposes size and economic gaps without suppressing the proposal object", () => {
  const names = [
    "616903403792-SEPT_2025",
    "616640473526-OCT",
    "616052703361-NOV",
    "616112297652-DEC",
    "616842223124-JAN_2026",
    "616415199429_2_-FEB_2026",
  ];
  const prefix = "1._Onboarding_2._Sams_Liqour_Null_ESKOM_BILL_6160109555_";
  const analyses = names.map((name) => analyseUtilityBillText(
    readFileSync(join(workspace, "_extract", "text", `${prefix}${name}.pdf.txt`), "utf8"),
    { fileName: `${name}.pdf`, analysedAt: "2026-07-11T00:00:00.000Z" },
  ));
  const currentised = analyses.map((analysis) => ({
    sourceHash: analysis.sourceHash,
    ...currentiseEskomBill(analysis),
  }));
  const portfolio = aggregateUtilityBills(analyses, "2026-07-11T00:00:00.000Z", {
    currentisedBills: currentised,
  });

  const january = analyses.find((analysis) => analysis.accountMonth === "JANUARY 2026");
  assert.ok(january);
  assert.equal(january.billingDays, 1_524);
  assert.equal(january.totalChargesExVat, null);
  assert.equal(january.hasRebillOrCorrection, true);
  assert.equal(portfolio.uniquePeriodCount, 5);
  assert.equal(portfolio.coveredDays, 150);
  assert.ok(portfolio.blockers.some((blocker) => /six recognised billing periods/i.test(blocker)));
  assert.ok(portfolio.blockers.some((blocker) => /168 unique covered days/i.test(blocker)));
  assert.ok(portfolio.blockers.some((blocker) => /unexplained gap/i.test(blocker)));

  const cleanAnalyses = analyses.filter((analysis) => analysis !== january);
  const cleanPortfolio = aggregateUtilityBills(
    cleanAnalyses,
    "2026-07-11T00:00:00.000Z",
    {
      currentisedBills: cleanAnalyses.map((analysis) => ({
        sourceHash: analysis.sourceHash,
        ...currentiseEskomBill(analysis),
      })),
    },
  );
  const proposal = buildF1Proposal({
    businessName: "Sams Liquor",
    siteCity: "Katlehong",
    province: "Gauteng",
    utilityProvider: "Eskom",
    monthlySpend: cleanPortfolio.averageMonthlySpendExVat,
    monthlyKwh: cleanPortfolio.averageMonthlyKwh,
    minimumPvKwp: ENGINE_CONSTANTS.verifiedCommercialMinimumPvKwp,
    billPortfolio: cleanPortfolio,
    generatedAt: "2026-07-11T00:00:00.000Z",
  });

  assert.equal(proposal.ufmsOption.sizing.pvKwp, 35);
  assert.equal(proposal.commercialFit.status, "below-commercial-minimum");
  assert.equal(proposal.commercialFit.minimumCommercialPvKwp, 35);
  assert.ok(proposal.commercialFit.requiredPvKwp < 35);
  assert.ok(proposal.commercialFit.sizeVariancePct > 18);
  assert.match(proposal.commercialFit.message, /below the 35 kWp evidenced minimum/i);
  assert.ok(proposal.billAwareEconomics.yearOne.currentUtilityCost > 14_000);
  assert.ok(proposal.billAwareEconomics.yearOne.solutionCost > 19_000);
  assert.ok(proposal.billAwareEconomics.yearOne.saving < -5_000);
  assert.ok(proposal.billAwareEconomics.tenYear.saving < 0);
});

test("negative proposals are complete but still require the post-proposal EOI", () => {
  const caseRow = {
    id: "case-1",
    public_reference: "F1-MC-A1B2C3D4E5F6",
    stage: "proposal_not_recommended",
    business_name: "Small Site",
    contact_name: "Client",
    site_city: "Katlehong",
    province: "Gauteng",
    supply_type: "eskom-direct",
    created_at: "2026-07-11T00:00:00.000Z",
    indicative_report: {},
    nda_signed_at: "2026-07-10T09:00:00.000Z",
  };
  const proposal = {
    id: "proposal-1",
    status: "not_recommended",
    economically_positive: false,
    created_at: "2026-07-11T01:00:00.000Z",
    preview_snapshot: { gaps: ["Minimum package gap"] },
    proposal_snapshot: { businessName: "Small Site", commercialFit: { status: "below-commercial-minimum" } },
  };
  const state = publicMigrationCaseState(caseRow, { billPack: null, proposal, eoi: null });

  assert.equal(state.proposal.unlocked, false);
  assert.equal(state.proposal.full, null);
  assert.equal(state.actions.canDownloadProposal, false);
  assert.equal(state.actions.canSignEoi, true);

  const route = source("app/api/migration-cases/[token]/proposal-pdf/route.ts");
  assert.match(route, /if \(!relations\.eoi\)/);

  const signedState = publicMigrationCaseState(
    { ...caseRow, stage: "eoi_signed" },
    {
      billPack: null,
      proposal,
      eoi: {
        signed_at: "2026-07-12T01:00:00.000Z",
        signer_name: "Authorised Owner",
        signer_position: "Owner",
        pdf_storage_path: "F1-MC-A1B2C3D4E5F6/eoi/signed.pdf",
      },
    },
  );
  assert.equal(signedState.proposal.unlocked, true);
  assert.deepEqual(signedState.proposal.full, proposal.proposal_snapshot);
  assert.equal(signedState.actions.canDownloadProposal, true);
  assert.equal(signedState.actions.canSignEoi, false);
});

test("positive proposals remain locked until the post-proposal EOI", () => {
  const caseRow = {
    id: "case-2",
    public_reference: "F1-MC-B1C2D3E4F5A6",
    stage: "proposal_ready",
    business_name: "Positive Site",
    contact_name: "Client",
    site_city: "Masemola",
    province: "Limpopo",
    supply_type: "eskom-direct",
    created_at: "2026-07-11T00:00:00.000Z",
    indicative_report: {},
    nda_signed_at: "2026-07-10T09:00:00.000Z",
  };
  const proposal = {
    id: "proposal-2",
    status: "ready",
    economically_positive: true,
    created_at: "2026-07-11T01:00:00.000Z",
    preview_snapshot: {},
    proposal_snapshot: { businessName: "Positive Site" },
  };
  const state = publicMigrationCaseState(caseRow, { billPack: null, proposal, eoi: null });

  assert.equal(state.proposal.unlocked, false);
  assert.equal(state.proposal.full, null);
  assert.equal(state.actions.canDownloadProposal, false);
  assert.equal(state.actions.canSignEoi, true);
});

test("optional visitor-entered kWh keeps physical uncertainty bands and remains unverified", () => {
  const report = buildIndicativeMigrationReport({
    monthlySpendExVat: 25_000,
    monthlyKwh: 8_000,
    siteCity: "Katlehong",
    province: "Gauteng",
    supplyType: "municipality",
    generatedAt: "2026-07-11T00:00:00.000Z",
  });

  assert.equal(report.scenarios.length, 3);
  assert.deepEqual(report.scenarios.map((scenario) => scenario.label), [
    "Conservative case",
    "Central case",
    "Technical upside",
  ]);
  assert.equal(report.input.kwhSource, "client-entered-unverified");
  assert.equal(report.input.monthlyKwh, 8_000);
  assert.match(report.limitations.join(" "), /has not been reconciled to a statement/i);
});

test("bills may be collected without a client-facing count, but the audit still needs all six periods", () => {
  const processor = source("lib/migration-case-bill-pack.ts");
  const uploadRoute = source("app/api/migration-cases/[token]/bill-pack/route.ts");

  assert.equal(REQUIRED_FORMAL_BILLING_PERIODS, 6);

  // Collection is incremental and count-free: merged single-file scans are
  // accepted and every batch is decided immediately.
  assert.match(uploadRoute, /addMigrationBillFiles/);
  assert.doesNotMatch(uploadRoute, /files\.length < COMPLETE_BILL_PACK_MIN_FILES/);
  assert.match(processor, /export async function addMigrationBillFiles/);
  assert.match(processor, /const audited = await runBillPackAudit\(caseRow, billPackId, analyses\)/);

  // Uploads are gated on the signed NDA (POPIA + limited-sharing consent).
  assert.match(processor, /if \(!caseRow\.nda_signed_at\)/);

  // The audit remains atomic: a proposal is only produced from a portfolio
  // that satisfies every blocker, including six recognised periods. A partial
  // history lands on the review desk instead.
  assert.match(processor, /const portfolioReady = portfolio\.formalProposalReady/);
  assert.match(processor, /if \(!portfolioReady\)/);
  assert.match(processor, /bill_pack_in_review/);
  assert.doesNotMatch(processor, /proposalReadiness\(/);

  // A stalled pack now has an operator exit in both directions.
  assert.match(processor, /export async function reauditMigrationBillPack/);
  assert.match(processor, /export async function reopenMigrationBillPack/);
});

test("access links expire, and the limiter and signing secrets fail safe", () => {
  const store = source("lib/migration-case-store.ts");
  const limiter = source("lib/rate-limit.ts");
  const dealRooms = source("lib/deal-rooms.ts");
  const associations = source("lib/associations.ts");

  // A forwarded or abandoned case link must not grant access forever.
  assert.match(store, /MIGRATION_CASE_TOKEN_TTL_DAYS = 90/);
  assert.match(store, /access_token_expires_at/);
  assert.match(
    store,
    /if \(expiresAt && new Date\(expiresAt\)\.getTime\(\) <= Date\.now\(\)\) return null;/,
  );

  // The limiter must not hand out an unlimited window when the database blips.
  assert.match(limiter, /return denied;/);
  assert.doesNotMatch(limiter, /Don't block the request on rate-limit infra errors/);

  // Signing secrets must never silently degrade to the database credential.
  for (const [name, text] of [["deal-rooms", dealRooms], ["associations", associations]]) {
    assert.doesNotMatch(
      text,
      /process\.env\.SUPABASE_SERVICE_ROLE_KEY/,
      `${name} still falls back to the service-role key for signing`,
    );
    assert.match(text, /NODE_ENV === "production"/, `${name} does not fail closed in production`);
  }
});

test("EOI is a post-proposal gate and produces an immutable PDF certificate", () => {
  const eoiRoute = source("app/api/migration-cases/[token]/eoi/route.ts");
  assert.match(eoiRoute, /caseRow\.stage !== "proposal_ready" && caseRow\.stage !== "proposal_not_recommended"/);
  assert.doesNotMatch(eoiRoute, /!relations\.proposal\.economically_positive/);
  assert.match(eoiRoute, /after the bill-audited proposal is completed/i);

  const result = buildMigrationCaseEoiPdf({
    signatureId: "00000000-0000-4000-8000-000000000001",
    caseReference: "F1-MC-A1B2C3D4E5F6",
    proposalId: "00000000-0000-4000-8000-000000000002",
    proposalGeneratedAt: "2026-07-11T00:00:00.000Z",
    companyName: "Example Agri",
    companyRegistrationNumber: "2026/000001/07",
    vatNumber: "4000000000",
    physicalAddress: "12 Farm Road, Vredefort, Free State",
    signerName: "Authorised Director",
    signerPosition: "Director",
    signedAt: "2026-07-11T01:00:00.000Z",
    economicallyPositive: true,
    yearOneMonthlyDifference: 2_500,
    tenYearDifference: 300_000,
  });

  assert.equal(Buffer.from(result.bytes).subarray(0, 5).toString(), "%PDF-");
  assert.match(result.filename, /foundation-1-eoi-example-agri/);
  assert.equal(MIGRATION_CASE_EOI_DECLARATIONS_VERSION, "2026-08-01.1");

  const gapResult = buildMigrationCaseEoiPdf({
    signatureId: "00000000-0000-4000-8000-000000000003",
    caseReference: "F1-MC-GAP2C3D4E5F6",
    proposalId: "00000000-0000-4000-8000-000000000004",
    proposalGeneratedAt: "2026-07-12T00:00:00.000Z",
    companyName: "Gap Example",
    companyRegistrationNumber: null,
    vatNumber: null,
    physicalAddress: null,
    signerName: "Authorised Owner",
    signerPosition: "Owner",
    signedAt: "2026-07-12T01:00:00.000Z",
    economicallyPositive: false,
    yearOneMonthlyDifference: -2_440,
    tenYearDifference: -335_907,
  });
  assert.equal(Buffer.from(gapResult.bytes).subarray(0, 5).toString(), "%PDF-");
});

test("database migration is private, indexed and independent of the legacy profile workflow", () => {
  const migration = source("supabase/migrations/20260711123808_migration_case_pipeline.sql");
  assert.match(migration, /create table if not exists public\.migration_cases/);
  assert.match(migration, /create table if not exists public\.migration_case_bill_packs/);
  assert.match(migration, /create table if not exists public\.migration_case_proposals/);
  assert.match(migration, /create table if not exists public\.migration_case_eois/);
  assert.match(migration, /alter table public\.migration_cases enable row level security/);
  assert.match(migration, /revoke all on table public\.migration_cases from anon, authenticated/);
  assert.match(migration, /grant all on table public\.migration_cases to service_role/);
  assert.doesNotMatch(migration, /references public\.migration_portal_profiles/);
});

test("KYC custody model: readiness gate, document custody, submission drum and term sheets", () => {
  const migration = source("supabase/migrations/20260721150000_kyc_custody_submissions_term_sheets.sql");
  const issueRoute = source("app/api/admin/migration-cases/[id]/partner-proposal/route.ts");
  const signedRoute = source("app/api/migration-cases/[token]/partner-proposal/route.ts");
  const readinessRoute = source("app/api/migration-cases/[token]/kyc-readiness/route.ts");
  const documentsRoute = source("app/api/migration-cases/[token]/kyc-documents/route.ts");
  const submissionRoute = source("app/api/admin/migration-cases/[id]/submission/route.ts");
  const handoffRoute = source("app/api/admin/migration-cases/[id]/handoff/route.ts");
  const store = source("lib/migration-case-store.ts");

  // Custody schema: readiness, documents (with hashes — we DO hold the pack),
  // submissions with an SLA clock, and term sheets (the deal book).
  assert.match(migration, /create table if not exists public\.migration_case_kyc_readiness/);
  assert.match(migration, /create table if not exists public\.migration_case_kyc_documents/);
  assert.match(migration, /create table if not exists public\.migration_case_submissions/);
  assert.match(migration, /create table if not exists public\.migration_case_term_sheets/);
  assert.match(migration, /sla_due_at timestamptz not null/);
  assert.match(migration, /'kyc_ready'/);
  assert.match(migration, /'submitted_to_funder'/);
  assert.match(migration, /'kyc_verified'/);
  assert.match(migration, /'kyc_handed_off'/);
  assert.match(migration, /'term_sheet_issued'/);
  // Legacy zero-custody stage retained for historical rows.
  assert.match(migration, /'kyc_direct_submitted'/);

  // The Bankable-Pack Rule is enforced in software: no partner proposal
  // without confirmed readiness AND a recorded funder submission.
  assert.match(issueRoute, /kyc_readiness_confirmed_at/);
  assert.match(issueRoute, /submitted_to_funder_at/);
  assert.match(submissionRoute, /Bankable-Pack Rule/);
  assert.match(submissionRoute, /sla_due_at/);

  // Custody flow: KYC documents are collected AFTER the signed proposal,
  // extracted as data, and handed off only with an exact recipient manifest.
  assert.match(signedRoute, /signed formal UFMS proposal/);
  assert.match(readinessRoute, /evaluateKycReadiness/);
  assert.match(documentsRoute, /extractKycDocumentData/);
  assert.match(documentsRoute, /partnerProposal\?\.signed_at/);
  assert.match(handoffRoute, /manifest/);
  assert.match(handoffRoute, /recipient/);

  // The public state exposes the custody actions; the zero-custody
  // attestation action is gone.
  assert.match(store, /canConfirmKycReadiness/);
  assert.match(store, /canUploadKycDocuments/);
  assert.doesNotMatch(store, /canConfirmDirectKycSubmission/);
});

test("KYC readiness evaluation and Fix-It plan keep parked deals alive", async () => {
  const { evaluateKycReadiness, normaliseKycFixItPlan, KYC_DOCUMENT_TYPES } = await import("../lib/migration-case-kyc.ts");

  const allHeld = evaluateKycReadiness(KYC_DOCUMENT_TYPES.map((item) => ({ id: item.id, held: true })));
  assert.equal(allHeld.ok, true);
  assert.equal(allHeld.complete, true);
  assert.equal(allHeld.missing.length, 0);

  const partial = evaluateKycReadiness(KYC_DOCUMENT_TYPES.map((item, index) => ({
    id: item.id,
    held: index !== 2 && index !== 5,
  })));
  assert.equal(partial.ok, true);
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.missing, ["audited_financials", "tax_clearance"]);

  // Every missing item gets a Fix-It action even when the client supplies none.
  const plan = normaliseKycFixItPlan(undefined, partial.missing);
  assert.equal(plan.length, 2);
  assert.ok(plan.every((item) => item.action.length > 10));
  assert.match(plan.find((item) => item.id === "tax_clearance").action, /SARS/i);

  // Missing answers are rejected outright.
  const incomplete = evaluateKycReadiness([{ id: "company_registration", held: true }]);
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.error, /answer whether you hold/i);
});

test("KYC extraction mines structured fields and masks SA identity numbers", async () => {
  const { analyseKycText, maskSaIdNumbers, sanitiseKycSelfCheck } = await import("../lib/migration-case-kyc.ts");

  const masked = maskSaIdNumbers("Director ID 8501015800087 appears here.");
  assert.equal(masked.maskedCount, 1);
  assert.doesNotMatch(masked.text, /8501015800087/);
  assert.match(masked.text, /85\*{9}87/);

  const registration = analyseKycText(
    "COR14.3 Registration Certificate. Registration number 2026/138664/07. VAT no 4123456789.",
    "company_registration",
  );
  assert.equal(registration.fields.companyRegistrationNumber, "2026/138664/07");
  assert.equal(registration.fields.vatNumber, "4123456789");
  assert.equal(registration.readable, true);

  const statements = analyseKycText(
    "Business account statement January 2026. Closing balance R 135,000.00. Statement February 2026. Statement March 2026.",
    "bank_statements",
  );
  assert.deepEqual(statements.fields.statementMonths, ["2026-01", "2026-02", "2026-03"]);
  assert.ok(statements.fields.detectedAmounts >= 1);

  const idScan = analyseKycText("", "director_fica");
  assert.equal(idScan.readable, false);
  assert.equal(idScan.textExcerpt, null);

  // Soft self-check sanitiser only keeps known types and answers.
  assert.deepEqual(
    sanitiseKycSelfCheck({ company_registration: "yes", tax_clearance: "no", bogus: "yes", bank_statements: "maybe" }),
    { company_registration: "yes", tax_clearance: "no" },
  );
  assert.equal(sanitiseKycSelfCheck({}), null);
});

test("public state walks the custody pipeline: readiness → submission → proposal → KYC → term sheet", () => {
  const baseCase = {
    id: "case-3",
    public_reference: "F1-MC-C1D2E3F4A5B6",
    stage: "eoi_signed",
    business_name: "Agri Site",
    contact_name: "Client",
    site_city: "Vredefort",
    province: "Free State",
    supply_type: "eskom-direct",
    created_at: "2026-07-20T00:00:00.000Z",
    indicative_report: {},
    eoi_signed_at: "2026-07-21T00:00:00.000Z",
  };
  const proposal = {
    id: "proposal-3",
    status: "ready",
    economically_positive: true,
    created_at: "2026-07-20T12:00:00.000Z",
    preview_snapshot: {},
    proposal_snapshot: { businessName: "Agri Site" },
  };
  const eoi = {
    signed_at: "2026-07-21T00:00:00.000Z",
    signer_name: "Owner",
    signer_position: "Director",
    pdf_storage_path: "F1-MC-C1D2E3F4A5B6/eoi/signed.pdf",
  };

  // After EOI: readiness is the next action; KYC uploads stay locked.
  const afterEoi = publicMigrationCaseState(baseCase, { billPack: null, proposal, eoi });
  assert.equal(afterEoi.actions.canConfirmKycReadiness, true);
  assert.equal(afterEoi.actions.canUploadKycDocuments, false);
  assert.equal(afterEoi.kycPack.requiredCount, 6);
  assert.equal(afterEoi.kycPack.documents.length, 6);
  assert.ok(afterEoi.kycPack.documents.every((slot) => slot.status === "outstanding"));

  // Confirmed readiness closes the gate; submission is visible client-side.
  const readiness = {
    status: "confirmed",
    confirmed_by: "Owner",
    confirmed_at: "2026-07-21T01:00:00.000Z",
    items: [],
    fix_it_plan: [],
    reassess_on: null,
  };
  const submitted = publicMigrationCaseState(
    { ...baseCase, stage: "submitted_to_funder", kyc_readiness_confirmed_at: "2026-07-21T01:00:00.000Z", submitted_to_funder_at: "2026-07-22T01:00:00.000Z" },
    {
      billPack: null,
      proposal,
      eoi,
      kycReadiness: readiness,
      submission: {
        submitted_at: "2026-07-22T01:00:00.000Z",
        channel: "eden_ufms",
        acknowledged_at: null,
        sla_due_at: "2026-07-29T01:00:00.000Z",
        outcome: "pending",
      },
    },
  );
  assert.equal(submitted.actions.canConfirmKycReadiness, false);
  assert.equal(submitted.submission.channel, "eden_ufms");
  assert.equal(submitted.submission.responseDueAt, "2026-07-29T01:00:00.000Z");

  // Signed partner proposal opens KYC custody uploads.
  const partnerProposal = {
    status: "signed",
    issued_at: "2026-07-25T00:00:00.000Z",
    issued_original_name: "proposal.pdf",
    signed_at: "2026-07-26T00:00:00.000Z",
    signed_original_name: "signed.pdf",
  };
  const collecting = publicMigrationCaseState(
    { ...baseCase, stage: "partner_proposal_signed" },
    { billPack: null, proposal, eoi, kycReadiness: readiness, partnerProposal },
  );
  assert.equal(collecting.actions.canUploadKycDocuments, true);

  // Verified + handed off: uploads close, the release timestamps surface.
  const documents = [
    "company_registration", "director_fica", "audited_financials",
    "management_accounts", "bank_statements", "tax_clearance",
  ].map((type, index) => ({
    id: `document-${index}`,
    document_type: type,
    original_name: `${type}.pdf`,
    created_at: `2026-07-27T0${index}:00:00.000Z`,
    status: "verified",
    review_note: null,
    sha256: String(index).repeat(64).slice(0, 64),
  }));
  const handedOff = publicMigrationCaseState(
    { ...baseCase, stage: "kyc_handed_off", kyc_verified_at: "2026-07-28T00:00:00.000Z", kyc_handed_off_at: "2026-07-29T00:00:00.000Z" },
    { billPack: null, proposal, eoi, kycReadiness: readiness, partnerProposal, kycDocuments: documents },
  );
  assert.equal(handedOff.kycPack.allVerified, true);
  assert.equal(handedOff.actions.canUploadKycDocuments, false);
  assert.equal(handedOff.kycPack.handedOffAt, "2026-07-29T00:00:00.000Z");

  // Term sheet issued: the deal-book event is visible without deal value.
  const done = publicMigrationCaseState(
    { ...baseCase, stage: "term_sheet_issued", kyc_handed_off_at: "2026-07-29T00:00:00.000Z", term_sheet_issued_at: "2026-08-05T00:00:00.000Z" },
    {
      billPack: null,
      proposal,
      eoi,
      kycReadiness: readiness,
      partnerProposal,
      kycDocuments: documents,
      termSheets: [{ pathway: "eden", source: "funder_direct", issued_at: "2026-08-05T00:00:00.000Z", reference: "TS-1", deal_value_rands: 6_166_000 }],
    },
  );
  assert.equal(done.termSheets.length, 1);
  assert.equal(done.termSheets[0].pathway, "eden");
  assert.equal(done.termSheets[0].dealValueRands, undefined, "deal value stays internal");
  assert.equal(done.actions.canConfirmKycReadiness, false);
});

test("a rejected KYC document reopens its slot while newer uploads supersede older ones", async () => {
  const { kycPackStatus } = await import("../lib/migration-case-store.ts");
  const documents = [
    { id: "a", document_type: "company_registration", created_at: "2026-07-27T00:00:00.000Z", status: "rejected", original_name: "old.pdf", sha256: "a".repeat(64) },
    { id: "b", document_type: "company_registration", created_at: "2026-07-28T00:00:00.000Z", status: "received", original_name: "new.pdf", sha256: "b".repeat(64) },
    { id: "c", document_type: "tax_clearance", created_at: "2026-07-27T00:00:00.000Z", status: "rejected", original_name: "pin.pdf", sha256: "c".repeat(64) },
  ];
  const pack = kycPackStatus(documents);
  // The replacement counts; the standalone rejection does not.
  assert.equal(pack.receivedCount, 1);
  assert.equal(pack.verifiedCount, 0);
  assert.equal(pack.complete, false);
  assert.equal(pack.latest.get("company_registration").id, "b");
  assert.equal(pack.latest.get("tax_clearance").status, "rejected");
});

test("case creation requires terms acceptance without collecting KYC readiness", () => {
  const createRoute = source("app/api/migration-cases/route.ts");
  assert.match(createRoute, /termsAccepted/);
  assert.match(createRoute, /Accept the terms of use and privacy notice/);
  assert.doesNotMatch(createRoute, /sanitiseKycSelfCheck|kycSelfCheck/);
  const store = source("lib/migration-case-store.ts");
  assert.match(store, /terms_accepted_at/);
  assert.match(store, /kyc_self_check/);
});

test("public and server copies of the indicative report model stay byte-identical", () => {
  for (const file of ["indicative-migration-report.ts", "sa-places.ts"]) {
    const serverCopy = readFileSync(join(workspace, "1OS", "lib", file), "utf8");
    const publicCopy = readFileSync(join(workspace, "NEW F-1", "src", "lib", file), "utf8");
    assert.equal(publicCopy, serverCopy, `${file} drifted between apps`);
  }
});

test("public pricing stays a two-input savings teaser and keeps infrastructure behind onboarding", () => {
  const publicCalculator = readFileSync(
    join(workspace, "NEW F-1", "src", "components", "MigrationCaseBuilder.tsx"),
    "utf8",
  );
  const publicPdf = readFileSync(
    join(workspace, "NEW F-1", "src", "lib", "indicative-migration-report-pdf.ts"),
    "utf8",
  );

  assert.match(publicCalculator, /Spend \+ area/);
  assert.match(publicCalculator, /const GENERATION_DELAY_MS = 5_000/);
  assert.match(publicCalculator, /Eden, Awaken, Nightshade and a blended approach/);
  assert.match(publicCalculator, /EOI before full proposal/);
  assert.match(publicCalculator, /KYC readiness before bank handoff/);
  assert.doesNotMatch(publicCalculator, /PV envelope|PowerCube planning envelope|Infrastructure envelope|Scenario matrix/);
  assert.doesNotMatch(publicPdf, /pvKwp|pcsKw|bessKwh/);
});

test("the first report anchors on the supply route and area instead of one national rate", async () => {
  const { buildIndicativeMigrationReport } = await import("../lib/indicative-migration-report.ts");
  const base = {
    monthlySpendExVat: 45_000,
    siteCity: "Vredefort",
    province: "Free State",
    generatedAt: "2026-07-22T00:00:00.000Z",
  };

  // Known rural town + Eskom direct → rural family menu, supply area named.
  const rural = buildIndicativeMigrationReport({ ...base, supplyType: "eskom-direct" });
  assert.equal(rural.site.municipality, "Ngwathe Local Municipality");
  assert.equal(rural.site.placeContext, "rural");
  assert.deepEqual(rural.tariffContext.candidates.map((item) => item.id), ["landrate", "ruraflex", "nightsave-rural"]);
  assert.equal(rural.tariffContext.anchor.source, "supply-route-and-area");
  assert.ok(rural.tariffContext.anchor.blendedTariff > 3);

  // Municipal supply anchors higher than the Eskom default assumption.
  const municipal = buildIndicativeMigrationReport({ ...base, siteCity: "Bethlehem", supplyType: "municipality" });
  assert.equal(municipal.tariffContext.candidates[0].id, "municipal-business");
  assert.equal(municipal.tariffContext.anchor.blendedTariff, 3.1);
  // Higher assumed rate than the old flat R2.75 → fewer estimated kWh for the same spend.
  assert.ok(municipal.scenarios[1].estimatedMonthlyKwh < base.monthlySpendExVat / 2.75);

  // Metro + Eskom direct → urban/industrial family menu.
  const metro = buildIndicativeMigrationReport({ ...base, siteCity: "Boksburg", province: "Gauteng", supplyType: "eskom-direct" });
  assert.equal(metro.site.municipality, "City of Ekurhuleni Metropolitan Municipality");
  assert.ok(metro.tariffContext.candidates.some((item) => item.id === "megaflex"));

  // Visitor-selected tariff wins the anchor.
  const selected = buildIndicativeMigrationReport({ ...base, siteCity: "Boksburg", province: "Gauteng", supplyType: "eskom-direct", tariffFamily: "megaflex" });
  assert.equal(selected.tariffContext.anchor.id, "megaflex");
  assert.equal(selected.tariffContext.anchor.source, "client-selected-tariff");
  assert.equal(selected.tariffContext.anchor.blendedTariff, 2.45);
  assert.match(selected.limitations.join(" "), /anchored on a typical Megaflex blended rate/i);

  // Unknown town falls back honestly — no invented municipality.
  const unknown = buildIndicativeMigrationReport({ ...base, siteCity: "Nowhereville", supplyType: "eskom-direct" });
  assert.equal(unknown.site.municipality, null);
  assert.equal(unknown.tariffContext.anchor.source, "supply-route");
});

test("the place directory resolves and searches without pretending to know tariffs", async () => {
  const { resolveSaPlace, searchSaPlaces, SA_PLACES } = await import("../lib/sa-places.ts");
  assert.ok(SA_PLACES.length > 200);
  assert.equal(resolveSaPlace("vredefort").municipality, "Ngwathe Local Municipality");
  assert.equal(resolveSaPlace("Witbank").name, "Emalahleni (Witbank)");
  assert.equal(resolveSaPlace("Totally Unknown Place"), null);
  const suggestions = searchSaPlaces("bloem");
  assert.ok(suggestions.some((place) => place.name === "Bloemfontein"));
  assert.ok(searchSaPlaces("x").length === 0, "single characters do not suggest");
});

test("the national gazetteer covers villages and settlements, not just towns", async () => {
  const { parseGazetteer, searchPlaces, resolvePlace } = await import("../lib/sa-places.ts");
  const raw = JSON.parse(readFileSync(join(workspace, "NEW F-1", "public", "data", "sa-places.json"), "utf8"));
  const gazetteer = parseGazetteer(raw);
  assert.ok(gazetteer.length > 10_000, `expected 10k+ places, got ${gazetteer.length}`);

  // Karman's home area — a settlement no curated town list would carry.
  const zebediela = resolvePlace("Zebediela", gazetteer);
  assert.ok(zebediela, "Zebediela must resolve");
  assert.equal(zebediela.province, "Limpopo");
  assert.match(zebediela.municipality, /Lepele-Nkumpi/);
  assert.equal(zebediela.context, "rural");

  const typed = searchPlaces("zebed", gazetteer);
  assert.ok(typed.some((place) => place.name === "Zebediela"));

  // Curated entries win on conflicts and dedupe against the gazetteer.
  const vredefort = searchPlaces("vredefort", gazetteer);
  assert.equal(vredefort.filter((place) => place.name === "Vredefort").length, 1);
  assert.equal(vredefort[0].municipality, "Ngwathe Local Municipality");

  // Hostile rows never throw.
  assert.deepEqual(parseGazetteer([["", null, 4, "x"], "junk", null]), []);
});

test("a gazetteer-resolved place flows into the report without bundling the dataset", async () => {
  const { buildIndicativeMigrationReport } = await import("../lib/indicative-migration-report.ts");
  const report = buildIndicativeMigrationReport({
    monthlySpendExVat: 60_000,
    siteCity: "Zebediela",
    province: "Limpopo",
    supplyType: "eskom-direct",
    placeMunicipality: "Lepele-Nkumpi Local Municipality",
    placeContext: "rural",
    generatedAt: "2026-07-22T00:00:00.000Z",
  });
  assert.equal(report.site.municipality, "Lepele-Nkumpi Local Municipality");
  assert.equal(report.site.placeContext, "rural");
  assert.deepEqual(report.tariffContext.candidates.map((item) => item.id), ["landrate", "ruraflex", "nightsave-rural"]);
  assert.equal(report.tariffContext.anchor.source, "supply-route-and-area");
  assert.match(report.limitations.join(" "), /Lepele-Nkumpi/);
});

test("the report calibration reproduces the signed partner deck instead of contradicting it", async () => {
  const { runPricingEngine } = await import("../lib/pricing-engine.ts");
  // Ratang (SIGNED deal, verified deck): 35 kWp, R955,150 capex, R15,253/month.
  // At its audited approved-current blend the daytime calibration must show a
  // POSITIVE commercial case — the July rewrite's night-heavy default called
  // this signed deal a -32% loser, which no verified deck supports.
  const ratang = runPricingEngine({
    monthlySpend: 20_207,
    blendedTariff: 3.75,
    minimumPvKwp: 35,
    businessLoadProfile: "daytime",
  });
  assert.ok(Math.abs(ratang.ufms.ufmsMonthly - 15_253) < 5, `package price drifted: ${ratang.ufms.ufmsMonthly}`);
  assert.ok(ratang.ufms.monthlySaving > 0, `signed deal must be positive, got ${ratang.ufms.monthlySaving}`);
});

test("the first report presents every migration pathway with honest ten-year economics", async () => {
  const { buildIndicativeMigrationReport } = await import("../lib/indicative-migration-report.ts");
  const report = buildIndicativeMigrationReport({
    monthlySpendExVat: 125_000,
    siteCity: "Vredefort",
    province: "Free State",
    supplyType: "eskom-direct",
    generatedAt: "2026-07-22T00:00:00.000Z",
  });
  const ids = report.pathways.map((pathway) => pathway.id);
  assert.deepEqual(ids, ["current", "eden", "awaken", "nightshade", "combined"]);
  const current = report.pathways[0];
  assert.equal(current.monthlyDifference, 0);
  assert.equal(current.tenYearDifference, 0);
  for (const pathway of report.pathways.slice(1)) {
    assert.ok(pathway.tenYearDifference > 0, `${pathway.label} must beat the escalating utility path over ten years`);
  }
  const eden = report.pathways.find((pathway) => pathway.id === "eden");
  const nightshade = report.pathways.find((pathway) => pathway.id === "nightshade");
  assert.ok(eden.monthlyDifference > 0, "large high-tariff site must show a year-one Eden reduction");
  assert.ok(nightshade.monthlyDifference > 0, "Nightshade must show a year-one reduction here");
  assert.equal(nightshade.escalation, 0);
  const awaken = report.pathways.find((pathway) => pathway.id === "awaken");
  assert.equal(awaken.conditional, true);
  // Smaller generic-anchor sites may be year-one negative but must carry the
  // ten-year escalation story rather than a blank rejection.
  const parys = buildIndicativeMigrationReport({
    monthlySpendExVat: 25_000,
    siteCity: "Parys",
    province: "Free State",
    supplyType: "eskom-direct",
    generatedAt: "2026-07-22T00:00:00.000Z",
  });
  assert.ok(parys.pathways.filter((pathway) => pathway.id !== "current").every((pathway) => pathway.tenYearDifference > 0));
  assert.notEqual(parys.preliminaryFit, "weak");
});

test("urban Eskom families are recognised and routed to informed operator-assisted review", async () => {
  const { classifyTariffFamily } = await import("../lib/utility-bill-analysis.ts");
  assert.equal(classifyTariffFamily("Nightsave Urban Large"), "Nightsave Urban");
  assert.equal(classifyTariffFamily("Nightsave Rural"), "Nightsave Rural");
  assert.equal(classifyTariffFamily("Megaflex"), "Megaflex");
  const analysis = source("lib/utility-bill-analysis.ts");
  assert.match(analysis, /operator-assisted/);
  assert.match(analysis, /reprices this pack manually/);
});
