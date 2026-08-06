/**
 * Development-only stand-in for the document-reading step of the bill pack.
 *
 * Reading an arbitrary client utility statement (scanned, rotated, municipal,
 * every layout in the country) is the one part of the pipeline that will be
 * handled by a document model. Until that exists, this module lets the whole
 * journey be exercised locally: whatever file the client uploads, the extractor
 * returns a real parsed Eskom statement from the verified Ratang fixtures,
 * rescaled to the spend the client declared on the report.
 *
 * Everything downstream — currentisation, aggregation, design basis, proposal,
 * EOI — runs for real against that output.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  analyseUtilityBillText,
  type BillChargeLine,
  type UtilityBillDocumentAnalysis,
} from "@/lib/utility-bill-analysis";

const FIXTURE_MONTHS = ["October", "November", "December", "January", "February", "March"] as const;

const SIMULATION_NOTE =
  "SIMULATED EXTRACTION (development only): this reading was produced from a verified Eskom statement fixture, not from the uploaded file.";

function fixturePath(month: string) {
  return join(
    process.cwd(),
    "..",
    "_extract",
    "text",
    `1._Onboarding_6._Ratang_Liquor_Null_Retang_Liquor_Folder_Documents_Eskom_${month}_Invoice.pdf.txt`,
  );
}

let fixtureCache: UtilityBillDocumentAnalysis[] | null = null;

function fixtures(): UtilityBillDocumentAnalysis[] {
  if (fixtureCache) return fixtureCache;
  fixtureCache = FIXTURE_MONTHS.map((month) => {
    const text = readFileSync(fixturePath(month), "utf8");
    return analyseUtilityBillText(text, { fileName: `${month.toLowerCase()}-statement.pdf` });
  });
  return fixtureCache;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function scaleValue(value: number | null, factor: number, decimals = 2) {
  return value === null ? null : round(value * factor, decimals);
}

function scaleChargeLine(line: BillChargeLine, factor: number): BillChargeLine {
  return {
    ...line,
    amountExVat: round(line.amountExVat * factor),
    quantity: scaleValue(line.quantity, factor, 4),
  };
}

export function isSimulatedBillExtractionEnabled() {
  return (
    process.env.NODE_ENV !== "production"
    && process.env.SIMULATE_BILL_EXTRACTION === "1"
  );
}

/**
 * Phase 1: utility bills are received and held for an operator, who produces the
 * assessment off-platform and publishes it. No engine proposal is built.
 */
export function isOperatorAssessmentMode() {
  return process.env.OPERATOR_ASSESSMENT_MODE === "1";
}

/**
 * @param sequence position of this file inside the pack; selects the period.
 * @param targetMonthlySpendExVat the spend the client declared, used to rescale
 *        the fixture so the proposal reflects their site rather than Ratang's.
 */
export function simulateUtilityBillAnalysis(options: {
  fileName: string;
  sourceHash: string;
  sequence: number;
  targetMonthlySpendExVat?: number | null;
  analysedAt?: string;
}): UtilityBillDocumentAnalysis {
  const periods = fixtures();
  const fixture = periods[((options.sequence % periods.length) + periods.length) % periods.length];

  const fixtureMonthlyAverage =
    periods.reduce((sum, period) => sum + (period.totalChargesExVat ?? 0), 0) / periods.length;
  const target = options.targetMonthlySpendExVat ?? null;
  const rawFactor = target && fixtureMonthlyAverage > 0 ? target / fixtureMonthlyAverage : 1;
  const factor = Math.min(40, Math.max(0.2, rawFactor));

  const summary = fixture.chargeSummary;
  return {
    ...fixture,
    sourceHash: options.sourceHash,
    sourceFileName: options.fileName,
    analysedAt: options.analysedAt ?? new Date().toISOString(),
    monthlyKwh: scaleValue(fixture.monthlyKwh, factor),
    touKwh: {
      peak: scaleValue(fixture.touKwh.peak, factor),
      standard: scaleValue(fixture.touKwh.standard, factor),
      "off-peak": scaleValue(fixture.touKwh["off-peak"], factor),
    },
    demandKwKva: scaleValue(fixture.demandKwKva, factor),
    notifiedMaxDemandKva: scaleValue(fixture.notifiedMaxDemandKva, factor),
    utilisedCapacityKva: scaleValue(fixture.utilisedCapacityKva, factor),
    totalChargesExVat: scaleValue(fixture.totalChargesExVat, factor),
    vatAmount: scaleValue(fixture.vatAmount, factor),
    totalChargesInclVat: scaleValue(fixture.totalChargesInclVat, factor),
    totalAmountDue: scaleValue(fixture.totalAmountDue, factor),
    arrearsAmount: scaleValue(fixture.arrearsAmount, factor),
    chargeLines: fixture.chargeLines.map((line) => scaleChargeLine(line, factor)),
    chargeSummary: {
      addressableExVat: round(summary.addressableExVat * factor),
      residualExVat: round(summary.residualExVat * factor),
      conditionalExVat: round(summary.conditionalExVat * factor),
      excludedExVat: round(summary.excludedExVat * factor),
      unknownExVat: round(summary.unknownExVat * factor),
      energyExVat: round(summary.energyExVat * factor),
      fixedAndCapacityExVat: round(summary.fixedAndCapacityExVat * factor),
      demandAndReactiveExVat: round(summary.demandAndReactiveExVat * factor),
    },
    reconciliationDifference: scaleValue(fixture.reconciliationDifference, factor),
    warnings: [SIMULATION_NOTE, ...fixture.warnings],
  };
}
