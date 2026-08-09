/**
 * Shared presentation vocabulary for the migration-case console (board +
 * case file). Pure constants and formatters only — no data access, no
 * business logic (that stays in lib/worklist and lib/submission-queue).
 */

/** Journey order — drives stage pills, sorting and the case-file sections. */
export const MIGRATION_CASE_STAGE_ORDER = [
  "bill_pack_required",
  "bill_pack_processing",
  "bill_pack_review",
  "proposal_ready",
  "proposal_not_recommended",
  "eoi_signed",
  "kyc_ready",
  "submitted_to_funder",
  "partner_proposal_ready",
  "partner_proposal_signed",
  "kyc_verified",
  "kyc_handed_off",
  "term_sheet_issued",
  "kyc_direct_submitted",
] as const;

export function migrationCaseStageIndex(stage: string): number {
  const index = (MIGRATION_CASE_STAGE_ORDER as readonly string[]).indexOf(stage);
  return index === -1 ? MIGRATION_CASE_STAGE_ORDER.length : index;
}

export function migrationCaseStageLabel(stage: string): string {
  if (stage === "bill_pack_required") return "Bills Required";
  if (stage === "bill_pack_processing") return "Bills Processing";
  if (stage === "bill_pack_review") return "Bills In Review";
  if (stage === "kyc_ready") return "Submission Ready";
  if (stage === "submitted_to_funder") return "Submitted To Funder";
  if (stage === "kyc_direct_submitted") return "KYC Direct (Legacy)";
  return stage.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function migrationCaseStageTone(stage: string): string {
  if (stage === "eoi_signed") return "border-emerald-300/25 bg-emerald-300/8 text-emerald-100";
  if (stage === "kyc_ready") return "border-lime-300/25 bg-lime-300/8 text-lime-100";
  if (stage === "submitted_to_funder") return "border-cyan-300/25 bg-cyan-300/8 text-cyan-100";
  if (stage === "partner_proposal_ready") return "border-sky-300/25 bg-sky-300/8 text-sky-100";
  if (stage === "partner_proposal_signed") return "border-violet-300/25 bg-violet-300/8 text-violet-100";
  if (stage === "kyc_verified") return "border-emerald-300/25 bg-emerald-300/8 text-emerald-100";
  if (stage === "kyc_handed_off") return "border-emerald-300/25 bg-emerald-300/8 text-emerald-100";
  if (stage === "term_sheet_issued") return "border-lime-300/35 bg-lime-300/12 text-lime-100";
  if (stage === "kyc_direct_submitted") return "border-emerald-300/25 bg-emerald-300/8 text-emerald-100";
  if (stage === "proposal_ready") return "border-lime-300/25 bg-lime-300/8 text-lime-100";
  if (stage === "proposal_not_recommended") return "border-orange-300/25 bg-orange-300/8 text-orange-100";
  if (stage === "bill_pack_review") return "border-amber-300/25 bg-amber-300/8 text-amber-100";
  return "border-white/12 bg-white/[0.04] text-white/62";
}

export function migrationCaseOwnerTone(owner: string): string {
  if (owner === "Foundation-1") return "border-lime-300/25 bg-lime-300/8 text-lime-100";
  if (owner === "Funder") return "border-cyan-300/25 bg-cyan-300/8 text-cyan-100";
  return "border-white/14 bg-white/[0.04] text-white/60";
}

export function migrationCaseMoney(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function migrationCaseDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(parsed);
}
