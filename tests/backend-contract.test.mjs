import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("Supabase migration defines the durable backend schema", () => {
  const sql = read("supabase/migrations/20260418123000_create_oneos_backend.sql");
  const tables = [
    "oneos_admin_state",
    "oneos_admin_leads",
    "oneos_sales_leads",
    "oneos_client_documents",
    "oneos_workspace_states",
  ];

  for (const table of tables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`service role manages ${table.replaceAll("_", " ")}`));
  }

  assert.match(sql, /create index if not exists oneos_admin_leads_owner_idx/);
  assert.match(sql, /create index if not exists oneos_admin_leads_eoi_token_idx/);
  assert.match(sql, /create index if not exists oneos_client_documents_profile_idx/);
});

test("backend API routes exist for workspace, CRM, sales leads, documents, and EOI", () => {
  const routeFiles = [
    "app/api/workspace/state/route.ts",
    "app/api/admin/state/route.ts",
    "app/api/admin/leads/[id]/route.ts",
    "app/api/admin/leads/[id]/documents/route.ts",
    "app/api/admin/sales-leads/route.ts",
    "app/api/admin/sales-leads/[id]/route.ts",
    "app/api/eoi/[token]/route.ts",
    "app/api/register/[linkId]/route.ts",
  ];

  for (const routeFile of routeFiles) {
    assert.equal(existsSync(join(root, routeFile)), true, `${routeFile} missing`);
  }
});

test("server stores prefer Supabase Postgres before storage fallback", () => {
  const adminStore = read("lib/admin-state-store.ts");
  const workspaceStore = read("lib/workspace-state-store.ts");
  const adminState = read("lib/admin-state.ts");
  const dbStore = read("lib/supabase-db-store.ts");

  assert.match(adminStore, /readAdminStateFromDatabase/);
  assert.match(adminStore, /writeAdminStateToDatabase/);
  assert.match(adminStore, /storage-migration/);
  assert.match(workspaceStore, /readWorkspaceStateFromDatabase/);
  assert.match(workspaceStore, /writeWorkspaceStateToDatabase/);
  assert.match(workspaceStore, /writeWorkspaceStateToDatabase\(workspaceId, snapshot\)/);
  assert.match(adminState, /value === undefined[\s\S]*return \[\]/);
  assert.match(dbStore, /oneos_admin_leads/);
  assert.match(dbStore, /oneos_workspace_states/);
});

test("documentation lists the backend contract", () => {
  const docs = read("docs/backend.md");

  assert.match(docs, /oneos_admin_leads/);
  assert.match(docs, /\/api\/admin\/sales-leads\/:id/);
  assert.match(docs, /\/api\/eoi\/:token/);
});

test("auth requires explicit runtime configuration without demo fallbacks", () => {
  const auth = read("lib/auth.ts");
  const loginRoute = read("app/api/auth/login/route.ts");

  assert.doesNotMatch(auth, /admin@demo\.localhost/);
  assert.doesNotMatch(auth, /replace-this-secret-before-going-live/);
  assert.match(auth, /getAuthConfigurationError/);
  assert.match(loginRoute, /getAuthConfigurationError/);
  assert.match(loginRoute, /status:\s*503/);
});

test("document downloads use stored file bytes instead of generated placeholder text", () => {
  const documentsRoute = read("app/api/admin/leads/[id]/documents/route.ts");
  const leadProfileRoute = read("components/admin/routes/AdminLeadProfileRoute.tsx");

  assert.match(documentsRoute, /export async function GET/);
  assert.match(documentsRoute, /downloadPrivateObject/);
  assert.doesNotMatch(documentsRoute, /1OS Client Document Export/);
  assert.match(leadProfileRoute, /api\/admin\/leads\/\$\{lead\.id\}\/documents\?documentId=/);
});

test("public EOI signing page uses A4 profile-number document without exposing email", () => {
  const eoiRoute = read("app/api/eoi/[token]/route.ts");
  const eoiForm = read("components/eoi/EoiSigningForm.tsx");
  const leadProfileRoute = read("components/admin/routes/AdminLeadProfileRoute.tsx");

  assert.match(eoiRoute, /toPublicEoiLead/);
  assert.doesNotMatch(eoiRoute, /email:\s*lead\.userProfile\.email/);
  assert.doesNotMatch(eoiRoute, /email:\s*signedLead\.userProfile\.email/);
  assert.match(eoiForm, /aspect-\[210\/297\]/);
  assert.doesNotMatch(eoiForm, /Client email:/);
  assert.match(eoiForm, /1OS Profile Number:/);
  assert.match(leadProfileRoute, /Open Client Signing Page/);
  assert.match(leadProfileRoute, /Profile No:/);
});

test("client registration supports profile links and separate contact name fields", () => {
  const registrationForm = read("components/registration/ClientRegistrationForm.tsx");
  const registrationApi = read("app/api/register/[linkId]/route.ts");
  const adminProfile = read("components/admin/routes/AdminLeadProfileRoute.tsx");

  assert.match(registrationForm, /Contact Name/);
  assert.match(registrationForm, /Contact Surname/);
  assert.match(registrationForm, /Position in Company/);
  assert.match(registrationApi, /registrationLinkIdForProfile/);
  assert.match(registrationApi, /public-registration/);
  assert.match(adminProfile, /Registered via/);
});
