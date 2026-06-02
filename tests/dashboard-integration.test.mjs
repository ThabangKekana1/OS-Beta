import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const exists = (path) => existsSync(join(root, path));

test("admin navigation exposes Leads, Sales, Activity, and Inbox", () => {
  const sidebar = read("components/admin/AdminSidebar.tsx");
  assert.match(sidebar, /label: "Leads"/);
  assert.match(sidebar, /href: `\$\{rootPath\}\/leads`/);
  assert.match(sidebar, /label: "Sales"/);
  assert.match(sidebar, /href: "\/admin\/sales"/);
  assert.match(sidebar, /label: "Activity"/);
  assert.match(sidebar, /href: "\/admin\/activity"/);
  assert.match(sidebar, /label: "Inbox"/);
  assert.match(sidebar, /href: `\$\{rootPath\}\/inbox`/);
  assert.doesNotMatch(sidebar, /KPI|Settings|Partners|Clients|Workspace|Pipeline|Archive/);
});

test("sales shell uses scoped leads and hides admin-only navigation", () => {
  const layout = read("app/sales/layout.tsx");
  const leadsPage = read("app/sales/leads/page.tsx");
  const inboxPage = read("app/sales/inbox/page.tsx");

  assert.match(layout, /requireServerAuthSession\("sales"\)/);
  assert.match(layout, /leadOwnerScopeId=\{session\.agentId\}/);
  assert.match(layout, /showSales=\{false\}/);
  assert.match(leadsPage, /basePath="\/sales"/);
  assert.match(leadsPage, /showOwnerControls=\{false\}/);
  assert.match(leadsPage, /showPartnerControls=\{false\}/);
  assert.match(inboxPage, /viewerRole="sales"/);
  assert.match(inboxPage, /viewerAgentId=\{session\.agentId\}/);
});

test("admin shell, sales, and inbox use the retained admin routes", () => {
  const layout = read("app/admin/layout.tsx");
  const inboxPage = read("app/admin/inbox/page.tsx");
  const inboxRoute = read("components/admin/routes/AdminInboxRoute.tsx");
  const salesPage = read("app/admin/sales/page.tsx");
  const salesRoute = read("components/admin/routes/AdminSalesRoute.tsx");
  const activityPage = read("app/admin/activity/page.tsx");
  const activityRoute = read("components/admin/routes/AdminActivityRoute.tsx");
  const activityApi = read("app/api/admin/activity/report/route.ts");

  assert.match(layout, /includeSalesLeads=\{false\}/);
  assert.match(layout, /includeRegistrationDrafts=\{false\}/);
  assert.match(layout, /AdminSidebar/);
  assert.match(salesPage, /AdminSalesRoute/);
  assert.match(activityPage, /AdminActivityRoute/);
  assert.match(activityRoute, /Activity Report/);
  assert.match(activityRoute, /downloadReport/);
  assert.match(activityRoute, /Quiet Profiles/);
  assert.match(activityApi, /oneos_user_audit_events/);
  assert.match(activityApi, /oneos_email_messages/);
  assert.match(activityApi, /readAdminStateSnapshot/);
  assert.match(activityApi, /activeInWindow/);
  assert.match(salesRoute, /Sales Activity/);
  assert.match(salesRoute, /Activity Ledger/);
  assert.match(salesRoute, /Agent Profile/);
  assert.match(salesRoute, /Agent Profiles/);
  assert.match(salesRoute, /Pressure Metrics/);
  assert.match(salesRoute, /Not contacted/);
  assert.match(salesRoute, /No email thread/);
  assert.match(salesRoute, /Stage Progress/);
  assert.match(salesRoute, /Pressure Queue/);
  assert.match(salesRoute, /Dashboard Identity/);
  assert.match(salesRoute, /Emails Sent \/ Received/);
  assert.match(salesRoute, /Login Audit/);
  assert.match(salesRoute, /\/api\/admin\/sales\/surveillance/);
  assert.match(salesRoute, /lead-engagement/);
  assert.match(inboxPage, /AdminInboxRoute/);
  assert.match(inboxRoute, /export function AdminInboxRoute/);
  assert.doesNotMatch(inboxPage, /components\/sales/);
});

test("lead profile exposes the approved registration and document upload links", () => {
  const profile = read("components/admin/routes/AdminLeadProfileRoute.tsx");

  assert.match(profile, /Registration Link/);
  assert.match(profile, /Document Upload Link/);
  assert.match(profile, /registrationLinkPath/);
  assert.match(profile, /documentUploadLinkPath/);
  assert.doesNotMatch(profile, /utility-bills|Utility Bills Upload Link|buildUtilityBillUploadPath/);
});

test("state mutation API mutates admin leads and sales-owned leads only", () => {
  const route = read("app/api/admin/state/mutate/route.ts");
  assert.match(route, /leadUpserts/);
  assert.match(route, /leadDeletes/);
  assert.match(route, /session\.role === "admin"/);
  assert.match(route, /session\.role === "sales"/);
  assert.match(route, /Sales users can only mutate their own leads/);
  assert.match(route, /Sales users cannot delete leads/);
  assert.doesNotMatch(route, /salesLeadUpserts|salesLeadDeletes|partnerCanAccessClientLead|buildAdminLeadStubFromSalesLead/);
});

test("public Get Started keeps routing to generic registration", () => {
  const links = read("lib/links.ts");
  const landing = read("components/routes/PublicMarketingLandingRoute.tsx");

  assert.match(links, /BUSINESS_REGISTRATION_URL = "\/register"/);
  assert.match(landing, /BUSINESS_REGISTRATION_URL/);
});

test("lead import and EOI dependencies remain because they are part of the approved workflow", () => {
  const leadsRoute = read("components/admin/routes/AdminLeadsRoute.tsx");
  const eoiTemplate = read("lib/eoi-template.ts");

  assert.match(leadsRoute, /import\("fflate"\)/);
  assert.match(leadsRoute, /Role/);
  assert.match(leadsRoute, /roleForLead/);
  assert.match(leadsRoute, /contactPosition: quickLead\.contactPosition/);
  assert.match(eoiTemplate, /buildEoiTemplateText/);
  assert.doesNotMatch(eoiTemplate, /PDFDocument|pdf-lib/);
});

test("deleted admin pages and components do not exist", () => {
  const deletedPaths = [
    "app/admin/kpis/page.tsx",
    "app/admin/settings/page.tsx",
    "app/admin/clients/page.tsx",
    "app/admin/partners/page.tsx",
    "app/admin/sales-reps/page.tsx",
    "components/admin/routes/AdminKpisRoute.tsx",
    "components/admin/routes/AdminSettingsRoute.tsx",
    "components/admin/routes/AdminPartnersRoute.tsx",
    "components/admin/routes/AdminClientsRoute.tsx",
  ];

  for (const deletedPath of deletedPaths) {
    assert.equal(exists(deletedPath), false, `${deletedPath} should be deleted`);
  }
});
