import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function exists(path) {
  return existsSync(join(root, path));
}

test("approved public and admin routes exist", () => {
  const routeFiles = [
    "app/page.tsx",
    "app/register/[linkId]/page.tsx",
    "app/upload/[token]/page.tsx",
    "app/eoi/[token]/page.tsx",
    "app/estimate/[linkId]/page.tsx",
    "app/migration/dashboard/page.tsx",
    "app/migration/proposal-status/page.tsx",
    "app/dealroom/[token]/page.tsx",
    "app/partners/[code]/page.tsx",
    "app/estimate/a/[code]/page.tsx",
    "app/admin/layout.tsx",
    "app/admin/page.tsx",
    "app/admin/(legacy)/leads/page.tsx",
    "app/admin/(legacy)/sales/page.tsx",
    "app/admin/(legacy)/activity/page.tsx",
    "app/admin/(legacy)/leads/[id]/page.tsx",
    "app/admin/(legacy)/inbox/page.tsx",
    "app/admin/deck/page.tsx",
    "app/admin/threads/page.tsx",
    "app/admin/briefs/page.tsx",
    "app/admin/dossier/[key]/page.tsx",
    "app/sales/layout.tsx",
    "app/sales/page.tsx",
    "app/sales/leads/page.tsx",
    "app/sales/leads/[id]/page.tsx",
    "app/sales/inbox/page.tsx",
    "app/api/register/route.ts",
    "app/api/register/[linkId]/route.ts",
    "app/api/upload/[token]/route.ts",
    "app/api/eoi/[token]/route.ts",
    "app/api/admin/state/route.ts",
    "app/api/admin/state/mutate/route.ts",
    "app/api/admin/leads/[id]/route.ts",
    "app/api/admin/leads/[id]/documents/route.ts",
    "app/api/admin/sales/surveillance/route.ts",
    "app/api/admin/activity/report/route.ts",
    "app/api/auth/login-event/route.ts",
    "app/api/email/send/route.ts",
    "app/api/email/inbound/route.ts",
    "app/api/email/threads/route.ts",
  ];

  for (const routeFile of routeFiles) {
    assert.equal(exists(routeFile), true, `${routeFile} missing`);
  }
});

test("deleted legacy systems stay deleted", () => {
  const deletedPaths = [
    "app/(workspace)",
    "app/signup/page.tsx",
    "app/utility-bills/[token]/page.tsx",
    "app/api/chat/route.ts",
    "app/api/workspace/state/route.ts",
    "app/api/auth/signup/route.ts",
    "app/api/email/signature/route.ts",
    "app/migration/upload/page.tsx",
    "app/api/migration/documents/route.ts",
    "components/workspace",
    "components/sales",
    "components/utility-bills",
    "components/migration/UtilityUpload.tsx",
    "lib/assistant",
    "lib/registration-agent.ts",
    "lib/workspace-state.ts",
    "lib/utility-bill-upload.ts",
  ];

  for (const deletedPath of deletedPaths) {
    assert.equal(exists(deletedPath), false, `${deletedPath} should be deleted`);
  }
});

test("registration is a staged Typeform-style experience with autosave", () => {
  const form = read("components/registration/ClientRegistrationForm.tsx");
  const publicRoute = read("components/registration/PublicClientRegistrationRoute.tsx");

  assert.match(form, /Start registration/);
  assert.match(form, /Installed, maintained, insured by us\.\. You save up to 50%/);
  assert.match(form, /localStorage\.setItem\(storageKey/);
  assert.match(form, /continueToNext/);
  assert.match(form, /Ready to create the profile\?/);
  assert.match(publicRoute, /storageKey=\{`oneos:registration:\$\{linkId \?\? "generic"\}`\}/);
});

test("admin leads track registration and manual-add timestamps", () => {
  const adminTypes = read("lib/admin-types.ts");
  const clientRegistration = read("lib/client-registration.ts");
  const adminProvider = read("components/admin/AdminPortalProvider.tsx");
  const leadsRoute = read("components/admin/routes/AdminLeadsRoute.tsx");
  const profileRoute = read("components/admin/routes/AdminLeadProfileRoute.tsx");
  const supabaseStore = read("lib/supabase-db-store.ts");

  assert.match(adminTypes, /createdAt: string/);
  assert.match(adminTypes, /registeredAt: string \| null/);
  assert.match(adminTypes, /manuallyAddedAt: string \| null/);
  assert.match(clientRegistration, /registeredAt: createdAt/);
  assert.match(clientRegistration, /manuallyAddedAt/);
  assert.match(adminProvider, /registeredAt: completedNow \? timestamp : lead\.registeredAt/);
  assert.match(leadsRoute, /Registered \/ Added/);
  assert.match(leadsRoute, /Admin added/);
  assert.match(profileRoute, /Registration submitted/);
  assert.match(profileRoute, /Manually added by admin/);
  assert.match(supabaseStore, /const createdAt = toIsoOrNull\(lead\.createdAt\)/);
  assert.match(supabaseStore, /row\.created_at = createdAt/);
});

test("migration dashboard runs website-first (funnel removed from 1OS)", () => {
  const migrationDashboard = read("components/migration/MigrationDashboard.tsx");
  const migrationShell = read("components/migration/MigrationShell.tsx");
  const migrationCalculator = read("lib/calculateMigrationAssessment.ts");
  const calculationConfig = read("lib/calculation-config.ts");
  const clientRegistration = read("lib/client-registration.ts");
  const registrationLinks = read("lib/registration-links.ts");
  const supabaseStore = read("lib/supabase-db-store.ts");
  const estimateRoute = read("app/estimate/[linkId]/page.tsx");
  const migrationAssessmentApi = read("app/api/migration/assessments/route.ts");
  const migrationIntakeApi = read("app/api/migration/intake/route.ts");
  const migrationDashboardStatusApi = read("app/api/migration/profiles/status/route.ts");

  // The assessment funnel lives on foundation-1.co.za; 1OS keeps the dashboard.
  for (const deleted of [
    "app/migration/start",
    "app/migration/report",
    "app/migration/register",
    "app/migration/success",
    "app/migration/unsuccessful",
    "components/migration/MigrationReport.tsx",
    "components/migration/MigrationRegister.tsx",
    "components/migration/MigrationStart.tsx",
    "components/migration/MigrationSuccess.tsx",
  ]) {
    assert.equal(exists(deleted), false, `${deleted} should be deleted`);
  }

  assert.match(migrationDashboard, /if \(!activeStored\.registration\)/);
  assert.match(migrationDashboard, /Open Client Profile/);
  assert.match(migrationDashboard, /foundation-1\.co\.za/);
  assert.match(migrationDashboard, /\/api\/migration\/profiles\/status/);
  assert.match(migrationDashboard, /adminStatus\?\.migrationStatus/);
  assert.match(migrationDashboard, /support@1os\.foundation-1\.co\.za/);
  assert.match(migrationDashboard, /https:\/\/wa\.me\/27690368243/);
  assert.match(migrationShell, /NEXT_PUBLIC_WEBSITE_ORIGIN/);
  assert.match(migrationShell, /WEBSITE_ASSESSMENT_URL/);
  assert.match(migrationShell, /\/migration\/proposal-status/);
  assert.doesNotMatch(migrationShell, /\/migration\/(?:start|report)/);
  assert.match(estimateRoute, /redirect\(/);
  assert.match(estimateRoute, /foundation-1\.co\.za/);
  assert.match(calculationConfig, /eskom_annual_tariff_escalation_percent: 12\.5/);
  assert.match(calculationConfig, /foundation_one_ten_year_factor: 13\.1808/);
  assert.match(migrationCalculator, /eskom_annual_tariff_escalation_percent/);
  assert.match(migrationCalculator, /compoundedAnnualSpendFactor/);
  assert.match(clientRegistration, /buildAdminLeadFromMigrationIntake/);
  assert.match(clientRegistration, /updateExistingLeadFromMigrationIntake/);
  assert.match(clientRegistration, /Complete company registration details/);
  assert.match(registrationLinks, /\/estimate\/\$\{encodeURIComponent/);
  assert.match(registrationLinks, /stripCompanyLegalSuffixes/);
  assert.match(registrationLinks, /return companySlug \|\| linkId/);
  assert.match(registrationLinks, /migrationEstimateSlugForLabel\(withoutBrokenLegacySuffix\)/);
  assert.doesNotMatch(registrationLinks, /\`\$\{companySlug\}-\$\{linkId\}\`/);
  assert.match(registrationLinks, /publicMigrationLinkOrigin/);
  assert.match(estimateRoute, /migrationLinkIdFromPathSegment/);
  assert.match(estimateRoute, /findLeadByMigrationLinkFromDatabase/);
  assert.match(supabaseStore, /migrationEstimateSlugForLabel\(row\.company\) === normalizedLinkId/);
  assert.match(migrationAssessmentApi, /profile_id: profileId \|\| null/);
  assert.match(migrationAssessmentApi, /onConflict: "profile_id"/);
  assert.match(migrationIntakeApi, /buildAdminLeadFromMigrationIntake/);
  assert.match(migrationIntakeApi, /updateExistingLeadFromMigrationIntake/);
  assert.match(migrationIntakeApi, /scope: "migration-intake-profile"/);
  assert.match(migrationIntakeApi, /preferredContactMethod/);
  assert.match(migrationIntakeApi, /documentUploadLinkIdForLead/);
  assert.match(migrationDashboardStatusApi, /hashMigrationAccessCode/);
  assert.match(migrationDashboardStatusApi, /oneos_admin_leads/);
  assert.match(migrationDashboardStatusApi, /oneos_client_documents/);
});

test("migration production hardening covers schema, auth, and throttling", () => {
  const migration = read("supabase/migrations/20260524163000_harden_migration_portal_linkage.sql");
  const adminState = read("app/api/admin/state/route.ts");
  const adminLead = read("app/api/admin/leads/[id]/route.ts");
  const profileLogin = read("app/api/migration/profiles/login/route.ts");
  const intakeApi = read("app/api/migration/intake/route.ts");
  const uploadApi = read("app/api/upload/[token]/route.ts");

  assert.match(migration, /create table if not exists public\.migration_assessments/);
  assert.match(migration, /create table if not exists public\.migration_documents/);
  assert.match(migration, /lead_id text/);
  assert.match(migration, /client_profile_id text/);
  assert.match(migration, /service role manages migration portal profiles/);
  assert.match(adminState, /canReadAdminState/);
  assert.match(adminState, /return session\.role === "admin" \|\| session\.role === "sales"/);
  assert.match(adminLead, /Sales users can only update their own client profiles/);
  assert.match(adminLead, /session\.role === "admin" && typeof payload\.ownerId/);
  assert.match(profileLogin, /scope: "migration-profile-login"/);
  assert.match(intakeApi, /scope: "migration-intake-profile"/);
  assert.match(uploadApi, /scope: "public-document-upload"/);
});

test("secure upload portal excludes bank KYC and enforces the direct-to-UFMS POPIA boundary", () => {
  const uploadPortal = read("components/upload/ClientDocumentUploadPortal.tsx");
  const uploadApi = read("app/api/upload/[token]/route.ts");
  const taxonomy = read("lib/document-taxonomy.ts");
  const directHandoff = read("components/migration/DirectUfmsKycHandoff.tsx");
  const directConfirmation = read("app/api/migration/kyc-direct/route.ts");
  const directKycContract = read("lib/ufms-direct-kyc.ts");

  assert.match(uploadPortal, /Start upload/);
  assert.match(uploadPortal, /What are you sending us\?/);
  assert.match(uploadPortal, /Drop your \{activeOption\.label\.toLowerCase\(\)\} files/);
  assert.match(uploadPortal, /Clean\. Saved\. Connected\./);

  // The route consumes the shared taxonomy (single source of truth).
  assert.match(uploadApi, /from "@\/lib\/document-taxonomy"/);
  assert.match(uploadApi, /countDocumentsByType/);
  assert.match(uploadApi, /isClientUploadDocumentType/);
  assert.match(uploadApi, /Bank KYC documents cannot be uploaded to Foundation-1/);
  assert.doesNotMatch(uploadPortal, /id: "company_registration"/);
  assert.doesNotMatch(uploadPortal, /id: "fica_director_id"/);
  assert.doesNotMatch(uploadPortal, /id: "bank_statements"/);
  assert.match(uploadApi, /link: `\/admin\/leads\/\$\{savedLead\.clientProfileId\}`/);

  // Historical taxonomy remains classifiable, but the upload allowlist is the
  // non-KYC migration record only.
  for (const type of [
    "expression_of_interest",
    "signed_eoi",
    "utility_bills",
    "signed_proposal",
    "signed_mandate",
    "company_registration",
    "fica_director_id",
    "fica_proof_of_residence",
    "audited_financials",
    "management_accounts",
    "bank_statements",
    "tax_clearance",
  ]) {
    assert.match(taxonomy, new RegExp(`"${type}"`));
  }
  assert.match(taxonomy, /CLIENT_UPLOAD_DOCUMENT_TYPES/);
  assert.match(directKycContract, /info@ufms\.net/);
  assert.match(directHandoff, /does not receive, proxy, inspect, store, hash, or list these files/);
  assert.match(directConfirmation, /allItemsAttachedConfirmed/);
  assert.match(directConfirmation, /No KYC files were received by Foundation-1/);
});

test("auth and EOI use approved role-scoped routes and no deleted workspace or signup routes", () => {
  const auth = read("lib/auth.ts");
  const proxy = read("proxy.ts");
  const loginForm = read("components/auth/LoginForm.tsx");
  const eoiForm = read("components/eoi/EoiSigningForm.tsx");
  const inbound = read("app/api/email/inbound/route.ts");

  assert.match(auth, /if \(role === "admin"\) return "\/admin"/);
  assert.match(auth, /if \(role === "sales"\) return "\/sales"/);
  assert.match(auth, /if \(role === "partner"\) return "\/partner"/);
  assert.match(auth, /return "\/"/);
  assert.match(proxy, /pathname\.startsWith\("\/admin"\)/);
  assert.match(proxy, /pathname\.startsWith\("\/sales"\)/);
  assert.match(proxy, /pathname === "\/partner"/);
  assert.match(loginForm, /sales portal/);
  assert.doesNotMatch(loginForm, /Create an account|\/signup|sales workspace|partner portal|private workspace/);
  assert.doesNotMatch(eoiForm, /\/workspace/);
  assert.match(eoiForm, /Sign non-binding EOI/);
  assert.match(eoiForm, /Download signed EOI/);
  assert.match(eoiForm, /Terms of Service/);
  assert.match(inbound, /\/admin\/inbox\?thread=/);
});

test("legacy EOI is backend-gated until the bill-audited assessment is complete", () => {
  const eoiRoute = read("app/api/eoi/[token]/route.ts");
  const eoiPage = read("app/eoi/[token]/page.tsx");
  const proposalRoute = read("app/api/migration/proposal/route.ts");
  const proposalPdfRoute = read("app/api/migration/proposal/pdf/route.ts");
  assert.match(eoiRoute, /hasCompletedFoundationAssessment/);
  assert.match(eoiRoute, /becomes available only after the bill-audited Foundation-1 assessment is completed/i);
  assert.match(eoiPage, /hasCompletedFoundationAssessment/);
  assert.match(proposalRoute, /requireSignedEoi:\s*false/);
  assert.match(proposalRoute, /FOUNDATION_ASSESSMENT_COMPLETED_EVENT/);
  assert.match(proposalPdfRoute, /requireSignedEoi:\s*false/);
});

test("automatic email signature remains while editable signature API is gone", () => {
  assert.equal(exists("app/api/email/signature/route.ts"), false);
  const signature = read("lib/email-signatures.ts");
  const signatureCopy = read("lib/email-signature-copy.ts");
  const sendRoute = read("app/api/email/send/route.ts");
  const inboxRoute = read("components/admin/routes/AdminInboxRoute.tsx");
  const threadsRoute = read("app/api/email/threads/route.ts");
  const adminMailboxes = read("lib/admin-mailboxes.ts");
  const emailAddressing = read("lib/email-addressing.ts");

  assert.match(signature, /buildSystemEmailSignature/);
  assert.match(signatureCopy, /Founder & Platform Engineer/);
  assert.match(signatureCopy, /Karman Kekana/);
  assert.match(signatureCopy, /Moeketsi Moima/);
  assert.match(signatureCopy, /Tiisetso Mogotlane/);
  assert.match(signatureCopy, /Business Development/);
  assert.match(signatureCopy, /moeketsi@foundation-1\.co\.za/);
  assert.match(signatureCopy, /tiisetso@foundation-1\.co\.za/);
  assert.match(signatureCopy, /No 17 Muswell Road, Wedgefield Office Park/);
  assert.match(signatureCopy, /CONFIDENTIAL: This email and any files transmitted with it are confidential/);
  assert.match(signatureCopy, /foundationDisplayNameForEmail/);
  assert.match(sendRoute, /buildSystemEmailSignature/);
  assert.match(sendRoute, /shouldAppendSystemSignature/);
  assert.match(sendRoute, /foundationDisplayNameForEmail/);
  assert.match(adminMailboxes, /email: "karman@1os\.foundation-1\.co\.za"/);
  assert.match(adminMailboxes, /label: "Support"/);
  assert.match(adminMailboxes, /email: "support@1os\.foundation-1\.co\.za"/);
  assert.match(adminMailboxes, /label: "Sales"/);
  assert.match(adminMailboxes, /email: "sales@1os\.foundation-1\.co\.za"/);
  assert.doesNotMatch(adminMailboxes, /email: "karman@replies\.1os\.co\.za"/);
  assert.doesNotMatch(adminMailboxes, /email: "support@replies\.1os\.co\.za"/);
  assert.match(emailAddressing, /DEFAULT_OUTBOUND_EMAIL_DOMAIN = "foundation-1\.co\.za"/);
  assert.match(emailAddressing, /!configured\.startsWith\("replies\."\)/);
  assert.match(threadsRoute, /mailboxParam/);
  assert.match(threadsRoute, /resolveAdminSenderOption/);
  assert.match(threadsRoute, /adminMailbox\?\.email/);
  assert.match(inboxRoute, /switchMailbox/);
  assert.match(inboxRoute, /activeMailboxOption/);
  assert.match(inboxRoute, /Footer added to this email/);
  assert.match(inboxRoute, /Foundation-1 email banner/);
});

test("outbound Resend sends use the sending API key only", () => {
  const email = read("lib/email.ts");
  const deployment = read("docs/deployment.md");

  assert.match(email, /process\.env\.RESEND_API_KEY/);
  assert.doesNotMatch(email, /RESEND_RECEIVING_API_KEY\) \|\| normalizeEnv\(process\.env\.RESEND_API_KEY/);
  assert.match(email, /RESEND_API_KEY or EMAIL_FROM not configured/);
  assert.match(deployment, /RESEND_API_KEY.+outbound dashboard email/);
  assert.match(deployment, /RESEND_RECEIVING_API_KEY.+never used for outbound sends/);
});

test("sales surveillance is backed by login audit and email activity", () => {
  const migration = read("supabase/migrations/20260520120000_add_user_audit_events.sql");
  const authMigration = read("supabase/migrations/20260421090000_add_auth_and_agents.sql");
  const loginEvent = read("app/api/auth/login-event/route.ts");
  const surveillance = read("app/api/admin/sales/surveillance/route.ts");
  const loginForm = read("components/auth/LoginForm.tsx");
  const signOut = read("components/auth/SignOutButton.tsx");

  assert.match(migration, /oneos_user_audit_events/);
  assert.match(authMigration, /last_login_at/);
  assert.match(migration, /last_logout_at/);
  assert.match(migration, /service role manages oneos user audit events/);
  assert.match(loginEvent, /recordUserAuditEvent/);
  assert.match(loginForm, /\/api\/auth\/login-event/);
  assert.match(signOut, /eventType: "logout"/);
  assert.match(surveillance, /oneos_email_messages/);
  assert.match(surveillance, /oneos_email_threads/);
  assert.match(surveillance, /recentMessages/);
  assert.match(surveillance, /recentAuditEvents/);
});

test("obsolete animation/PDF generation dependencies stay removed while bill extraction is enabled", () => {
  const pkg = read("package.json");
  const billPdf = read("lib/utility-bill-pdf.ts");
  assert.doesNotMatch(pkg, /framer-motion/);
  assert.match(pkg, /"pdf-parse": "\^2\.4\.5"/);
  assert.doesNotMatch(pkg, /pdf-lib/);
  assert.match(pkg, /"fflate"/);
  assert.match(billPdf, /createPdfParser/);
  assert.doesNotMatch(billPdf, /import \{ PDFParse \} from "pdf-parse"/);
  assert.match(billPdf, /await parser\.destroy\(\)/);
});
