/**
 * FOUNDATION-1 FUNDER-REPORT PIPELINE — orchestrator.
 *
 * When the returned funder proposals (Nedbank/Eqstra UFMS P4L deck and/or
 * Green Share wheeling deck) are uploaded into a client's case, this module
 * produces ONE report that explains BOTH proposals — individually and
 * combined — against the client's bill-audited Eskom baseline:
 *
 *   1. READ    — document-reader proposal head on each funder PDF
 *                (`lib/document-reader/proposal-head.ts`; consumed, not
 *                re-implemented). Wheeling decks get a small field reader
 *                here because the proposal head routes that dialect to a
 *                human by design.
 *   2. VERIFY  — extractions cross-checked against predictFunderQuote /
 *                predictWheelingQuote from `lib/pricing-engine.ts` using the
 *                case's verified bill facts. Any low-confidence field or a
 *                cross-check deviation above 2% puts the report on HOLD for
 *                operator confirmation (admin API shows the extracted
 *                fields and accepts corrections).
 *   3. MAP     — verified fields + bill facts -> ClientSavingsData (the deck
 *                schema in `presentations/src/decks/templates/migration-path.tsx`)
 *                and a jsPDF report artifact (`lib/funder-report-pdf.ts`).
 *                Founder rule: the client-facing numbers match the funder
 *                paper; the engine fills only what their paper omits.
 *   4. DELIVER — published through the existing publishOperatorProposal()
 *                seam so the client dashboard needs zero new UI; the
 *                ClientSavingsData JSON is written to the case bucket so the
 *                full R3F deck can be generated offline by `presentations/`.
 *
 * CONFIDENTIALITY (house rule, AGENTS.md): only bill-derived and
 * funder-stated figures appear in ClientSavingsData and the PDF. The
 * cross-check reasoning (clone-engine deviations, anchors, rate factors) is
 * INTERNAL and lives only in the FunderReport object for the operator desk.
 */
import {
  parseFunderProposalText,
  verifyProposalExtraction,
  type FunderProposalExtraction,
  type VerificationResult,
} from "@/lib/document-reader";
import {
  predictFunderQuote,
  predictWheelingQuote,
  predictCombined,
  tenYearSeries,
  type TariffStructure,
  type WheelingDistributor,
} from "@/lib/pricing-engine";
import type {
  BillChargeLine,
  BillPortfolio,
  TouBucket,
  UtilityBillDocumentAnalysis,
} from "@/lib/utility-bill-analysis";

export const FUNDER_REPORT_VERSION = "funder-report-2026-08-09.1";

/** Cross-check deviation above this puts the report on HOLD for an operator. */
export const FUNDER_REPORT_TOLERANCE_PCT = 2;

/* ------------------------------------------------------------------ */
/* ClientSavingsData — the deck schema.                                */
/* Mirror of `presentations/src/decks/templates/migration-path.tsx`.   */
/* Keep field-compatible: the JSON written by this module is consumed  */
/* verbatim by `makeMigrationDeck()` in the presentations kit.         */
/* ------------------------------------------------------------------ */

export type TouPeriodData = { kwh: number; spend: number; rate: number };
export type ChargeLineData = { label: string; amount: number };

export type ClientSavingsData = {
  id: string;
  clientName: string;
  clientShortName: string;
  siteLocation: string;
  billsCount: number;
  title?: string;
  footerLabel?: string;
  tou: { peak: TouPeriodData; standard: TouPeriodData; offpeak: TouPeriodData };
  meterCharges: ChargeLineData[];
  connectionCharges: ChargeLineData[];
  ufms: { monthlyCharge: number; escalationPct: number; termYears: number };
  wheeling: { ratePerKwh: number; escalationPct: number; termYears: number };
  system: {
    solarKwp: number;
    inverterKw: number;
    batteryKwh: number;
    monthlyGenerationKwh: number;
    warrantyYears: number;
  };
  tenYear: {
    eskom: number[];
    wheeling: number[];
    ufms: number[];
    combined: number[];
    chartMaxRands: number;
  };
  narrative: {
    sizingHeadline: [string, string];
    sizingLead: string;
    nightUseCopy: string;
  };
  contact: { name: string; email: string; phone: string };
};

/* ------------------------------------------------------------------ */
/* Bill facts — everything the report needs from the verified bill     */
/* audit, in one flat object.                                          */
/* ------------------------------------------------------------------ */

export type FunderReportBillFacts = {
  billsCount: number;
  /** 6-12 bill average monthly consumption, kWh. */
  monthlyKwh: number;
  /** 6-12 bill average monthly spend, R excl VAT. */
  monthlySpendExVat: number;
  /** Sum of the bill's commodity-energy lines (monthly average), R. */
  energyMonthlySpend: number;
  tariffStructure: TariffStructure;
  distributor: WheelingDistributor;
  provider: string;
  tariffNames: string[];
  tou: { peak: TouPeriodData; standard: TouPeriodData; offpeak: TouPeriodData };
  /** Per-unit meter charges (network demand, legacy, ancillary, demand/reactive). UFMS removes these. */
  meterCharges: ChargeLineData[];
  /** Connection/fixed charges (capacity, service, admin). Nobody removes these. */
  connectionCharges: ChargeLineData[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const round0 = (value: number) => Math.round(value);

/** Friendly waterfall label for a bill charge line. */
function chargeLabel(line: BillChargeLine): string {
  const d = line.description.toLowerCase();
  if (d.includes("network demand")) return "Network demand";
  if (d.includes("legacy")) return "Legacy";
  if (d.includes("ancillary")) return "Ancillary";
  if (d.includes("reactive")) return "Reactive energy";
  if (d.includes("network capacity")) return "Network capacity";
  if (d.includes("generat")) return "Generator capacity";
  if (d.includes("service and administration")) return "Service and administration";
  if (d.includes("administration")) return "Administration";
  if (d.includes("service charge")) return "Service";
  if (line.category === "demand") return "Demand";
  return line.description.replace(/\s+@.*$/, "").slice(0, 40).trim() || line.category;
}

const METER_CATEGORIES = new Set([
  "network-volumetric",
  "ancillary-volumetric",
  "levy-volumetric",
  "demand",
  "reactive",
]);
const CONNECTION_CATEGORIES = new Set(["fixed-capacity", "fixed-service"]);

/**
 * Derive the report's bill facts from the case's bill portfolio: TOU rows
 * from the energy charge lines, meter/connection groups from the bill
 * waterfall, everything averaged across the analysed periods.
 */
export function deriveBillFactsFromPortfolio(portfolio: BillPortfolio): FunderReportBillFacts {
  const periods = (portfolio.periods ?? []).filter(
    (p): p is UtilityBillDocumentAnalysis => Boolean(p) && p.status === "analysed",
  );
  if (periods.length === 0) {
    throw new Error("The bill portfolio has no analysed periods; a funder report needs the verified bill audit.");
  }
  const count = periods.length;

  const touKwh: Record<TouBucket, number> = { peak: 0, standard: 0, "off-peak": 0 };
  const touSpend: Record<TouBucket, number> = { peak: 0, standard: 0, "off-peak": 0 };
  let energySpend = 0;
  const meterTotals = new Map<string, number>();
  const connectionTotals = new Map<string, number>();

  for (const period of periods) {
    for (const bucket of ["peak", "standard", "off-peak"] as const) {
      touKwh[bucket] += period.touKwh?.[bucket] ?? 0;
    }
    for (const line of period.chargeLines) {
      if (line.category === "energy") {
        energySpend += line.amountExVat;
        const bucket: TouBucket = line.touBucket ?? "standard";
        touSpend[bucket] += line.amountExVat;
        if (!line.touBucket) touKwh.standard += line.quantity ?? 0;
      } else if (METER_CATEGORIES.has(line.category)) {
        const label = chargeLabel(line);
        meterTotals.set(label, (meterTotals.get(label) ?? 0) + line.amountExVat);
      } else if (CONNECTION_CATEGORIES.has(line.category)) {
        const label = chargeLabel(line);
        connectionTotals.set(label, (connectionTotals.get(label) ?? 0) + line.amountExVat);
      }
    }
  }

  const avg = (value: number) => round0(value / count);
  const touRow = (bucket: TouBucket): TouPeriodData => {
    const kwh = touKwh[bucket] / count;
    const spend = touSpend[bucket] / count;
    return {
      kwh: round0(kwh),
      spend: round0(spend),
      rate: kwh > 0 ? round2(spend / kwh) : 0,
    };
  };
  const lines = (totals: Map<string, number>): ChargeLineData[] =>
    [...totals.entries()]
      .map(([label, total]) => ({ label, amount: avg(total) }))
      .filter((line) => line.amount !== 0)
      .sort((a, b) => b.amount - a.amount);

  const touStructure = touKwh.peak > 0 || touKwh["off-peak"] > 0 ? "time-of-use" : "flat";
  const provider = portfolio.provider ?? "Eskom";
  const distributor: WheelingDistributor = /eskom/i.test(String(provider))
    ? "eskom-direct"
    : /city power/i.test(String(provider))
      ? "city-power"
      : "other-municipal";

  return {
    billsCount: portfolio.uniquePeriodCount || count,
    monthlyKwh: portfolio.averageMonthlyKwh ?? 0,
    monthlySpendExVat: portfolio.averageMonthlySpendExVat ?? 0,
    energyMonthlySpend: round0(energySpend / count),
    tariffStructure: touStructure,
    distributor,
    provider: String(provider),
    tariffNames: portfolio.tariffNames ?? [],
    tou: { peak: touRow("peak"), standard: touRow("standard"), offpeak: touRow("off-peak") },
    meterCharges: lines(meterTotals),
    connectionCharges: lines(connectionTotals),
  };
}

/* ------------------------------------------------------------------ */
/* Wheeling deck fields — small reader for the Green Share dialect.    */
/* The document-reader proposal head deliberately routes wheeling to a */
/* human; this reader recovers the four commercial fields the report   */
/* needs and the cross-checks below dispose of them deterministically. */
/* ------------------------------------------------------------------ */

export type WheelingProposalFields = {
  dialect: "greenshare-wheeling";
  /** Firmed (PV+BESS) rate, R/kWh — the deliverable tariff. */
  firmRatePerKwh: number | null;
  /** PV-only floor rate, R/kWh, when the deck states one. */
  floorRatePerKwh: number | null;
  escalationCapPct: number | null;
  termYears: number | null;
  supplier: string | null;
  evidence: string[];
};

export function parseWheelingProposalText(rawText: string): WheelingProposalFields {
  const text = rawText.replace(/\u00a0/g, " ");
  const evidence: string[] = [];

  const rates: number[] = [];
  for (const match of text.matchAll(/R\s*([\d]+(?:\.\d+)?)\s*\/\s*kWh/gi)) {
    const value = Number.parseFloat(match[1]);
    const tail = text.slice(match.index ?? 0, (match.index ?? 0) + match[0].length + 40);
    // Exclude the deck's own Eskom comparators ("versus R2.38/kWh blended").
    if (/blended|eskom/i.test(tail)) continue;
    if (Number.isFinite(value) && value > 0.2 && value < 3.5) {
      rates.push(value);
      evidence.push(match[0].trim());
    }
  }
  const firmRatePerKwh = rates.length > 0 ? Math.max(...rates) : null;
  const floorRatePerKwh = rates.length > 1 ? Math.min(...rates) : null;

  const escalation = text.match(/(?:max(?:imum)?\s*)?([\d.]+)\s*%\s*CPI/i)
    ?? text.match(/annual escalation cap[\s\S]{0,60}?([\d.]+)\s*%/i);
  if (escalation) evidence.push(escalation[0].replace(/\s+/g, " ").trim().slice(0, 80));

  const term = text.match(/minimum term[\s\S]{0,40}?(\d+)\s*years/i)
    ?? text.match(/price certainty for\s*(\d+)\s*years/i)
    ?? text.match(/(\d+)[- ]year (?:PPA|term|power purchase)/i);
  if (term) evidence.push(term[0].replace(/\s+/g, " ").trim().slice(0, 80));

  const supplier = /greenshare/i.test(text) ? "Green Share" : null;

  return {
    dialect: "greenshare-wheeling",
    firmRatePerKwh,
    floorRatePerKwh,
    escalationCapPct: escalation ? Number.parseFloat(escalation[1]) : null,
    termYears: term ? Number.parseInt(term[1], 10) : null,
    supplier,
    evidence,
  };
}

/* ------------------------------------------------------------------ */
/* Cross-checks + report assembly.                                     */
/* ------------------------------------------------------------------ */

export type FunderReportCrosscheckRow = {
  /** Which paper the stated figure came from. */
  source: "ufms" | "wheeling";
  field: string;
  stated: number | null;
  predicted: number | null;
  deviationPct: number | null;
  tolerancePct: number;
  pass: boolean | null;
  note: string;
};

export type FunderReportCorrections = {
  ufmsMonthlyCharge?: number;
  ufmsEscalationPct?: number;
  ufmsTermYears?: number;
  pvKwp?: number;
  bessKwh?: number;
  monthlyGenerationKwh?: number;
  wheelingRatePerKwh?: number;
  wheelingEscalationPct?: number;
  wheelingTermYears?: number;
};

export type FunderReportOption = {
  present: boolean;
  sourceFileName: string | null;
  /** Monthly cost of the whole path (option charge + whatever survives on the Eskom bill). */
  monthlyCost: number | null;
  monthlySaving: number | null;
};

export type FunderReport = {
  version: string;
  caseReference: string;
  businessName: string;
  generatedAt: string;
  status: "ready" | "hold_for_operator";
  holdReasons: string[];
  operatorConfirmed: boolean;
  billFacts: FunderReportBillFacts;
  /** INTERNAL — raw extraction + clone-engine cross-checks. Operator desk only. */
  ufmsExtraction: FunderProposalExtraction | null;
  ufmsVerification: VerificationResult | null;
  wheelingFields: WheelingProposalFields | null;
  crosschecks: FunderReportCrosscheckRow[];
  corrections: FunderReportCorrections | null;
  options: {
    eskomMonthly: number;
    ufms: FunderReportOption;
    wheeling: FunderReportOption;
    combined: FunderReportOption;
  };
  /** Funder-stated claims echoed for the report (never recomputed silently). */
  funderClaims: {
    ufmsTenYearSavingClaim: number | null;
    ufmsTenYearUtilityForecast: number | null;
    ufmsCurrentAnnualCost: number | null;
  };
  /** The deck-schema JSON delivered to the case record. */
  clientSavingsData: ClientSavingsData;
};

export type FunderReportInput = {
  caseReference: string;
  businessName: string;
  siteLocation?: string | null;
  billFacts: FunderReportBillFacts;
  /** Text layer + filename of the uploaded Nedbank/Eqstra UFMS deck. */
  ufms?: { text: string; fileName: string } | null;
  /** Text layer + filename of the uploaded Green Share wheeling deck. */
  wheeling?: { text: string; fileName: string } | null;
  corrections?: FunderReportCorrections | null;
  /** True when an operator reviewed the extractions and confirmed publish. */
  operatorConfirmed?: boolean;
  generatedAt?: string;
  contact?: { name: string; email: string; phone: string };
};

const DEFAULT_CONTACT = {
  name: "Karman Kekana",
  email: "karman@foundation-1.co.za",
  phone: "+27 69 811 7112",
} as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(pty\)|ltd|\(null\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "client";
}

function deviation(stated: number, predicted: number): number {
  if (predicted === 0) return Number.POSITIVE_INFINITY;
  return Math.abs(stated / predicted - 1) * 100;
}

function isLowConfidence(field: { value: unknown; confidence: string } | null | undefined): boolean {
  return !field || field.value === null || field.confidence === "low";
}

/**
 * Build the funder report from the uploaded proposal text layers and the
 * case's verified bill facts. Pure — no storage, no network; the pipeline
 * wrapper below adds the side effects.
 */
export function buildFunderReport(input: FunderReportInput): FunderReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const facts = input.billFacts;
  const corrections = input.corrections ?? null;
  const holdReasons: string[] = [];
  const crosschecks: FunderReportCrosscheckRow[] = [];

  if (!input.ufms && !input.wheeling) {
    throw new Error("A funder report needs at least one uploaded funder proposal (UFMS or wheeling).");
  }
  if (!(facts.monthlyKwh > 0) || !(facts.monthlySpendExVat > 0)) {
    holdReasons.push("Bill facts are incomplete (monthly kWh or spend missing); the bill audit must be verified first.");
  }

  /* ---- 1. READ: document-reader proposal head on each funder PDF. ---- */
  let ufmsExtraction: FunderProposalExtraction | null = null;
  let ufmsVerification: VerificationResult | null = null;
  if (input.ufms) {
    ufmsExtraction = parseFunderProposalText(input.ufms.text);
    ufmsVerification = verifyProposalExtraction(ufmsExtraction);
    if (ufmsExtraction.dialect !== "ufms-p4l") {
      holdReasons.push(
        `The document uploaded as the UFMS proposal reads as dialect "${ufmsExtraction.dialect}" — operator must confirm.`,
      );
    }
    if (ufmsVerification.status !== "verified") {
      holdReasons.push(
        `Document reader could not verify the UFMS deck (${ufmsVerification.status}): ${ufmsVerification.notes[0] ?? ""}`,
      );
    }
    for (const field of [
      ["monthly charge", ufmsExtraction.monthlyChargeExVat],
      ["system size (kWp)", ufmsExtraction.pvKwp],
      ["contract escalation", ufmsExtraction.contractEscalationPct],
      ["contract term", ufmsExtraction.termYears],
    ] as const) {
      if (isLowConfidence(field[1])) {
        holdReasons.push(`UFMS field "${field[0]}" was not read with confidence from the deck.`);
      }
    }
  }

  let wheelingFields: WheelingProposalFields | null = null;
  if (input.wheeling) {
    wheelingFields = parseWheelingProposalText(input.wheeling.text);
    if (wheelingFields.firmRatePerKwh === null) {
      holdReasons.push("Wheeling rate could not be read from the wheeling proposal.");
    }
  }

  /* ---- Effective (corrected) funder terms. Founder rule: THEIR paper first. ---- */
  const statedUfmsMonthly = corrections?.ufmsMonthlyCharge
    ?? ufmsExtraction?.monthlyChargeExVat.value
    ?? null;
  const ufmsEscalationPct = corrections?.ufmsEscalationPct
    ?? ufmsExtraction?.contractEscalationPct.value
    ?? 6;
  const ufmsTermYears = corrections?.ufmsTermYears
    ?? ufmsExtraction?.termYears.value
    ?? 10;
  const statedPvKwp = corrections?.pvKwp ?? ufmsExtraction?.pvKwp.value ?? null;
  const statedBessKwh = corrections?.bessKwh ?? ufmsExtraction?.bessKwh.value ?? null;
  const statedGenerationKwhPerMonth = corrections?.monthlyGenerationKwh
    ?? ufmsExtraction?.generationKwhPerMonth.value
    ?? null;

  /* ---- 2. VERIFY: engine predictions from the case's verified bill facts. ---- */
  const engineQuote = facts.monthlyKwh > 0
    ? predictFunderQuote({ monthlyKwh: facts.monthlyKwh, tariffStructure: facts.tariffStructure })
    : null;
  const engineWheeling = facts.monthlySpendExVat > 0
    ? predictWheelingQuote({
        monthlySpend: facts.monthlySpendExVat,
        monthlyKwh: facts.monthlyKwh,
        energyMonthlySpend: facts.energyMonthlySpend,
        distributor: facts.distributor,
      })
    : null;

  if (input.ufms && statedUfmsMonthly !== null && engineQuote) {
    const dev = deviation(statedUfmsMonthly, engineQuote.ufmsMonthly);
    const pass = dev <= FUNDER_REPORT_TOLERANCE_PCT;
    crosschecks.push({
      source: "ufms",
      field: "monthlyCharge",
      stated: statedUfmsMonthly,
      predicted: engineQuote.ufmsMonthly,
      deviationPct: round2(dev),
      tolerancePct: FUNDER_REPORT_TOLERANCE_PCT,
      pass,
      note: "Stated UFMS monthly charge vs the quote predicted from the bill-audited load.",
    });
    if (!pass) {
      holdReasons.push(
        `UFMS monthly charge R${round0(statedUfmsMonthly).toLocaleString("en-ZA")} deviates ${dev.toFixed(1)}% from the predicted funder quote for this load — operator must confirm the paper matches this case.`,
      );
    }
  }
  if (input.ufms && statedPvKwp !== null && engineQuote) {
    const dev = deviation(statedPvKwp, engineQuote.pvKwp);
    const pass = dev <= FUNDER_REPORT_TOLERANCE_PCT;
    crosschecks.push({
      source: "ufms",
      field: "pvKwp",
      stated: statedPvKwp,
      predicted: engineQuote.pvKwp,
      deviationPct: round2(dev),
      tolerancePct: FUNDER_REPORT_TOLERANCE_PCT,
      pass,
      note: "Stated system size vs the size predicted from the bill-audited consumption.",
    });
    if (!pass) {
      holdReasons.push(
        `Stated system size ${statedPvKwp} kWp does not match the ${engineQuote.pvKwp} kWp predicted for this load — the deck may belong to a different site.`,
      );
    }
  }

  const effectiveWheelingRate = corrections?.wheelingRatePerKwh
    ?? wheelingFields?.firmRatePerKwh
    ?? engineWheeling?.firmRate
    ?? null;
  const wheelingEscalationPct = corrections?.wheelingEscalationPct
    ?? wheelingFields?.escalationCapPct
    ?? (engineWheeling ? engineWheeling.escalation * 100 : 6);
  const wheelingTermYears = corrections?.wheelingTermYears
    ?? wheelingFields?.termYears
    ?? engineWheeling?.termYears
    ?? 10;

  if (input.wheeling && effectiveWheelingRate !== null && engineWheeling) {
    const [bandFloor, bandCeil] = engineWheeling.rateBand;
    const tol = FUNDER_REPORT_TOLERANCE_PCT / 100;
    const inBand = effectiveWheelingRate >= bandFloor * (1 - tol)
      && effectiveWheelingRate <= bandCeil * (1 + tol);
    crosschecks.push({
      source: "wheeling",
      field: "ratePerKwh",
      stated: effectiveWheelingRate,
      predicted: engineWheeling.firmRate,
      deviationPct: round2(deviation(effectiveWheelingRate, engineWheeling.firmRate)),
      tolerancePct: FUNDER_REPORT_TOLERANCE_PCT,
      pass: inBand,
      note: `Stated wheeling rate vs the predicted band R${bandFloor}-R${bandCeil}/kWh (firm reference R${engineWheeling.firmRate}).`,
    });
    if (!inBand) {
      holdReasons.push(
        `Wheeling rate R${effectiveWheelingRate}/kWh sits outside the predicted rate band R${bandFloor}-R${bandCeil}/kWh — operator must confirm.`,
      );
    }
  }
  if (input.wheeling && engineWheeling && !engineWheeling.eligible) {
    holdReasons.push(
      `Wheeling eligibility: ${engineWheeling.eligibilityNote}`,
    );
  }

  /* ---- 3. MAP: savings against the Eskom baseline + the deck schema. ---- */
  const eskomMonthly = round0(facts.monthlySpendExVat);
  const connectionTotal = facts.connectionCharges.reduce((total, line) => total + line.amount, 0);

  // Residual grid share the engine fills in (their paper omits it): the
  // combined model's waterfall keeps the connection charges + residual energy.
  const combinedPrediction = facts.monthlyKwh > 0 && facts.monthlySpendExVat > 0
    ? predictCombined({
        monthlySpend: facts.monthlySpendExVat,
        monthlyKwh: facts.monthlyKwh,
        tariffStructure: facts.tariffStructure,
        energyMonthlySpend: facts.energyMonthlySpend,
        distributor: facts.distributor,
      })
    : null;

  // UFMS path: THEIR monthly charge + the connection charges the client keeps.
  const ufmsMonthlyCost = input.ufms && statedUfmsMonthly !== null
    ? round0(statedUfmsMonthly + connectionTotal)
    : null;
  // Wheeling path: energy repriced at THEIR rate; everything else survives.
  const wheelingMonthlyCost = input.wheeling && effectiveWheelingRate !== null
    ? round0(facts.monthlySpendExVat - facts.energyMonthlySpend + facts.monthlyKwh * effectiveWheelingRate)
    : null;
  // Combined path: THEIR UFMS charge serves the onsite share; wheeling
  // reprices ONLY the residual eligible energy (never the same kWh twice).
  const combinedMonthlyCost = input.ufms && input.wheeling
    && statedUfmsMonthly !== null && combinedPrediction
    ? round0(
        statedUfmsMonthly
        + (effectiveWheelingRate !== null && combinedPrediction.wheeling.eligible
          ? combinedPrediction.wheeledResidualKwh * effectiveWheelingRate
          : combinedPrediction.wheeledResidualCost)
        + combinedPrediction.eskomResidualCost
        + combinedPrediction.retainedNonEnergyMonthly,
      )
    : null;

  const option = (monthlyCost: number | null, fileName: string | null): FunderReportOption => ({
    present: monthlyCost !== null,
    sourceFileName: fileName,
    monthlyCost,
    monthlySaving: monthlyCost === null ? null : round0(eskomMonthly - monthlyCost),
  });

  // Ten-year series anchored to THEIR quoted numbers; the engine fills the
  // escalation decomposition their papers omit.
  const series = facts.monthlyKwh > 0 && facts.monthlySpendExVat > 0
    ? tenYearSeries({
        monthlySpend: facts.monthlySpendExVat,
        monthlyKwh: facts.monthlyKwh,
        tariffStructure: facts.tariffStructure,
        energyMonthlySpend: facts.energyMonthlySpend,
        distributor: facts.distributor,
        ufmsMonthly: statedUfmsMonthly ?? undefined,
        wheelingRate: effectiveWheelingRate ?? undefined,
        ufmsEscalation: ufmsEscalationPct / 100,
        wheelingEscalation: wheelingEscalationPct / 100,
      })
    : null;
  if (!series) {
    holdReasons.push("Ten-year series unavailable without verified bill facts.");
  }

  const chartMax = series
    ? Math.ceil(series.eskom[series.eskom.length - 1] / 1_000_000) * 1_000_000
    : 0;

  const shortName = input.businessName.replace(/\s*\((Pty|Null)\)\s*(Ltd)?\.?/gi, "").trim()
    || input.businessName;

  const clientSavingsData: ClientSavingsData = {
    id: `${slugify(shortName)}-migration-path`,
    clientName: input.businessName,
    clientShortName: shortName,
    siteLocation: input.siteLocation ?? "",
    billsCount: facts.billsCount,
    tou: facts.tou,
    meterCharges: facts.meterCharges,
    connectionCharges: facts.connectionCharges,
    ufms: {
      monthlyCharge: statedUfmsMonthly !== null ? round0(statedUfmsMonthly) : 0,
      escalationPct: ufmsEscalationPct,
      termYears: ufmsTermYears,
    },
    wheeling: {
      ratePerKwh: effectiveWheelingRate ?? 0,
      escalationPct: wheelingEscalationPct,
      termYears: wheelingTermYears,
    },
    system: {
      solarKwp: statedPvKwp ?? 0,
      inverterKw: statedPvKwp ?? 0,
      batteryKwh: statedBessKwh ?? 0,
      monthlyGenerationKwh: statedGenerationKwhPerMonth ?? 0,
      warrantyYears: ufmsTermYears,
    },
    tenYear: {
      eskom: series?.eskom ?? [],
      wheeling: series?.wheeling ?? [],
      ufms: series?.ufms ?? [],
      combined: series?.combined ?? [],
      chartMaxRands: chartMax,
    },
    narrative: {
      sizingHeadline: ["A system sized for", "the load your bills prove."],
      sizingLead: "Your metered consumption sets the system size",
      nightUseCopy: "The battery carries the load that solar on its own cannot reach.",
    },
    contact: input.contact ?? { ...DEFAULT_CONTACT },
  };

  const operatorConfirmed = Boolean(input.operatorConfirmed);
  const status: FunderReport["status"] =
    holdReasons.length === 0 || operatorConfirmed ? "ready" : "hold_for_operator";

  return {
    version: FUNDER_REPORT_VERSION,
    caseReference: input.caseReference,
    businessName: input.businessName,
    generatedAt,
    status,
    holdReasons,
    operatorConfirmed,
    billFacts: facts,
    ufmsExtraction,
    ufmsVerification,
    wheelingFields,
    crosschecks,
    corrections,
    options: {
      eskomMonthly,
      ufms: option(ufmsMonthlyCost, input.ufms?.fileName ?? null),
      wheeling: option(wheelingMonthlyCost, input.wheeling?.fileName ?? null),
      combined: option(combinedMonthlyCost, input.ufms && input.wheeling ? "both" : null),
    },
    funderClaims: {
      ufmsTenYearSavingClaim: ufmsExtraction?.tenYearSavingClaim.value ?? null,
      ufmsTenYearUtilityForecast: ufmsExtraction?.tenYearUtilityForecast.value ?? null,
      ufmsCurrentAnnualCost: ufmsExtraction?.currentAnnualCost.value ?? null,
    },
    clientSavingsData,
  };
}
