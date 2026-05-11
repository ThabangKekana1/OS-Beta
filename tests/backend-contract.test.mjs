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
  const agentConfig = read("lib/assistant/agent-config.ts");

  assert.match(adminStore, /readAdminStateFromDatabase/);
  assert.match(adminStore, /writeAdminStateToDatabase/);
  assert.match(adminStore, /storage-migration/);
  assert.match(workspaceStore, /readWorkspaceStateFromDatabase/);
  assert.match(workspaceStore, /writeWorkspaceStateToDatabase/);
  assert.match(workspaceStore, /writeWorkspaceStateToDatabase\(workspaceId, snapshot\)/);
  assert.match(adminState, /value === undefined[\s\S]*return \[\]/);
  assert.match(dbStore, /oneos_admin_leads/);
  assert.match(dbStore, /oneos_workspace_states/);
  assert.match(agentConfig, /oneos_agent_config/);
  assert.match(agentConfig, /readJsonObject/);
  assert.match(agentConfig, /writeJsonObject/);
});

test("agent guardrails are backed by a durable table and visible save actions", () => {
  const sql = read("supabase/migrations/20260427183000_add_agent_config.sql");
  const route = read("components/admin/routes/AgentGuardrailsRoute.tsx");

  assert.match(sql, /create table if not exists public\.oneos_agent_config/);
  assert.match(sql, /alter table public\.oneos_agent_config enable row level security/);
  assert.match(sql, /service role manages oneos agent config/);
  assert.match(route, /Unsaved changes/);
  assert.match(route, /Save changes/);
  assert.match(route, /Save to apply these rules to the very next customer message\./);
});

test("documentation lists the backend contract", () => {
  const docs = read("docs/backend.md");

  assert.match(docs, /oneos_admin_leads/);
  assert.match(docs, /\/api\/admin\/sales-leads\/:id/);
  assert.match(docs, /\/api\/eoi\/:token/);
});

test("auth uses Supabase Auth exclusively (no legacy custom-cookie code)", () => {
  const auth = read("lib/auth.ts");
  const authServer = read("lib/auth-server.ts");
  const proxyTs = read("proxy.ts");
  const signupRoute = read("app/api/auth/signup/route.ts");
  const clientRegistration = read("lib/client-registration.ts");
  const callbackRoute = read("app/auth/callback/route.ts");
  const confirmPage = read("app/auth/confirm/page.tsx");

  // Legacy symbols must be gone.
  assert.doesNotMatch(auth, /admin@demo\.localhost/);
  assert.doesNotMatch(auth, /replace-this-secret-before-going-live/);
  assert.doesNotMatch(auth, /SESSION_COOKIE_NAME|validateCredentials|readSessionToken|getAuthConfigurationError/);
  assert.doesNotMatch(authServer, /SESSION_COOKIE_NAME|readActiveSessionToken/);
  assert.doesNotMatch(proxyTs, /SESSION_COOKIE_NAME|readSessionToken/);

  // Supabase Auth wired in.
  assert.match(authServer, /createSupabaseServerClient/);
  assert.match(authServer, /supabase\.auth\.getUser\(\)/);
  assert.match(proxyTs, /supabase\.auth\.getClaims\(\)/);
  assert.match(signupRoute, /"\/auth\/confirm"/);
  assert.match(signupRoute, /buildAdminLeadShellFromSignup/);
  assert.match(signupRoute, /upsertProfile/);
  assert.match(clientRegistration, /buildAdminLeadShellFromSignup/);
  assert.match(clientRegistration, /stage: "Client Registered"/);
  assert.match(callbackRoute, /verifyOtp/);
  assert.match(confirmPage, /setSession/);
  assert.match(confirmPage, /window\.location\.replace\(nextPath\)/);
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
  assert.match(eoiForm, /Signature ID:/);
  assert.match(eoiRoute, /randomUUID/);
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

test("workspace chat and uploads use the durable server workspace id", () => {
  const workspaceProvider = read("components/providers/WorkspaceProvider.tsx");
  const workspaceRoute = read("app/api/workspace/state/route.ts");
  const workspaceState = read("lib/workspace-state.ts");

  assert.match(workspaceRoute, /workspaceId:/);
  assert.match(workspaceProvider, /workspaceId\?: string/);
  assert.match(workspaceProvider, /serverWorkspaceId/);
  assert.match(workspaceProvider, /workspaceId: chatWorkspaceId/);
  assert.match(workspaceProvider, /formData\.set\("workspaceId", uploadWorkspaceId\)/);
  assert.match(workspaceState, /function createStarterCase/);
  assert.match(workspaceState, /ensureWorkspaceCases/);
  assert.match(workspaceState, /spending at least R10,000 per month on electricity/);
  assert.match(workspaceState, /utility bills or prepaid receipts/);
});

test("workspace supports multiple businesses and multiple locations", () => {
  const workspaceProvider = read("components/providers/WorkspaceProvider.tsx");
  const profileView = read("components/workspace/ProfileView.tsx");
  const workspaceSwitcher = read("components/sidebar/WorkspaceSwitcher.tsx");
  const recentCases = read("components/sidebar/SidebarRecentCases.tsx");
  const types = read("lib/types.ts");

  assert.match(types, /export interface BusinessLocation/);
  assert.match(types, /locations: BusinessLocation\[]/);
  assert.match(workspaceProvider, /createBusinessCase: \(\) => string/);
  assert.match(workspaceProvider, /const createBusinessCase = \(\) => {/);
  assert.match(profileView, /Add location/);
  assert.match(profileView, /Remove location/);
  assert.match(workspaceSwitcher, /Add business/);
  assert.match(recentCases, /Businesses/);
});

test("register mode is handled by the server-backed registration state machine", () => {
  const chatRoute = read("app/api/chat/route.ts");
  const registrationAgent = read("lib/registration-agent.ts");

  assert.match(chatRoute, /source:\s*"registration"/);
  assert.doesNotMatch(chatRoute, /inferConversationMode/);
  assert.match(chatRoute, /callOpenRouterChat/);
  assert.match(chatRoute, /OPENROUTER_API_KEY/);
  assert.doesNotMatch(chatRoute, /GEMINI_API_KEY|GOOGLE_API_KEY|thinkingBudget/);
  assert.match(chatRoute, /buildRegistrationReply/);
  assert.match(chatRoute, /buildAuthoritativeClientProfileNote/);
  assert.match(chatRoute, /isSignupShellLead/);
  assert.match(chatRoute, /Start pre-qualification with only the first missing question/);
  assert.match(chatRoute, /Authoritative saved client profile/);
  assert.match(chatRoute, /company registration number:/);
  assert.match(chatRoute, /recentHistory:\s*history/);
  assert.match(chatRoute, /spending at least R10,000 per month on electricity/);
  assert.match(chatRoute, /Nedbank uses the last 6 months of usage data/);
  assert.match(chatRoute, /Utility Bills \(last 6 months\)/);
  assert.match(registrationAgent, /Conversation transcript:/);
  assert.match(registrationAgent, /const PREQUAL_FIELDS =/);
  assert.match(registrationAgent, /FIELD_QUESTIONS/);
  assert.match(registrationAgent, /looksLikeRegistrationConfirmation/);
  assert.match(registrationAgent, /Reply with `confirm` to submit/);
  assert.match(registrationAgent, /utility bills or prepaid electricity receipts/);
  assert.match(registrationAgent, /fallbackNote\?\.trim\(\)/);
});

test("login page copy changes for admin redirects", () => {
  const loginPage = read("app/login/page.tsx");
  const loginForm = read("components/auth/LoginForm.tsx");

  assert.match(loginPage, /loginVariantForPath/);
  assert.match(loginPage, /variant=\{loginVariantForPath\(nextPath\)\}/);
  assert.match(loginForm, /LoginVariant/);
  assert.match(loginForm, /Log in to the 1OS admin portal\./);
  assert.match(loginForm, /Need admin access\?/);
});
