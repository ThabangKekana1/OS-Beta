/**
 * DAWN — case context assembly.
 *
 * Builds the factual, client-safe narrative Dawn reasons over. Only
 * client-visible state enters this string: the client's own declared numbers,
 * their stage, their documents, their recent movements in the workspace.
 * Partner identities and internal economics never appear here.
 */
import type { MigrationCaseProposalRow, MigrationCaseRow } from "@/lib/migration-case-store";
import { deriveReportPackFigures } from "@/lib/report-pack-core";
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
  proposal?: MigrationCaseProposalRow | null;
  billPack?: Record<string, unknown> | null;
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

  // Bill audit evidence: what the uploaded bills actually produced.
  const pack = input.billPack ?? null;
  if (pack) {
    const portfolio = (pack.portfolio ?? {}) as Record<string, unknown>;
    const periods = Number(pack.recognised_period_count ?? portfolio.uniquePeriodCount ?? 0);
    const days = Number(pack.covered_days ?? portfolio.coveredDays ?? 0);
    const files = Number(pack.source_file_count ?? 0);
    if (files > 0 || periods > 0) {
      lines.push(
        `Bill evidence: ${files} file${files === 1 ? "" : "s"} uploaded, ${periods} billing period${periods === 1 ? "" : "s"} recognised, ${days} days covered, status ${String(pack.status ?? "unknown")}.`,
      );
    }
  }

  // The published Migration Report and the generated document pack: every
  // figure the client can see, so Dawn never guesses at her own documents.
  if (input.proposal) {
    const f = deriveReportPackFigures({ caseRow, proposal: input.proposal });
    const R = (v: number) => `R${Math.round(v).toLocaleString("en-ZA")}`;
    const pct = (v: number) => `${Math.round(v)} percent`;
    const wheelKeep = f.currentMonthly - f.wheelingMonthly;
    const wheelPct = f.currentMonthly > 0 ? (wheelKeep / f.currentMonthly) * 100 : 0;
    const onsiteKeep = f.currentMonthly - f.onsiteMonthly;
    const onsitePct = f.currentMonthly > 0 ? (onsiteKeep / f.currentMonthly) * 100 : 0;
    const wheeledKwh = Math.round(f.monthlyKwh * f.wheelingShare);

    lines.push("");
    lines.push("THE MIGRATION REPORT AND DOCUMENT PACK (published; the client downloads all four under Current step or Documents):");
    lines.push(
      `1. Migration Report: audited monthly bill ${R(f.currentMonthly)} excl VAT, from ${f.billingPeriods} billing periods over ${f.coveredDays} days; blended tariff found R${f.blendedTariff.toFixed(2)} per kWh; consumption about ${Math.round(f.monthlyKwh).toLocaleString("en-ZA")} kWh a month; complete blended solution ${R(f.solutionMonthly)} a month, keeping ${R(f.monthlySaving)} (about ${pct(f.yearOnePct)}) in year one; ten-year movement ${R(f.tenYearDifference)} against the Eskom path modelled at 13 percent a year.`,
    );
    lines.push(
      `2. Example bill, wheeled renewable energy: total ${R(f.wheelingMonthly)} a month excl VAT against the audited ${R(f.currentMonthly)}, so the client keeps ${R(wheelKeep)} a month (about ${pct(wheelPct)} off the bill). About ${pct(f.wheelingShare * 100)} of the ENERGY (${wheeledKwh.toLocaleString("en-ZA")} kWh) moves to the contracted rate of R${f.wheeledTariff.toFixed(2)} per kWh; the remainder stays with the distributor at the audited blended tariff. CRITICAL: the ${pct(f.wheelingShare * 100)} on that bill is the share of energy at the contracted rate, NOT a savings percentage; the bill saving is ${pct(wheelPct)}. If the client read it as savings, clear that up plainly. Offered as traditional or virtual wheeling, minimum 10-year power purchase agreement.`,
    );
    lines.push(
      `3. Example bill, solar and storage on site: total ${R(f.onsiteMonthly)} a month excl VAT, keeping ${R(onsiteKeep)} (about ${pct(onsitePct)}); fixed ${pct(f.onsiteEscalation * 100)} annual escalation in the agreement versus Eskom modelled at 13 percent; minimum 10-year power purchase agreement; the one amount includes Tier 1 solar panels (25-year warranty), commercial battery storage (10-year warranty), LED lighting and smart metering, solar water heating and borehole filtration, CCTV and generation registration, a 24/7 electrician and plumber, and full insurance, maintenance and operations.`,
    );
    lines.push(
      `4. The First Light Certificate (specimen): issued on migration day; models about ${Math.round(f.annualCo2Tonnes).toLocaleString("en-ZA")} tonnes of carbon avoided a year on about ${Math.round(f.annualKwh).toLocaleString("en-ZA")} kWh of renewable supply a year.`,
    );
    lines.push(
      "The example bills are indicative, modelled from the audited bills; formal proposals confirm final amounts. Quote these figures freely; they are the client's own documents.",
    );
  }

  return { context: `CASE CONTEXT (facts, client-visible)\n${lines.join("\n")}`, stuck };
}
