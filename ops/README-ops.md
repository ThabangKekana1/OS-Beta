# Foundation-1 Local Ops (M4 MacBook Air — 16GB, fanless)

## Healthcheck

```sh
node ops/healthcheck.mjs        # from 1OS/
```

Checks (each PASS/WARN/FAIL, timestamped; exits 1 on any FAIL):
1. Website `http://localhost:3001/` responds < 2s
2. Platform `http://localhost:3002/api/healthz` responds < 2s (that route itself pings Supabase `oneos_admin_state` + verifies env keys)
3. Supabase REST reachable (`$SUPABASE_URL/rest/v1/` with apikey from `1OS/.env.local`)
4. Node process count (WARN > 25, FAIL > 40 — healthy baseline is ~13–16 total, 3 for the two dev servers)

Run it after any crash, before starting work, or cron it:
`*/15 * * * * cd "/Users/straylight/Desktop/1-MI/1OS" && node ops/healthcheck.mjs >> /tmp/f1-health.log 2>&1`

`ops/supabase-probe.mjs` / `probe2` — read-only row-count + data-sample probes.

## Dev server rules (machine has CRASHED from this — non-negotiable)

- **WEBPACK ONLY. Never turbopack.** Next 16 turbopack dev spawns 600+ workers building its FS cache → RAM exhaustion → hard crash.
  - 1OS: `npm run dev:webpack -- --port 3002`
  - NEW F-1: `npx next dev --webpack --port 3001`
- **Never `npm install`** while dev servers run; never launch a second instance of the same app.
- Before starting any dev server, kill strays:

```sh
pkill -f "next dev"        # kills both dev servers + orphans; restart deliberately
```

## When Supabase goes dark (it happened — DB vanished for hours)

Likely cause: **free-tier auto-pause** (Supabase pauses free projects after ~7 days of no API activity). Symptoms: healthz 503, REST timeouts, `fetch failed` in intake — and **no alert fires, because notifications are stored in Supabase itself**.

Fix options (pick one):
1. **Upgrade to Pro** (no auto-pause) — correct answer once real client data flows.
2. **Keep-alive ping**: cron the healthcheck (above) at least daily — its REST call counts as activity and prevents the pause.

Restore steps when paused:
1. Dashboard → project `ovaoppiangcksrfginck` → **Restore/Unpause** (takes a few minutes).
2. `node ops/healthcheck.mjs` until supabase REST = PASS.
3. Verify data survived: `node ops/supabase-probe.mjs` (expect ~5k leads, ~19 profiles).
4. Check migrations still applied (paused ≠ wiped, but after 90 days paused free projects can be **deleted** — do not leave it paused).

## Known log noise (dev terminals)

- Neither `1OS/package.json` nor `NEW F-1/package.json` sets `"type": "module"` while both use `.mjs` configs → Node reparse warnings (`MODULE_TYPELESS_PACKAGE_JSON`) on dev startup. Harmless; fix by adding the field (test first — app code is CJS-adjacent).
- Version skew: 1OS runs next-server 16.2.2 (`^16.0.0`), NEW F-1 pins 16.2.6. Align when convenient.

## Product intelligence and bounded graphs

Apply `supabase/migrations/20260723140000_agent_graph_intelligence.sql`, then configure:

- `TELEMETRY_INGEST_SECRET` in both NEW F-1 and 1OS.
- `TELEMETRY_HASH_SECRET` in 1OS.
- `CRON_SECRET` in 1OS/Vercel.

The public website and client-facing 1OS workspace collectors are opt-in and
store production, preview, development and test signals separately. Admin and
sales routes are excluded. To exercise either collector in an end-to-end test,
accept the visible analytics prompt or set local storage key
`foundation1:product-insights-consent` to `accepted` before navigation, then
inspect `/admin/intelligence?environment=test`.

The daily learning cycle runs from `/api/internal/intelligence/refresh` at 03:00 UTC. It aggregates signals, refreshes human-reviewed recommendations and prunes raw events older than 90 days. It never changes calculations, workflow stages or external customer actions.

Architecture and deployment order: `../4. Foundation-1 OS/07_AGENT_GRAPH_ARCHITECTURE.md`.
