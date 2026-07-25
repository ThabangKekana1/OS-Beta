// One-shot Supabase data probe: row counts + lead samples. Read-only.
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

const tables = [
  "oneos_admin_leads",
  "migration_portal_profiles",
  "oneos_notifications",
  "deal_rooms",
  "associations",
  "oneos_rate_limits",
];

for (const t of tables) {
  const r = await fetch(`${url}/rest/v1/${t}?select=id&limit=1`, {
    headers: { ...H, Range: "0-0" },
  });
  const cr = r.headers.get("content-range");
  console.log(t.padEnd(28), r.status, "count=" + (cr ? cr.split("/")[1] : "?"));
}

const name = (p = {}) =>
  p.businessName || p.companyName || p.name || JSON.stringify(p).slice(0, 80);
for (const [label, order] of [["newest", "desc"], ["oldest", "asc"]]) {
  const r = await fetch(
    `${url}/rest/v1/oneos_admin_leads?select=payload,created_at&limit=3&order=created_at.${order}`,
    { headers: H },
  );
  for (const row of await r.json())
    console.log(label + ":", row.created_at, "|", name(row.payload));
}
