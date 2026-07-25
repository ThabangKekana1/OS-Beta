// Follow-up probe: fix 400s (column names) + real company names from lead payloads.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const strip = (s) => s.replace(/^["']|["']$/g, "");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), strip(l.slice(i + 1).trim())];
    }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" };

for (const t of ["migration_portal_profiles", "oneos_rate_limits"]) {
  const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, {
    headers: { ...H, Range: "0-0" },
  });
  const cr = r.headers.get("content-range");
  const body = await r.json();
  console.log(t, r.status, "count=" + (cr ? cr.split("/")[1] : "?"),
    "cols=" + (Array.isArray(body) && body[0] ? Object.keys(body[0]).join(",") : JSON.stringify(body).slice(0, 120)));
}

const r = await fetch(
  `${url}/rest/v1/oneos_admin_leads?select=payload&limit=6&order=created_at.desc`,
  { headers: H },
);
for (const row of await r.json()) {
  const p = row.payload || {};
  console.log("lead:", p.company || p.businessName || p.companyName || p.contactName || p.name, "|", p.email || "", "|", p.stage || "");
}
const imp = await fetch(
  `${url}/rest/v1/oneos_admin_leads?select=payload&payload->>id=like.lead-import-*&limit=3`,
  { headers: H },
);
for (const row of await imp.json()) {
  const p = row.payload || {};
  console.log("import:", p.company || p.businessName || p.name || p.contactName, "|", p.email || "", "|", p.stage || "");
}
const impCount = await fetch(
  `${url}/rest/v1/oneos_admin_leads?select=id&payload->>id=like.lead-import-*&limit=1`,
  { headers: { ...H, Range: "0-0" } },
);
console.log("lead-import-* count:", impCount.headers.get("content-range"));
