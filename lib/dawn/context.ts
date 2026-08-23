/**
 * DAWN — case context assembly.
 *
 * Builds the factual, client-safe narrative Dawn reasons over. Only
 * client-visible state enters this string: the client's own declared numbers,
 * their stage, their documents, their recent movements in the workspace.
 * Partner identities and internal economics never appear here.
 */
import type { MigrationCaseRow } from "@/lib/migration-case-store";
import { stageNarrative } from "./prompt";

export type DawnMovement = {
  at: string;
  eventName: string;
  pageKey: string;
  detail?: Record<string, unknown>;
};

export type DawnStuckSignal = {
  stuck: boolean;
  reason: string | null;
};

/** Deterministic stuck heuristics over recent workspace movements. */
export function detectStuck(
  movements: DawnMovement[],
  pendingActionRequired: boolean,
): DawnStuckSignal {
  if (!pendingActionRequired || movements.length === 0) {
    return { stuck: false, reason: null };
  }
  const now = Date.now();
  const recent = movements.filter(
    (m) => now - new Date(m.at).getTime() < 45 * 60 * 1000,
  );
  const taskOpens = recent.filter(
    (m) => m.eventName === "page_view" && m.pageKey === "task",
  ).length;
  const actions = recent.filter((m) => m.eventName === "interaction").length;
  if (taskOpens >= 3 && actions === 0) {
    return {
      stuck: true,
      reason: "Opened the pending task repeatedly without starting it.",
    };
  }
  const idlePings = recent.filter(
    (m) => m.eventName === "engagement" && m.detail?.kind === "idle",
  ).length;
  if (idlePings >= 2 && actions === 0) {
    return { stuck: true, reason: "Idle on a step that needs their action." };
  }
  return { stuck: false, reason: null };
}

function fmtRand(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function fmtDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * The single context block injected under the system prompt each turn.
 * Compact by design: the model gets facts, not prose to imitate.
 */
export function buildCaseContext(input: {
  caseRow: MigrationCaseRow;
  movements: DawnMovement[];
  currentView?: string | null;
}): { context: string; stuck: DawnStuckSignal } {
  const { caseRow } = input;
  const narrative = stageNarrative({
    stage: caseRow.stage,
    profileCompleted: Boolean(caseRow.profile_completed_at),
    ndaSigned: Boolean(caseRow.nda_signed_at),
  });
  const stuck = detectStuck(input.movements, !narrative.waitingOnFoundation1);

  const lines: string[] = [];
  lines.push(`Business: ${caseRow.business_name}`);
  const firstName = (caseRow.contact_name || "").trim().split(/\s+/)[0] || null;
  if (firstName) lines.push(`Contact first name: ${firstName}`);
  if (caseRow.site_city || caseRow.province) {
    lines.push(`Site: ${[caseRow.site_city, caseRow.province].filter(Boolean).join(", ")}`);
  }
  const spend = fmtRand(caseRow.monthly_spend_ex_vat);
  if (spend) lines.push(`Declared monthly electricity spend (excl VAT): ${spend}`);
  lines.push(`Where the case stands: ${narrative.where}`);
  lines.push(`The next step: ${narrative.next}`);
  lines.push(
    narrative.waitingOnFoundation1
      ? "Ball is with: Foundation-1 (client can relax)."
      : "Ball is with: the client.",
  );
  const milestones: Array<[string, string | null]> = [
    ["Profile completed", fmtDate(caseRow.profile_completed_at)],
    ["NDA signed", fmtDate(caseRow.nda_signed_at)],
    ["Migration Report ready", fmtDate(caseRow.proposal_ready_at)],
    ["EOI signed", fmtDate(caseRow.eoi_signed_at)],
    ["Formal proposal arrived", fmtDate(caseRow.partner_proposal_ready_at)],
    ["Formal proposal signed", fmtDate(caseRow.partner_proposal_signed_at)],
    ["Documents verified", fmtDate(caseRow.kyc_verified_at)],
    ["Term sheet issued", fmtDate(caseRow.term_sheet_issued_at)],
  ];
  const done = milestones.filter(([, d]) => d).map(([k, d]) => `${k} ${d}`);
  if (done.length > 0) lines.push(`Milestones: ${done.join("; ")}`);
  if (input.currentView) lines.push(`The client is currently on the "${input.currentView}" tab.`);
  if (stuck.stuck) lines.push(`Possible stuck signal: ${stuck.reason}`);

  return { context: `CASE CONTEXT (facts, client-visible)\n${lines.join("\n")}`, stuck };
}
