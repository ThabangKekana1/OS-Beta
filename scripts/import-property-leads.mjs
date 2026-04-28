#!/usr/bin/env node
/**
 * One-off importer: load Renprop commercial property listings into oneos_admin_leads.
 *
 * Usage:
 *   node scripts/import-property-leads.mjs "/Users/straylight/Desktop/Leads Scraper/renprop_commercial_to_let.csv"
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL from .env.local.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// --- env loader -------------------------------------------------------------
function loadEnvLocal() {
  const envPath = resolve(REPO_ROOT, ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// --- minimal RFC4180 CSV parser --------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvToObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.length > 1 && r.some((cell) => cell.trim().length > 0))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = (r[i] ?? "").trim();
      });
      return obj;
    });
}

// --- helpers ----------------------------------------------------------------
const NOW = new Date().toISOString();
const OWNER_ID = "agent-karman";
const INDUSTRY = "Property";

function pickPhone(row) {
  return (
    row.primary_agent_phone ||
    (row.agent_phone_numbers || "").split(";")[0].trim() ||
    ""
  );
}

function toNumber(value) {
  if (!value) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function buildLead(row) {
  const id = `lead-renprop-${row.listing_id}`;
  const company = row.title || `${row.suburb} listing`;
  const contactName = row.primary_agent_name || "Listing Agent";
  const email = "";
  const phone = pickPhone(row);
  const address = row.address || "";
  const city = row.suburb || row.area || "";
  const province = row.province || "";
  const monthlyRental = toNumber(row.gross_monthly_rental);

  const lead = {
    id,
    clientProfileId: `profile-renprop-${row.listing_id}`,
    company,
    businessRegistrationNumber: "",
    industry: INDUSTRY,
    contactName,
    monthlyElectricitySpendEstimateZar: 0,
    isBusinessRegistered: false,
    isClientRegistered: false,
    isBusinessOperational: false,
    hasSixMonthUtilityBill: false,
    physicalAddress: address,
    city,
    province,
    source: "Outbound",
    origin: "imported",
    partner: null,
    partnerOrgId: null,
    stage: "Client Registered",
    contactStatus: "Not Contacted",
    priority: "Standard",
    ownerId: OWNER_ID,
    linkedSalesLeadId: null,
    registrationSource: null,
    readinessScore: 0,
    estimatedValueZar: monthlyRental,
    lastTouched: NOW,
    nextAction: "Initial outreach",
    migrateAccountName: "Renprop Import",
    migrateAccountId: `renprop-${row.listing_id}`,
    userProfile: {
      id: `profile-renprop-${row.listing_id}`,
      fullName: contactName,
      email,
      phone,
      role: row.primary_agent_designation || "Property Practitioner",
      joinedAt: NOW,
    },
    eoiSigningToken: null,
    eoiSignedBy: null,
    eoiSignedAt: null,
    eoiAcceptedTermsAt: null,
    onboardingCompletedAt: null,
    disqualification: null,
    tasks: [],
    documents: [],
    notes: [
      {
        id: `note-${row.listing_id}-source`,
        body: `Imported from Renprop — ${row.property_type || "Commercial"} ${row.listing_type || "To Let"} • ${row.size_display || ""} • ${row.price_display || ""}\nURL: ${row.url || ""}`,
        author: "System",
        createdAt: NOW,
      },
    ],
    events: [
      {
        id: `evt-${row.listing_id}-imported`,
        title: "Lead imported",
        detail: `Renprop listing ${row.listing_id} (${row.suburb}, ${row.province})`,
        createdAt: NOW,
        tone: "system",
      },
    ],
  };

  return {
    id: lead.id,
    client_profile_id: lead.clientProfileId,
    company: lead.company,
    business_registration_number: lead.businessRegistrationNumber,
    contact_name: lead.contactName,
    contact_email: email,
    owner_id: lead.ownerId,
    stage: lead.stage,
    priority: lead.priority,
    readiness_score: lead.readinessScore,
    estimated_value_zar: Math.round(lead.estimatedValueZar),
    eoi_signing_token: null,
    eoi_signed_at: null,
    onboarding_completed_at: null,
    disqualified_at: null,
    payload: lead,
  };
}

// --- main -------------------------------------------------------------------
async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node scripts/import-property-leads.mjs <path-to-csv>");
    process.exit(1);
  }

  const text = readFileSync(csvPath, "utf8");
  const rows = csvToObjects(text);
  console.log(`Parsed ${rows.length} rows from ${csvPath}`);

  const inserts = rows
    .filter((row) => row.listing_id)
    .map(buildLead);

  console.log(`Built ${inserts.length} lead records. Upserting in batches…`);

  const BATCH = 100;
  let imported = 0;
  for (let i = 0; i < inserts.length; i += BATCH) {
    const slice = inserts.slice(i, i + BATCH);
    const { error } = await supabase
      .from("oneos_admin_leads")
      .upsert(slice, { onConflict: "id" });
    if (error) {
      console.error(`Batch ${i}-${i + slice.length} failed:`, error.message);
      process.exit(1);
    }
    imported += slice.length;
    console.log(`  ✓ ${imported}/${inserts.length}`);
  }

  console.log(`Done. Imported ${imported} property leads (industry=${INDUSTRY}, owner=${OWNER_ID}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
