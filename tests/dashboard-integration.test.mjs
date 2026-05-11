import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");

// --- Pure mapping tests (transcribed from lib/lead-status-mapping.ts) ---
// We re-implement the small mapping to assert the contract without spinning up
// a TS runtime in node:test. The source file is the source of truth; this
// guards against regressions in either direction.

const adminToQualification = {
  "Not Contacted": "Havent Contacted",
  Contacted: "Contacted",
  Interested: "Interested",
  "Not Interested": "Not Interested",
  "Follow Up": "Contacted",
  Converted: "Qualifies",
};

const qualificationToAdmin = {
  "Havent Contacted": "Not Contacted",
  Contacted: "Contacted",
  Interested: "Interested",
  "Not Interested": "Not Interested",
  "Does Not Qualify": "Not Interested",
  Qualifies: "Converted",
};

test("lead-status-mapping source matches the documented contract", () => {
  const src = read("lib/lead-status-mapping.ts");
  for (const [from, to] of Object.entries(adminToQualification)) {
    assert.match(
      src,
      new RegExp(`case "${from}":\\s*\\n\\s*return "${to}";`),
      `adminContactToQualification: ${from} -> ${to} missing`,
    );
  }
  for (const [from, to] of Object.entries(qualificationToAdmin)) {
    assert.match(
      src,
      new RegExp(`case "${from}":\\s*\\n\\s*return "${to}";`),
      `qualificationToAdminContact: ${from} -> ${to} missing`,
    );
  }
});

test("AdminLead exposes link IDs for the lead<->business mirror", () => {
  const src = read("lib/admin-types.ts");
  assert.match(src, /linkedSalesLeadId: string \| null/);
  assert.match(src, /linkedAdminLeadId: string \| null/);
  assert.match(src, /isClientRegistered: boolean/);
});

test("provider mirrors contact-status, owner, and terminal stages across linked leads", () => {
  const src = read("components/admin/AdminPortalProvider.tsx");
  // Contact status mirror to sales qualification.
  assert.match(src, /adminContactToQualification\(status\)/);
  // Owner mirror to sales lead.
  assert.match(src, /linkedSalesLeadId.*ownerId/s);
  // Terminal stages mirror.
  assert.match(src, /stage === "Onboarding Complete"/);
  assert.match(src, /stage === "Disqualified"/);
  // Conversion repoints the link to the new full lead.
  assert.match(src, /linkedAdminLeadId: created\.leadId/);
});

test("provider can delete open sales leads while protecting registered clients", () => {
  const src = read("components/admin/AdminPortalProvider.tsx");
  assert.match(src, /const deleteSalesLead =/);
  assert.match(src, /salesLead\.status === "Converted"/);
  assert.match(src, /linkedAdminLead\?\.isClientRegistered/);
  assert.match(src, /currentSalesLeads\.filter\(\(lead\) => lead\.id !== salesLeadId\)/);
});

test("delta-sync endpoint exists and supports per-entity upserts/deletes", () => {
  const path = "app/api/admin/state/mutate/route.ts";
  assert.ok(existsSync(join(root, path)), `${path} missing`);
  const src = read(path);
  assert.match(src, /export async function POST/);
  assert.match(src, /leadUpserts/);
  assert.match(src, /leadDeletes/);
  assert.match(src, /salesLeadUpserts/);
  assert.match(src, /salesLeadDeletes/);
  // Server merges deltas against current snapshot, not blind overwrite.
  assert.match(src, /readAdminStateSnapshot/);
  assert.match(src, /writeAdminStateSnapshot/);
});

test("provider sends deltas instead of full snapshots", () => {
  const src = read("components/admin/AdminPortalProvider.tsx");
  // Old behavior must be gone.
  assert.doesNotMatch(src, /PUT\s*[^\n]*\/api\/admin\/state["']/);
  // New behavior present.
  assert.match(src, /\/api\/admin\/state\/mutate/);
  assert.match(src, /diffById/);
});

test("save status banner is mounted in both admin and sales layouts", () => {
  assert.match(read("app/admin/layout.tsx"), /SaveStatusBanner/);
  assert.match(read("app/sales/layout.tsx"), /SaveStatusBanner/);
});

test("convertSalesLeadToClient deletes the original stub admin lead", () => {
  const src = read("components/admin/AdminPortalProvider.tsx");
  assert.match(src, /oldStubId.*current\.filter/s);
});

test("lead sequences reuse inbox threads and update CRM status from email activity", () => {
  assert.ok(
    existsSync(join(root, "app/api/email/lead-engagement/route.ts")),
    "lead engagement route missing",
  );
  assert.ok(
    existsSync(join(root, "lib/lead-email-activity.ts")),
    "lead email activity helper missing",
  );

  assert.match(read("app/api/email/send/route.ts"), /recordLeadEmailSent/);
  assert.match(read("app/api/email/inbound/route.ts"), /recordLeadEmailReply/);
  assert.match(read("components/sales/routes/SalesLeadsRoute.tsx"), /Sequence view/);
  assert.match(read("components/sales/routes/SalesLeadsRoute.tsx"), /awaiting_reply/);
});

test("dashboard email senders use the verified Resend reply domain", () => {
  const addressing = read("lib/email-addressing.ts");
  const adminMailboxes = read("lib/admin-mailboxes.ts");
  const sendRoute = read("app/api/email/send/route.ts");
  const envExample = read(".env.example");

  assert.match(addressing, /DEFAULT_OUTBOUND_EMAIL_DOMAIN = "replies\.1os\.co\.za"/);
  assert.match(adminMailboxes, /sales@replies\.1os\.co\.za/);
  assert.match(adminMailboxes, /karman@replies\.1os\.co\.za/);
  assert.match(sendRoute, /emailOnOutboundDomain\(session\.email\)/);
  assert.match(envExample, /EMAIL_OUTBOUND_DOMAIN=replies\.1os\.co\.za/);
  assert.doesNotMatch(adminMailboxes, /@foundation-1\.co\.za/);
});
