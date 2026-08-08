/**
 * Doc-type classifier — cheap, deterministic, text-layer heuristics first.
 *
 * Signals were derived from the real specimen corpus in `_extract/text/`
 * (audit 02 §b): Eskom Landrate/Businessrate invoices (Ratang, Sams, Seokas),
 * Ruraflex ToU statements (Primo), HOA resold-supply levy statements
 * (Khaya Kwa), FNB/Standard Bank statements (Ratang "*_Statement", Zikhona
 * SBSA), Foundation-1/Green Share EOIs, SARS VAT registration notices, and
 * the three returned Nedbank UFMS P4L decks plus one Green Share wheeling
 * proposal. Zero-text documents (office-scanner packs, photos) classify as
 * `unknown` with `needsOcr: true` and are routed to the OCR adapter chain.
 */
import type { ClassificationResult, DocumentType } from "./types";

const PAGE_MARKER = /=====\s*PAGE\s+\d+\s*\/\s*\d+\s*=====/g;
/** pdf-parse inserts "-- N of M --" between pages; pure separator noise. */
const PDF_PARSE_PAGE_SEPARATOR = /--\s*\d+\s+of\s+\d+\s*--/g;
const EXTRACT_HEADER = /^\[(?:PDF|pages)[^\]]*\]\s*$/gm;

/** Strip artefacts of the offline extract format so fixtures and live
 * pdf-parse output classify identically. */
export function normaliseDocumentText(raw: string): string {
  return raw
    .replace(EXTRACT_HEADER, " ")
    .replace(PAGE_MARKER, " ")
    .replace(PDF_PARSE_PAGE_SEPARATOR, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Rule = {
  docType: DocumentType;
  /** Every `all` pattern must match; each adds a signal. */
  all: RegExp[];
  /** Optional reinforcing patterns; each match adds confidence. */
  any?: RegExp[];
  /** Patterns that veto this rule when present. */
  none?: RegExp[];
  base: number;
};

/** Ordered: first match wins. Proposals before bills (decks quote tariffs and
 * kWh); strong Eskom invoice anchors before bank statements (bills list bank
 * payment details); EOIs before generic KYC. */
const RULES: Rule[] = [
  {
    docType: "funder_proposal",
    all: [/UFMS\s+PROPOSAL|UTILITY\s+FULL\s+MAINTENANCE\s+SERVICE/i],
    any: [/eqstra/i, /nedbank/i, /monthly charge of\s*R/i, /solar generation system/i],
    base: 0.7,
  },
  {
    docType: "funder_proposal",
    all: [/wheeling/i, /proposal/i],
    any: [/green\s?share/i, /electricity trader/i, /eskom.{0,40}network/i],
    none: [/PREMISE ID NUMBER/i],
    base: 0.6,
  },
  {
    docType: "eoi",
    all: [/EXPRESSION\s+OF\s+INTEREST/i],
    any: [/renewable\s+energy\s+supply/i, /foundation-?1/i, /green\s?share/i],
    none: [/UFMS\s+PROPOSAL/i],
    base: 0.7,
  },
  {
    // Eskom statement layouts B1 (account-summary + itemised) and B2 (ToU).
    docType: "utility_bill",
    all: [/PREMISE ID NUMBER|TARIFF NAME\s*:|NOTIFIED MAX DEMAND|CONSUMPTION DETAILS/i],
    any: [/eskom/i, /kwh/i, /vat/i, /tax invoice/i],
    base: 0.8,
  },
  {
    // Resold supply / HOA levy statements carrying electricity recoveries
    // (Khaya Kwa layout B3). Parsed downstream as manual-review today.
    docType: "utility_bill",
    all: [/electricity recovery|eskom service charge|electricity charge/i],
    any: [/levy|home\s?owners|statement/i],
    none: [/opening balance.{0,400}closing balance/i],
    base: 0.55,
  },
  {
    docType: "bank_statement",
    all: [
      /standard bank|first national bank|\bfnb\b|\babsa\b|capitec|gold business account|current acc/i,
      /opening balance|closing balance|available balance|statement period|transaction details|transactions in rand/i,
    ],
    none: [/PREMISE ID NUMBER|TARIFF NAME\s*:/i],
    base: 0.7,
  },
  {
    docType: "kyc_vat_certificate",
    all: [/VALUE ADDED TAX/i, /NOTICE OF REGISTRATION/i],
    any: [/sars/i, /taxpayer reference/i],
    base: 0.8,
  },
  {
    docType: "kyc_company_registration",
    all: [/CIPC|companies and intellectual property commission|certificate of incorporation|registration certificate/i],
    any: [/enterprise number|registration number/i],
    base: 0.6,
  },
  {
    docType: "kyc_id_document",
    all: [/identity document|identity number|passport number/i],
    any: [/republic of south africa/i],
    base: 0.5,
  },
  {
    // Generic utility bill fallback: electricity keywords + money, weaker
    // than the anchored Eskom rule but still positive classification.
    docType: "utility_bill",
    all: [/kwh/i, /tariff|electricity/i],
    any: [/eskom/i, /municipal/i, /invoice/i, /account/i],
    none: [/EXPRESSION\s+OF\s+INTEREST/i],
    base: 0.5,
  },
];

const FILENAME_HINTS: Array<[RegExp, DocumentType]> = [
  [/proposal/i, "funder_proposal"],
  [/\beoi\b|expression[_ ]of[_ ]interest/i, "eoi"],
  [/statement/i, "bank_statement"],
  [/vat[_ ]?reg/i, "kyc_vat_certificate"],
  [/bill|invoice|eskom|utility/i, "utility_bill"],
];

export function classifyDocumentText(
  rawText: string,
  fileName?: string,
): ClassificationResult {
  const text = normaliseDocumentText(rawText ?? "");
  const signals: string[] = [];

  // A scan/photo: no usable text layer at all.
  if (text.length < 40) {
    const hint = fileName ? FILENAME_HINTS.find(([re]) => re.test(fileName)) : undefined;
    if (hint) signals.push(`filename-hint:${hint[1]}`);
    return {
      // A filename is not evidence of content — scans stay `unknown` and go
      // to OCR; the hint only informs routing priority.
      docType: "unknown",
      confidence: 0,
      signals: [...signals, "empty-text-layer"],
      needsOcr: true,
    };
  }

  for (const rule of RULES) {
    if (!rule.all.every((re) => re.test(text))) continue;
    if (rule.none?.some((re) => re.test(text))) continue;
    let confidence = rule.base;
    signals.push(...rule.all.map((re) => `match:${re.source.slice(0, 40)}`));
    for (const re of rule.any ?? []) {
      if (re.test(text)) {
        confidence += 0.05;
        signals.push(`support:${re.source.slice(0, 40)}`);
      }
    }
    if (fileName) {
      const hint = FILENAME_HINTS.find(([re]) => re.test(fileName));
      if (hint && hint[1] === rule.docType) {
        confidence += 0.05;
        signals.push("filename-agrees");
      }
    }
    return {
      docType: rule.docType,
      confidence: Math.min(0.99, confidence),
      signals,
      needsOcr: false,
    };
  }

  return { docType: "unknown", confidence: 0.2, signals: ["no-rule-matched"], needsOcr: false };
}
