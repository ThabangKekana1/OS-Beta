# Production Deployment Guide

This guide walks through deploying 1OS to production with Supabase as the
backing store and Vercel (or any Node-compatible host) as the runtime.

## 1. Create a Supabase project

1. Go to <https://supabase.com> and create a new project.
2. From **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`
3. From **Storage**, no manual bucket creation is required — the app
   creates the `oneos-documents` bucket automatically on first upload.

## 2. Apply the database schema

Either install the Supabase CLI and run:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

…or open **SQL Editor** in the Supabase dashboard and paste the contents
of every file under `supabase/migrations/` (in filename order).

The migrations create:

- Core data: `oneos_admin_state`, `oneos_admin_leads`, `oneos_sales_leads`,
  `oneos_client_documents`, `oneos_workspace_states`
- Auth: `oneos_agents`, `oneos_users`, `oneos_auth_sessions`, `oneos_rate_limits`
- All tables have **RLS enabled** with service-role-only policies.

## 3. Create your first admin user

Generate a password hash locally:

```bash
node scripts/hash-password.mjs "MyStrongPassword!"
# → pbkdf2:200000:<salt>:<hash>
```

Set `ONEOS_AUTH_PROFILES_JSON` (one line, escape quotes per your host):

```json
[
  {"email":"admin@yourco.com","passwordHash":"pbkdf2:200000:...:...","name":"Admin","role":"admin","agentId":"agent-admin"}
]
```

The first request to your app calls `ensureBootstrap()` which inserts the
agents and seeds these profiles into `oneos_users`. After the first
successful login you can **delete** `ONEOS_AUTH_PROFILES_JSON` — users
are now persisted in the database and can be managed via SQL or a future
admin UI.

## 4. Generate an auth secret

```bash
openssl rand -hex 32
# → 64-char hex string → ONEOS_AUTH_SECRET
```

## 5. Configure an LLM provider

Production refuses to use the local Ollama loopback. Set **either**:

- `GOOGLE_API_KEY` (recommended) + `AI_PROVIDER=google`
- or `OPENAI_API_KEY` + `AI_PROVIDER=openai`

## 6. Set environment variables on your host

Required:

| Var | Notes |
|-----|-------|
| `NODE_ENV` | `production` |
| `ONEOS_AUTH_SECRET` | ≥32 chars |
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase, **secret** |
| `GOOGLE_API_KEY` (or `OPENAI_API_KEY`) | LLM provider |

Bootstrap-only (delete after first login):

| Var | Notes |
|-----|-------|
| `ONEOS_AUTH_PROFILES_JSON` | seeds first users |

## 7. Deploy

On Vercel: push to your repo, import the project, and set the env vars
above. The build command is `next build` (default). Health is reachable at
`/api/healthz` after the first cold start.

## 8. Verify

Hit `https://<your-domain>/api/healthz` — expect `200 OK` with all
checks `ok: true`. Sign in at `/login`. Confirm in Supabase that:

- `oneos_users` has your bootstrap user
- `oneos_auth_sessions` records the login
- `oneos_rate_limits` increments on rapid attempts

## 9. Hardening checklist (what's already enforced)

- ✅ Supabase RLS service-role only
- ✅ HMAC-signed httpOnly session cookies
- ✅ PBKDF2 (200k iterations) password hashing
- ✅ Account lockout after 10 failed logins (15 min)
- ✅ Rate limits: login (10/15min/IP), chat (30/min/user),
  public registration (5/hour/IP)
- ✅ DB-backed session revocation on logout
- ✅ Same-origin / CSRF protection on mutating API routes
- ✅ Security headers (X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy, HSTS in prod)
- ✅ Health endpoint at `/api/healthz`
- ✅ Production refuses unconfigured auth or missing LLM provider

## 10. Operations

- **Monitoring**: point your uptime checker at `/api/healthz`.
- **Log aggregation**: console output is structured (`[scope]` prefixed);
  pipe to your platform's log drain.
- **Backups**: Supabase handles point-in-time recovery on Pro tier.
- **Rotating the auth secret**: changing `ONEOS_AUTH_SECRET` invalidates
  every existing session (users must re-login). Coordinate with users.
- **Adding users post-bootstrap**: insert directly into `oneos_users`
  with a hash from `scripts/hash-password.mjs`, or build an admin UI
  using the helpers in `lib/users-db.ts`.
