# Production Deployment Guide

This guide walks through deploying 1OS to production with Supabase as the
backing store and Vercel (or any Node-compatible host) as the runtime.

## 1. Create a Supabase project

1. Go to <https://supabase.com> and create a new project.
2. From **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `publishable` key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`
3. Storage: no manual bucket creation required — the app creates the
   `oneos-documents` bucket on first upload.

## 2. Apply the database schema

```bash
supabase link --project-ref <your-ref>
supabase db push
```

…or paste each file under `supabase/migrations/` (in filename order) into
the SQL Editor.

The migrations create:

- Core data: `oneos_admin_state`, `oneos_admin_leads`, `oneos_sales_leads`,
  `oneos_client_documents`, `oneos_workspace_states`
- Profiles: `oneos_agents`, `oneos_users`
- Rate limiting: `oneos_rate_limits`
- All tables have **RLS enabled** with service-role-only policies.

## 3. Configure Supabase Auth

1. In the Supabase dashboard go to **Authentication → Providers** and
   enable Email + (optional) Google.
2. Set the **Site URL** to your production domain.
3. Add `https://<your-domain>/auth/callback` to the redirect allow list.

## 4. Invite your first admin

1. Supabase dashboard → **Authentication → Users → Invite user**.
   Enter the admin email; Supabase sends a confirmation/password link.
2. Open the SQL Editor and add a matching profile row:

   ```sql
   insert into public.oneos_users (email, name, role, agent_id, is_active)
   values ('admin@yourco.com', 'Admin Name', 'admin', 'agent-admin', true);
   ```

3. The same flow applies for `sales` and `partner` users (set
   `partner_org_id` for partners).

## 5. Configure an LLM provider

Production refuses to use the local Ollama loopback. Set **either**:

- `GOOGLE_API_KEY` (recommended) + `AI_PROVIDER=google`
- or `OPENAI_API_KEY` + `AI_PROVIDER=openai`

## 6. Set environment variables on your host

| Var | Notes |
|-----|-------|
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase, **secret** |
| `GOOGLE_API_KEY` (or `OPENAI_API_KEY`) | LLM provider |

## 7. Deploy

On Vercel: push to your repo, import the project, set the env vars
above. Build command: `next build` (default). Health is reachable at
`/api/healthz`.

## 8. Verify

Hit `https://<your-domain>/api/healthz` — expect `200 OK` with all
checks `ok: true`. Sign in at `/login` with your invited admin.

## 9. Hardening checklist (what's already enforced)

- ✅ Supabase Auth (email/password + OAuth) — sole auth provider
- ✅ Email verification required before session is honoured
- ✅ Supabase RLS service-role only on app tables
- ✅ Rate limits: chat (30/min/user), public registration (5/hour/IP)
- ✅ Same-origin / CSRF protection on mutating API routes
- ✅ Security headers (X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy, HSTS in prod)
- ✅ Health endpoint at `/api/healthz`

## 10. Operations

- **Monitoring**: point your uptime checker at `/api/healthz`.
- **Log aggregation**: console output is structured (`[scope]` prefixed);
  pipe to your platform's log drain.
- **Backups**: Supabase handles point-in-time recovery on Pro tier.
- **Adding users**: invite via Supabase dashboard, then `insert into
  public.oneos_users` with the desired role / `agent_id` /
  `partner_org_id`.
- **Revoking access**: either delete the Supabase Auth user or set
  `is_active = false` on their `oneos_users` row.
