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

Admin and sales routes require the `oneos_session` cookie. EOI routes are public by token.

## Auth Profiles

`ONEOS_AUTH_PROFILES_JSON` accepts profiles with either plaintext `password` for local development or `passwordHash` for real environments.

Supported hash formats:

- `sha256:<hex>`
- `pbkdf2:<iterations>:<saltHex>:<hashHex>`

Use PBKDF2 with at least 100000 iterations for deployed environments.
