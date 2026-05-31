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
2. Set the **Site URL** to `https://www.1os.co.za`.
3. Add these exact URLs to the redirect allow list:
   - `https://www.1os.co.za/auth/confirm`
   - `https://www.1os.co.za/auth/callback`
   - `https://1os.co.za/auth/confirm`
   - `https://1os.co.za/auth/callback`
   - `http://localhost:3000/auth/confirm`
   - `http://localhost:3000/auth/callback`

`/auth/confirm` is used for email confirmation. `/auth/callback` is used for OAuth/invite flows.

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

## 5. Set environment variables on your host

| Var | Notes |
|-----|-------|
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase, **secret** |
| `APP_BASE_URL` | canonical app origin, e.g. `https://1os.foundation-1.co.za` |
| `NEXT_PUBLIC_SITE_URL` | same canonical public origin |
| `EMAIL_OUTBOUND_DOMAIN` | `foundation-1.co.za` |
| `EMAIL_REPLY_DOMAIN` | Resend inbound subdomain, e.g. `replies.foundation-1.co.za` |
| `RESEND_RECEIVING_API_KEY` | Optional separate Resend key with receiving-email read access if `RESEND_API_KEY` is send-only |

Keep Resend inbound on a dedicated reply subdomain. Do not point the root
`foundation-1.co.za` MX at Resend if human mailbox/webmail hosting also receives
mail for `@foundation-1.co.za`.

For the current 1-grid mailbox setup, the root MX records belong to the 1-grid
cluster (`1-grid-mx01.co.za`, `1-grid-mx02.com`, `1-grid-mx03.co.za`,
`1-grid-mx04.com`), while `webmail`, `mail`, `imap`, and `smtp` point to the
assigned Plesk server `lnxsvrweb09.hostserv.co.za`.

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
