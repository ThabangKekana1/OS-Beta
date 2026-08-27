/**
 * Ingest the Target Machine direct book into foundation1_sales_book so the
 * sales harness reads database rows at runtime, never workspace files.
 *
 * Usage:  node scripts/import-sales-book.mjs [path-to-direct_book.json]
 * Env:    NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const path = process.argv[2]
  ?? decodeURIComponent(new URL("../../6. Target Machine/book/direct_book.json", import.meta.url).pathname);

const rows = JSON.parse(readFileSync(path, "utf8"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase admin env is not configured.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

// Sector weights and bands live in lib/harness/score.ts; this script mirrors
// only what it needs to rank the ingested set (scores are recomputed on read).
const SECTOR_FIT = { poultry: 1.0, dairy: 0.9, milling: 0.8, feed: 0.7 };
const BAND = { "250k+": 1.0, "50k-250k": 0.8, "10k-50k": 0.5, unknown: 0.25 };

let inserted = 0;
for (const row of rows) {
  const record = {
    book_id: row.id,
    company_name: row.company_name,
    cipc_reg_no: row.cipc_reg_no ?? null,
    sector: row.sector ?? "other",
    sub_sector: row.sub_sector ?? null,
    site_type: row.site_type ?? null,
    province: row.province ?? null,
    town: row.town ?? null,
    scale_signal: row.scale_signal ?? null,
    electricity_rationale: row.electricity_rationale ?? null,
    est_spend_band: row.est_spend_band ?? null,
    website: row.website ?? null,
    contact_channel: row.contact_channel ?? null,
    verification: ["V", "I"].includes(row.verification) ? row.verification : null,
    source_name: row.source_name ?? null,
    source_url: row.source_url ?? null,
    source_accessed: row.source_accessed ?? null,
    popia_basis: row.popia_basis ?? null,
    status: row.status ?? "new",
  };

  // Deterministic preview score, same weights as the runtime scorer.
  const fit = SECTOR_FIT[record.sector] ?? 0.4;
  const reachBase = record.contact_channel ? 1.0 : record.website ? 0.65 : 0.2;
  const reach = Math.min(reachBase + (record.verification === "V" ? 0.1 : 0), 1);
  const timing = BAND[record.est_spend_band] ?? 0.25;
  record.pre_score = Math.round(100 * (0.45 * fit + 0.3 * reach + 0.25 * timing));

  const { error } = await admin.from("foundation1_sales_book").upsert(record, { onConflict: "book_id" });
  if (error) {
    console.error(`${record.book_id}: ${error.message}`);
    continue;
  }
  inserted += 1;
  if (inserted % 100 === 0) process.stdout.write(`… ${inserted}\n`);
}
console.log(`Ingested ${inserted}/${rows.length} book rows into foundation1_sales_book.`);
