# 1OS Backend Contract

The app now has server routes for the product data that previously lived only in client state.

## Persistence

When `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured, server state is persisted in Supabase Postgres through the migration in `supabase/migrations/20260418123000_create_oneos_backend.sql`.

Primary tables:

- `oneos_admin_state`
- `oneos_admin_leads`
- `oneos_sales_leads`
- `oneos_client_documents`
- `oneos_workspace_states`

Each public table has RLS enabled and service-role-only policies. The Next.js backend uses the service role key only on the server.

Private Supabase Storage remains available as a fallback and for file bytes:

- `oneos-internal-state/admin/state-v1.json`
- `oneos-workspace-state/workspaces/{workspaceId}/state-v1.json`
- `oneos-client-documents/{clientProfileId}/{documentId}-{filename}`

When Supabase is not configured, the routes return seeded local state and keep the UI usable, but server writes are not durable across deployments.

## API Surface

- `GET /api/workspace/state`
- `PUT /api/workspace/state`
- `GET /api/admin/state`
- `PUT /api/admin/state`
- `GET /api/admin/leads/:id`
- `PATCH /api/admin/leads/:id`
- `POST /api/admin/leads/:id/documents`
- `GET /api/admin/sales-leads`
- `POST /api/admin/sales-leads`
- `GET /api/admin/sales-leads/:id`
- `PATCH /api/admin/sales-leads/:id`
- `GET /api/eoi/:token`
- `POST /api/eoi/:token`

Admin, sales, and partner routes require a Supabase Auth session whose email matches an active row in `oneos_users`. EOI routes are public by token.

## Roles & profiles

Authentication is handled by Supabase Auth (email/password + Google OAuth).
Role, `agent_id`, and `partner_org_id` are resolved server-side by looking
up the signed-in user's email in `oneos_users`. Provision new staff by
inviting them via the Supabase dashboard (or the partner-orgs invite API
for partner users), then inserting a matching row in `oneos_users`.

Users without an `oneos_users` row are treated as standard `client`
workspace tenants.
