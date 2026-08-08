import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications";
import { sendCaseLifecycleMessage, type LifecycleMessageKey } from "@/lib/case-lifecycle";
import {
  dueKycPromises,
  evaluateKycGate,
  kycPlanFromStoredItems,
} from "@/lib/migration-case-kyc";
import type {
  MigrationCaseKycDocumentRow,
  MigrationCaseKycReadinessRow,
  MigrationCaseRow,
} from "@/lib/migration-case-store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily lifecycle tick.
 *
 * Walks every open case and sends whatever the case has earned but not yet
 * received. All sends are exactly-once by (case_id, message_key), so this route
 * is safe to run repeatedly, to re-run after a failure, and to invoke manually.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(value: string | null | undefined, now: number) {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.floor((now - then) / DAY_MS);
}

/** Escalating reminders while a case waits for its bill pack. */
function billPackReminder(age: number | null): LifecycleMessageKey | null {
  if (age === null) return null;
  if (age >= 14) return "reminder_bill_pack_d14";
  if (age >= 7) return "reminder_bill_pack_d7";
  if (age >= 3) return "reminder_bill_pack_d3";
  if (age >= 1) return "reminder_bill_pack_d1";
  return null;
}

/** Nudges while a completed proposal sits unopened. */
function eoiReminder(age: number | null): LifecycleMessageKey | null {
  if (age === null) return null;
  if (age >= 7) return "reminder_eoi_d7";
  if (age >= 3) return "reminder_eoi_d3";
  return null;
}

function decideMessage(row: MigrationCaseRow, now: number): LifecycleMessageKey | null {
  switch (row.stage) {
    case "bill_pack_required":
      return billPackReminder(daysSince(row.created_at, now));
    case "bill_pack_review": {
      const age = daysSince(row.updated_at, now);
      return age !== null && age >= 2 ? "reminder_review_d2" : null;
    }
    case "proposal_ready":
    case "proposal_not_recommended":
      return row.eoi_signed_at ? null : eoiReminder(daysSince(row.proposal_ready_at, now));
    default:
      return null;
  }
}

export async function GET(request: NextRequest) {
  const configured = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (configured && supplied !== configured) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Storage unavailable." }, { status: 503 });
  }

  const now = Date.now();
  const openStages = [
    "bill_pack_required",
    "bill_pack_review",
    "proposal_ready",
    "proposal_not_recommended",
  ];

  const { data, error } = await supabase
    .from("migration_cases")
    .select("*")
    .in("stage", openStages)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
  }

  const rows = (data ?? []) as MigrationCaseRow[];
  const outcome: Record<string, number> = {};
  let sent = 0;

  for (const row of rows) {
    const key = decideMessage(row, now);
    if (!key) continue;
    const result = await sendCaseLifecycleMessage(row, key);
    outcome[`${key}:${result}`] = (outcome[`${key}:${result}`] ?? 0) + 1;
    if (result === "sent") sent += 1;
  }

  // Operator-side view of the same problem: cases that have gone quiet.
  const stalled = rows.filter((row) => {
    const age = daysSince(row.updated_at, now);
    return age !== null && age >= 7;
  });
  if (stalled.length) {
    void createNotification({
      audience: "admin",
      kind: "system",
      title: `${stalled.length} migration case${stalled.length === 1 ? "" : "s"} have gone quiet`,
      body: stalled
        .slice(0, 8)
        .map((row) => `${row.public_reference} · ${row.business_name} · ${row.stage.replace(/_/g, " ")}`)
        .join("\n"),
      link: "/admin/migration-cases",
      metadata: { stalledCount: stalled.length },
    });
  }

  // Chase rail: promised KYC documents whose date has arrived without an
  // upload. Exactly-once per (case, item, promised date) via the lifecycle
  // message key; moving the date re-arms the reminder naturally. Degrades to
  // a no-op when the readiness table (or its plan rows) is absent.
  let kycChased = 0;
  try {
    const { data: readinessData } = await supabase
      .from("migration_case_kyc_readiness")
      .select("*")
      .neq("status", "confirmed")
      .limit(400);
    const readinessRows = (readinessData ?? []) as MigrationCaseKycReadinessRow[];
    if (readinessRows.length) {
      const caseIds = readinessRows.map((row) => row.case_id);
      const [{ data: caseData }, { data: documentData }] = await Promise.all([
        supabase.from("migration_cases").select("*").in("id", caseIds),
        supabase.from("migration_case_kyc_documents").select("*").in("case_id", caseIds),
      ]);
      const casesById = new Map(((caseData ?? []) as MigrationCaseRow[]).map((row) => [row.id, row]));
      const documentsByCase = new Map<string, MigrationCaseKycDocumentRow[]>();
      for (const row of (documentData ?? []) as MigrationCaseKycDocumentRow[]) {
        const list = documentsByCase.get(row.case_id) ?? [];
        list.push(row);
        documentsByCase.set(row.case_id, list);
      }
      const today = new Date(now).toISOString().slice(0, 10);
      for (const readiness of readinessRows) {
        const caseRow = casesById.get(readiness.case_id);
        if (!caseRow || caseRow.kyc_pack_complete_at || caseRow.kyc_handed_off_at) continue;
        const gate = evaluateKycGate(
          documentsByCase.get(readiness.case_id) ?? [],
          kycPlanFromStoredItems(readiness.items, readiness.fix_it_plan),
        );
        for (const item of dueKycPromises(gate, today)) {
          const result = await sendCaseLifecycleMessage(
            caseRow,
            "reminder_kyc_promised",
            {
              kycItemLabel: item.label,
              kycExpectedBy: item.expectedBy,
              kycFixIt: item.fixIt,
              kycReceivedCount: gate.receivedCount,
            },
            `${item.id}:${item.expectedBy}`,
          );
          outcome[`reminder_kyc_promised:${result}`] = (outcome[`reminder_kyc_promised:${result}`] ?? 0) + 1;
          if (result === "sent") {
            sent += 1;
            kycChased += 1;
          }
        }
      }
    }
  } catch {
    // The chase rail must never break the daily tick.
  }

  // Funder service levels that are close to breaching.
  const { data: dueRows } = await supabase
    .from("migration_cases")
    .select("id, public_reference, business_name, funder_sla_due_at")
    .eq("stage", "submitted_to_funder")
    .not("funder_sla_due_at", "is", null)
    .lte("funder_sla_due_at", new Date(now + 2 * DAY_MS).toISOString())
    .limit(50);

  if (dueRows?.length) {
    void createNotification({
      audience: "admin",
      kind: "system",
      title: `${dueRows.length} funder response${dueRows.length === 1 ? "" : "s"} due within 48 hours`,
      body: dueRows
        .map((row) => `${row.public_reference} · ${row.business_name}`)
        .join("\n"),
      link: "/admin/migration-cases",
      metadata: { slaDueCount: dueRows.length },
    });
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    sent,
    stalled: stalled.length,
    slaDue: dueRows?.length ?? 0,
    kycChased,
    outcome,
  });
}
