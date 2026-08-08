import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  assessSubmissionKyc,
  dueKycPromises,
  evaluateKycGate,
  KYC_DOCUMENT_TYPES,
  KYC_FIX_IT_GUIDANCE,
  kycPlanFromStoredItems,
  mergeKycItemPlan,
  sanitiseKycItemPlan,
} from "../lib/migration-case-kyc.ts";
import { publicMigrationCaseState } from "../lib/migration-case-store.ts";

function source(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function doc(type, status = "received", createdAt = "2026-08-16T08:00:00.000Z") {
  return {
    document_type: type,
    status,
    original_name: `${type}.pdf`,
    created_at: createdAt,
    review_note: status === "rejected" ? "Illegible scan" : null,
  };
}

// ---------------------------------------------------------------------------
// Partial saves — the founder rule: any subset is accepted, never an error.
// ---------------------------------------------------------------------------

test("item plan accepts any subset and drops malformed entries silently", () => {
  const plan = sanitiseKycItemPlan([
    { id: "tax_clearance", status: "promised", expectedBy: "2026-09-01" },
    { id: "audited_financials", status: "dont_have" },
    { id: "bogus_type", status: "promised" },
    { id: "bank_statements", status: "maybe" },
    { id: "management_accounts", status: "promised", expectedBy: "not-a-date", note: "  from  bookkeeper " },
    null,
    "junk",
  ]);
  assert.equal(plan.length, 3);
  const tax = plan.find((entry) => entry.id === "tax_clearance");
  assert.deepEqual(tax, { id: "tax_clearance", status: "promised", expectedBy: "2026-09-01", note: null });
  const management = plan.find((entry) => entry.id === "management_accounts");
  assert.equal(management.expectedBy, null);
  assert.equal(management.note, "from bookkeeper");
  // A completely empty declaration is simply an empty plan, never a throw.
  assert.deepEqual(sanitiseKycItemPlan(undefined), []);
  assert.deepEqual(sanitiseKycItemPlan("nope"), []);
});

test("merging plans is per-item: later declarations replace, the rest keep", () => {
  const existing = sanitiseKycItemPlan([
    { id: "tax_clearance", status: "promised", expectedBy: "2026-09-01" },
    { id: "audited_financials", status: "dont_have" },
  ]);
  const merged = mergeKycItemPlan(existing, sanitiseKycItemPlan([
    { id: "tax_clearance", status: "promised", expectedBy: "2026-10-15" },
    { id: "director_fica", status: "promised", expectedBy: "2026-08-20" },
  ]));
  assert.equal(merged.length, 3);
  assert.equal(merged.find((entry) => entry.id === "tax_clearance").expectedBy, "2026-10-15");
  assert.equal(merged.find((entry) => entry.id === "audited_financials").status, "dont_have");
  assert.equal(merged.find((entry) => entry.id === "director_fica").expectedBy, "2026-08-20");
});

test("stored readiness rows are readable in both the legacy and plan shapes", () => {
  // Legacy attestation shape: held booleans + separate fix-it plan.
  const legacy = kycPlanFromStoredItems(
    [
      { id: "company_registration", held: true, note: null },
      { id: "tax_clearance", held: false, note: null },
      { id: "audited_financials", held: false, note: null },
    ],
    [{ id: "tax_clearance", action: "eFiling", expectedBy: "2026-09-01" }],
  );
  assert.equal(legacy.length, 2);
  assert.deepEqual(legacy.find((entry) => entry.id === "tax_clearance"), {
    id: "tax_clearance", status: "promised", expectedBy: "2026-09-01", note: null,
  });
  assert.equal(legacy.find((entry) => entry.id === "audited_financials").status, "dont_have");
  // Plan shape passes straight through.
  const direct = kycPlanFromStoredItems([{ id: "bank_statements", status: "promised", expectedBy: "2026-08-30" }]);
  assert.equal(direct.length, 1);
  assert.equal(direct[0].status, "promised");
});

// ---------------------------------------------------------------------------
// The gate state machine: three states per item, uploads always win.
// ---------------------------------------------------------------------------

test("gate reflects partial uploads with promised and dont-have declarations", () => {
  const documents = [
    doc("company_registration"),
    doc("bank_statements", "verified"),
    doc("director_fica"),
    doc("management_accounts"),
  ];
  const plan = sanitiseKycItemPlan([
    { id: "tax_clearance", status: "promised", expectedBy: "2026-09-01" },
    { id: "audited_financials", status: "dont_have" },
    // Stale declaration for an uploaded item: the upload wins.
    { id: "company_registration", status: "dont_have" },
  ]);
  const gate = evaluateKycGate(documents, plan);
  assert.equal(gate.receivedCount, 4);
  assert.equal(gate.verifiedCount, 1);
  assert.equal(gate.complete, false);
  assert.equal(gate.bankReady, false);
  assert.equal(gate.promisedCount, 1);
  assert.equal(gate.dontHaveCount, 1);
  assert.equal(gate.outstandingCount, 0);
  assert.deepEqual(gate.missing.sort(), ["audited_financials", "tax_clearance"]);
  assert.equal(gate.nextExpectedBy, "2026-09-01");
  const registration = gate.items.find((item) => item.id === "company_registration");
  assert.equal(registration.state, "uploaded");
  assert.equal(registration.fixIt, null);
  const tax = gate.items.find((item) => item.id === "tax_clearance");
  assert.equal(tax.state, "promised");
  assert.equal(tax.expectedBy, "2026-09-01");
  assert.match(tax.fixIt, /eFiling/);
});

test("complete detection: 6/6 in custody; bank-ready only at 6/6 verified", () => {
  const received = KYC_DOCUMENT_TYPES.map((definition) => doc(definition.id));
  const inCustody = evaluateKycGate(received, []);
  assert.equal(inCustody.complete, true);
  assert.equal(inCustody.bankReady, false);
  assert.equal(inCustody.missing.length, 0);

  const verified = evaluateKycGate(KYC_DOCUMENT_TYPES.map((definition) => doc(definition.id, "verified")), []);
  assert.equal(verified.bankReady, true);

  // A rejected document reopens the slot: the pack is no longer complete.
  const withRejection = evaluateKycGate(
    [
      ...KYC_DOCUMENT_TYPES.filter((definition) => definition.id !== "tax_clearance").map((definition) => doc(definition.id, "verified")),
      doc("tax_clearance", "rejected", "2026-08-17T08:00:00.000Z"),
    ],
    [],
  );
  assert.equal(withRejection.complete, false);
  assert.equal(withRejection.bankReady, false);
  const rejected = withRejection.items.find((item) => item.id === "tax_clearance");
  assert.equal(rejected.documentStatus, "rejected");
  assert.equal(rejected.reviewNote, "Illegible scan");
  assert.match(rejected.fixIt, /eFiling/);
});

test("the latest upload per type decides the slot", () => {
  const gate = evaluateKycGate([
    doc("tax_clearance", "rejected", "2026-08-10T08:00:00.000Z"),
    doc("tax_clearance", "received", "2026-08-12T08:00:00.000Z"),
  ], []);
  const tax = gate.items.find((item) => item.id === "tax_clearance");
  assert.equal(tax.state, "uploaded");
  assert.equal(gate.receivedCount, 1);
});

// ---------------------------------------------------------------------------
// Chase rails: promised dates arm reminders; uploads and future dates do not.
// ---------------------------------------------------------------------------

test("due promises surface only past-due, not-yet-uploaded promised items", () => {
  const plan = sanitiseKycItemPlan([
    { id: "tax_clearance", status: "promised", expectedBy: "2026-08-15" },
    { id: "audited_financials", status: "promised", expectedBy: "2026-09-20" },
    { id: "management_accounts", status: "dont_have" },
    { id: "bank_statements", status: "promised", expectedBy: "2026-08-10" },
  ]);
  const gate = evaluateKycGate([doc("bank_statements")], plan);
  const due = dueKycPromises(gate, "2026-08-16");
  assert.deepEqual(due.map((item) => item.id), ["tax_clearance"]);
  assert.match(due[0].fixIt, /eFiling/);
  // Every fix-it hint is a practical SA-specific instruction.
  for (const definition of KYC_DOCUMENT_TYPES) {
    assert.ok(KYC_FIX_IT_GUIDANCE[definition.id].length > 40);
  }
});

// ---------------------------------------------------------------------------
// Warn-not-block: the founder rule enforced in code.
// ---------------------------------------------------------------------------

test("an incomplete pack warns the operator and never blocks", () => {
  const gate = evaluateKycGate([doc("company_registration")], sanitiseKycItemPlan([
    { id: "tax_clearance", status: "promised", expectedBy: "2026-09-01" },
    { id: "audited_financials", status: "dont_have" },
  ]));
  const assessment = assessSubmissionKyc(gate);
  assert.equal(assessment.blocks, false);
  assert.equal(assessment.complete, false);
  assert.ok(assessment.warnings.length >= 2);
  assert.match(assessment.warnings[0], /INCOMPLETE: 1\/6/);
  assert.match(assessment.warnings[0], /promised by 2026-09-01/);
  assert.match(assessment.warnings[0], /does not have/);
  assert.match(assessment.warnings[1], /warning, not a block/i);
});

test("a complete but unverified pack warns softly; a verified pack is silent", () => {
  const custody = assessSubmissionKyc(evaluateKycGate(KYC_DOCUMENT_TYPES.map((definition) => doc(definition.id)), []));
  assert.equal(custody.complete, true);
  assert.equal(custody.blocks, false);
  assert.equal(custody.warnings.length, 1);
  assert.match(custody.warnings[0], /0\/6 verified/);

  const verified = assessSubmissionKyc(evaluateKycGate(KYC_DOCUMENT_TYPES.map((definition) => doc(definition.id, "verified")), []));
  assert.deepEqual(verified.warnings, []);
  assert.equal(verified.bankReady, true);
});

test("the submission route warns instead of blocking and honours the acknowledgement", () => {
  const route = source("app/api/admin/migration-cases/[id]/submission/route.ts");
  assert.match(route, /assessSubmissionKyc/);
  assert.match(route, /acknowledgeIncompleteKyc/);
  assert.match(route, /warnNotBlock/);
  assert.match(route, /kycIncompleteAcknowledged/);
  // The old hard block on the readiness attestation is gone.
  assert.doesNotMatch(route, /must confirm the six-item KYC readiness checklist/);
});

// ---------------------------------------------------------------------------
// Client surface: uploads open at EOI, the gate is in the public state.
// ---------------------------------------------------------------------------

test("public case state carries the document gate and opens uploads at EOI", () => {
  const baseCase = {
    id: "case-kyc-gate",
    public_reference: "F1-MC-KYCGATE00001",
    stage: "eoi_signed",
    business_name: "Gate Farm",
    contact_name: "Client",
    site_city: "Bethlehem",
    province: "Free State",
    supply_type: "eskom-direct",
    created_at: "2026-08-10T00:00:00.000Z",
    indicative_report: {},
    eoi_signed_at: "2026-08-15T00:00:00.000Z",
  };
  const proposal = {
    id: "proposal-1",
    status: "ready",
    economically_positive: true,
    created_at: "2026-08-14T00:00:00.000Z",
    preview_snapshot: {},
    proposal_snapshot: {},
  };
  const eoi = { signed_at: "2026-08-15T00:00:00.000Z", signer_name: "Owner", signer_position: "Director", pdf_storage_path: "x/eoi.pdf" };
  const readiness = {
    status: "in_progress",
    confirmed_by: "Client",
    confirmed_at: null,
    items: [{ id: "tax_clearance", status: "promised", expectedBy: "2026-09-01", note: null }],
    fix_it_plan: [{ id: "tax_clearance", action: "eFiling", expectedBy: "2026-09-01" }],
    reassess_on: "2026-09-01",
  };
  const state = publicMigrationCaseState(baseCase, {
    billPack: null,
    proposal,
    eoi,
    kycReadiness: readiness,
    kycDocuments: [{ ...doc("company_registration"), id: "d1", sha256: "0".repeat(64) }],
  });
  // Partial uploads are fine and the journey is never blocked.
  assert.equal(state.actions.canUploadKycDocuments, true);
  assert.equal(state.actions.canPlanKycItems, true);
  assert.equal(state.kycGate.receivedCount, 1);
  assert.equal(state.kycGate.complete, false);
  assert.equal(state.kycGate.bankReady, false);
  assert.equal(state.kycGate.nextExpectedBy, "2026-09-01");
  const tax = state.kycGate.items.find((item) => item.id === "tax_clearance");
  assert.equal(tax.state, "promised");
  assert.ok(tax.fixIt);
});

test("the chase rail and staged migration are wired", () => {
  const tick = source("app/api/internal/lifecycle/tick/route.ts");
  assert.match(tick, /dueKycPromises/);
  assert.match(tick, /reminder_kyc_promised/);
  const lifecycle = source("lib/case-lifecycle.ts");
  assert.match(lifecycle, /reminder_kyc_promised/);
  const migration = source("supabase/migrations/20260816120000_kyc_gate_three_state.sql");
  assert.match(migration, /'in_progress'/);
  const planRoute = source("app/api/migration-cases/[token]/kyc-plan/route.ts");
  assert.match(planRoute, /23514/); // graceful degradation while unapplied
});
