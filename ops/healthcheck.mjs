#!/usr/bin/env node
// Foundation-1 local ops healthcheck. Read-only; safe to run anytime.
// Usage: node ops/healthcheck.mjs   (from 1OS/, or anywhere — paths are absolute-resolved)
// Exit code: 0 = all PASS/WARN, 1 = at least one FAIL.

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OS_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = 2000;
const NODE_PROC_WARN = 40;

const results = [];
const ts = () => new Date().toISOString();
function report(name, level, detail) {
  results.push({ name, level, detail });
  console.log(`${ts()} [${level}] ${name} — ${detail}`);
}

function loadEnvLocal() {
  const p = join(OS_ROOT, ".env.local");
  if (!existsSync(p)) return {};
  const strip = (s) => s.replace(/^["']|["']$/g, "");
  return Object.fromEntries(
    readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), strip(l.slice(i + 1).trim())];
      }),
  );
}

async function timedFetch(url, opts = {}) {
  const start = Date.now();
  const res = await fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { res, ms: Date.now() - start };
}

async function checkPort(name, url) {
  try {
    const { res, ms } = await timedFetch(url);
    if (res.ok || res.status === 503) {
      const level = ms > 1500 ? "WARN" : res.status === 503 ? "WARN" : "PASS";
      report(name, level, `HTTP ${res.status} in ${ms}ms`);
    } else {
      report(name, "FAIL", `HTTP ${res.status}`);
    }
  } catch (e) {
    report(name, "FAIL", `unreachable within ${TIMEOUT_MS}ms (${e.name === "TimeoutError" ? "timeout" : e.message})`);
  }
}

async function checkSupabase(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    report("supabase REST", "FAIL", "missing SUPABASE_URL or key in 1OS/.env.local");
    return;
  }
  try {
    const { res, ms } = await timedFetch(`${url}/rest/v1/`, {
      headers: { apikey: key },
    });
    // A paused free-tier project typically times out or returns 5xx here.
    if (res.status < 500) {
      report("supabase REST", ms > 1500 ? "WARN" : "PASS", `HTTP ${res.status} in ${ms}ms`);
    } else {
      report("supabase REST", "FAIL", `HTTP ${res.status} — project may be PAUSED (free tier auto-pause); see ops/README-ops.md`);
    }
  } catch (e) {
    report("supabase REST", "FAIL", `unreachable (${e.name === "TimeoutError" ? "timeout" : e.message}) — project may be PAUSED; see ops/README-ops.md`);
  }
}

function checkNodeProcs() {
  try {
    const out = execSync("ps ax -o comm=", { encoding: "utf8" });
    const count = out.split("\n").filter((l) => /(^|\/)node(\d*)?($| )/.test(l.trim()) || l.includes("next-server")).length;
    if (count > NODE_PROC_WARN) {
      report("node process count", "FAIL", `${count} node processes (> ${NODE_PROC_WARN}) — possible turbopack/orphan explosion. Run: pkill -f "next dev"`);
    } else if (count > 25) {
      report("node process count", "WARN", `${count} node processes — watch for strays (healthy baseline ~13-16)`);
    } else {
      report("node process count", "PASS", `${count} node processes`);
    }
  } catch (e) {
    report("node process count", "WARN", `could not count: ${e.message}`);
  }
}

const env = loadEnvLocal();
await Promise.all([
  checkPort("website :3001", "http://localhost:3001/"),
  checkPort("platform :3002 /api/healthz", "http://localhost:3002/api/healthz"),
  checkSupabase(env),
]);
checkNodeProcs();

const fails = results.filter((r) => r.level === "FAIL").length;
const warns = results.filter((r) => r.level === "WARN").length;
console.log(
  `${ts()} SUMMARY: ${results.length - fails - warns} PASS, ${warns} WARN, ${fails} FAIL`,
);
process.exit(fails > 0 ? 1 : 0);
