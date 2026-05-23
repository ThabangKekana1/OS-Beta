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
    "app/register/page.tsx",
    "app/register/[linkId]/page.tsx",
    "app/upload/[token]/page.tsx",
    "app/eoi/[token]/page.tsx",
    "app/admin/layout.tsx",
    "app/admin/page.tsx",
    "app/admin/leads/page.tsx",
    "app/admin/sales/page.tsx",
    "app/admin/leads/[id]/page.tsx",
    "app/admin/inbox/page.tsx",
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
    "app/partner",
    "app/signup/page.tsx",
    "app/utility-bills/[token]/page.tsx",
    "app/api/chat/route.ts",
    "app/api/workspace/state/route.ts",
    "app/api/auth/signup/route.ts",
    "app/api/email/signature/route.ts",
    "components/workspace",
    "components/partner",
    "components/sales",
    "components/utility-bills",
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

test("secure upload portal is a staged designer-grade flow", () => {
  const uploadPortal = read("components/upload/ClientDocumentUploadPortal.tsx");
  const uploadApi = read("app/api/upload/[token]/route.ts");

  assert.match(uploadPortal, /Start upload/);
  assert.match(uploadPortal, /What are you sending us\?/);
  assert.match(uploadPortal, /Drop your \{activeOption\.label\.toLowerCase\(\)\} files/);
  assert.match(uploadPortal, /Clean\. Saved\. Connected\./);
  assert.match(uploadApi, /expression_of_interest/);
  assert.match(uploadApi, /signed_eoi/);
  assert.match(uploadApi, /utility_bills/);
  assert.match(uploadApi, /signed_proposal/);
  assert.match(uploadApi, /link: `\/admin\/leads\/\$\{savedLead\.clientProfileId\}`/);
});

test("auth and EOI no longer point to deleted workspace, partner, or signup routes", () => {
  const auth = read("lib/auth.ts");
  const proxy = read("proxy.ts");
  const loginForm = read("components/auth/LoginForm.tsx");
  const eoiForm = read("components/eoi/EoiSigningForm.tsx");
  const inbound = read("app/api/email/inbound/route.ts");

  assert.match(auth, /if \(role === "admin"\) return "\/admin"/);
  assert.match(auth, /if \(role === "sales"\) return "\/sales"/);
  assert.match(auth, /return "\/"/);
  assert.match(proxy, /pathname\.startsWith\("\/admin"\) \|\| pathname\.startsWith\("\/sales"\)/);
  assert.match(loginForm, /sales portal/);
  assert.doesNotMatch(loginForm, /Create an account|\/signup|sales workspace|partner portal|private workspace/);
  assert.doesNotMatch(eoiForm, /\/workspace/);
  assert.match(eoiForm, /Copy Template/);
  assert.match(eoiForm, /company letterhead/);
  assert.match(inbound, /\/admin\/inbox\?thread=/);
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
  assert.match(signatureCopy, /Moeketsi Moima/);
  assert.match(signatureCopy, /Business Development/);
  assert.match(signatureCopy, /moeketsi@foundation-1\.co\.za/);
  assert.match(signatureCopy, /No 17 Muswell Road, Wedgefield Office Park/);
  assert.match(signatureCopy, /CONFIDENTIAL: This email and any files transmitted with it are confidential/);
  assert.match(sendRoute, /buildSystemEmailSignature/);
  assert.match(sendRoute, /systemSignatureTextForSender/);
  assert.match(sendRoute, /shouldAppendSystemSignature/);
  assert.match(adminMailboxes, /email: "karman@foundation-1\.co\.za"/);
  assert.match(adminMailboxes, /label: "Support"/);
  assert.match(adminMailboxes, /email: "support@foundation-1\.co\.za"/);
  assert.match(adminMailboxes, /label: "Sales"/);
  assert.match(adminMailboxes, /email: "sales@foundation-1\.co\.za"/);
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

test("obsolete agent and PDF parsing dependencies are removed", () => {
  const pkg = read("package.json");
  assert.doesNotMatch(pkg, /@openrouter\/sdk/);
  assert.doesNotMatch(pkg, /framer-motion/);
  assert.doesNotMatch(pkg, /pdf-parse/);
  assert.doesNotMatch(pkg, /pdf-lib/);
  assert.match(pkg, /"fflate"/);
});
