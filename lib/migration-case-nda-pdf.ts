import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsPDF } from "jspdf";
import { sanitizeFileSegment } from "@/lib/download-utils";
import {
  buildMigrationCaseNdaClauses,
  FOUNDATION_NDA_PARTY,
  FOUNDATION_NDA_SIGNATORY,
  MIGRATION_CASE_NDA_VERSION,
} from "@/lib/migration-case-agreements";
import {
  KIT_COLORS,
  KIT_INK,
  KIT_PAGE,
  addKitPage,
  blend,
  brandLockup,
  coverGridTexture,
  drawText,
  eyebrow,
  footerBand,
  hairline,
  inkTint,
  kitLongDate,
  monoLabel,
  paintPaper,
  panel,
  accentBar,
  paragraph,
  wrapText,
} from "@/lib/document-kit";

// =============================================================================
// Foundation-1 non-disclosure and consent agreement, print layer. House
// document design system: cover feel on page one, numbered clauses with
// breathing room, twin signature panels, a digital execution record.
// Client-facing: no funder or partner is ever named.
// =============================================================================

let signatureDataUrl: string | null | undefined;

/** Karman's signature, read once from public/ and cached for the process. */
function foundationSignature() {
  if (signatureDataUrl !== undefined) return signatureDataUrl;
  try {
    const bytes = readFileSync(join(process.cwd(), "public", "foundation-1-signature.png"));
    signatureDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    signatureDataUrl = null;
  }
  return signatureDataUrl;
}

export type MigrationCaseNdaRecord = {
  ndaId: string;
  caseReference: string;
  companyName: string;
  companyRegistrationNumber: string | null;
  physicalAddress: string | null;
  clientContactName: string;
  clientEmail: string;
  clientPhone: string;
  signerName: string;
  signerPosition: string;
  signedAt: string;
};

export function migrationCaseNdaPdfFilename(record: Pick<MigrationCaseNdaRecord, "companyName" | "caseReference">) {
  const company = sanitizeFileSegment(record.companyName) || "client";
  return `foundation-1-nda-${company}-${record.caseReference.toLowerCase()}.pdf`;
}

export function buildMigrationCaseNdaPdf(record: MigrationCaseNdaRecord) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  pdf.setProperties({
    title: `Non-Disclosure and POPIA Consent Agreement: ${record.companyName}`,
    subject: "Mutual NDA and limited information-sharing consent",
    author: "Foundation-1 (Pty) Ltd",
    creator: "Foundation-1 Migration Case Pipeline",
  });
  const signedDate = kitLongDate(record.signedAt);
  const context = `CASE ${record.caseReference}`;

  // ------------------------------------------------------ page one, cover feel
  paintPaper(pdf);
  coverGridTexture(pdf, { fadeBottomY: 58 });
  brandLockup(pdf, KIT_PAGE.margin, 10.2);
  monoLabel(pdf, `${context} \u00b7 ${signedDate}`, KIT_PAGE.width - KIT_PAGE.margin, 14.8, {
    size: 6.2,
    alpha: KIT_INK.faint,
    trackingEm: 0.14,
    align: "right",
  });

  eyebrow(pdf, "FOUNDATION-1 \u00b7 CONFIDENTIALITY \u00b7 POPIA", KIT_PAGE.margin, 32);
  drawText(pdf, "Non-disclosure and", KIT_PAGE.margin, 43, { weight: "bold", size: 24 });
  drawText(pdf, "consent agreement.", KIT_PAGE.margin, 53, { weight: "bold", size: 24, color: inkTint(KIT_INK.faint) });
  monoLabel(pdf, "MUTUAL CONFIDENTIALITY \u00b7 POPIA PROCESSING \u00b7 LIMITED SHARING CONSENT", KIT_PAGE.margin, 60.5, {
    size: 6.2,
    alpha: KIT_INK.dim,
    trackingEm: 0.13,
  });

  // The parties: two panels carrying the full contact records.
  let y = 69;
  monoLabel(pdf, "THE PARTIES", KIT_PAGE.margin, y);
  y += 3;
  const columnWidth = (KIT_PAGE.contentWidth - 4) / 2;
  const rightX = KIT_PAGE.margin + columnWidth + 4;
  const partyPanelHeight = 41;
  panel(pdf, KIT_PAGE.margin, y, columnWidth, partyPanelHeight);
  panel(pdf, rightX, y, columnWidth, partyPanelHeight);
  const partyLabel = { size: 5.6, alpha: KIT_INK.ghost, trackingEm: 0.12, base: KIT_COLORS.panel } as const;
  monoLabel(pdf, "DISCLOSING AND RECEIVING PARTY", KIT_PAGE.margin + 5, y + 6, partyLabel);
  monoLabel(pdf, "DISCLOSING AND RECEIVING PARTY", rightX + 5, y + 6, partyLabel);
  drawText(pdf, FOUNDATION_NDA_PARTY.name, KIT_PAGE.margin + 5, y + 12.4, { weight: "bold", size: 9 });
  drawText(pdf, record.companyName.slice(0, 44), rightX + 5, y + 12.4, { weight: "bold", size: 9 });
  const detailStyle = { size: 6.8, color: inkTint(KIT_INK.dim, KIT_COLORS.panel) } as const;
  const foundationLines = [
    `Registration ${FOUNDATION_NDA_PARTY.registrationNumber}`,
    FOUNDATION_NDA_PARTY.contactName,
    FOUNDATION_NDA_PARTY.email,
    FOUNDATION_NDA_PARTY.phone,
  ];
  foundationLines.forEach((line, index) => {
    drawText(pdf, line, KIT_PAGE.margin + 5, y + 18.6 + index * 4.1, detailStyle);
  });
  const clientLines = [
    record.companyRegistrationNumber ? `Registration ${record.companyRegistrationNumber}` : "Registration number not supplied",
    `${record.clientContactName} (${record.signerPosition})`.slice(0, 48),
    record.clientEmail,
    record.clientPhone,
    ...(record.physicalAddress ? wrapText(pdf, record.physicalAddress, { size: 6.8 }, columnWidth - 10).slice(0, 1) : []),
  ];
  clientLines.forEach((line, index) => {
    drawText(pdf, line, rightX + 5, y + 18.6 + index * 4.1, detailStyle);
  });
  y += partyPanelHeight + 9;

  // ------------------------------------------------- clauses, breathing room
  const clauses = buildMigrationCaseNdaClauses(record.companyName);
  monoLabel(pdf, "THE AGREEMENT \u00b7 SIX CLAUSES, PLAIN LANGUAGE", KIT_PAGE.margin, y);
  y += 7.5;
  const bodyStyle = { size: 8.2, color: inkTint(KIT_INK.body) } as const;
  const bodyWidth = KIT_PAGE.contentWidth - 12.7;
  clauses.forEach((clause, index) => {
    const title = clause.title.replace(/^\d+\.\s*/, "");
    const bodyLines = wrapText(pdf, clause.body, bodyStyle, bodyWidth);
    const blockHeight = 6.4 + bodyLines.length * 4.3;
    if (y + blockHeight > KIT_PAGE.bodyLimitY) {
      y = addKitPage(pdf, {
        eyebrow: "FOUNDATION-1 \u00b7 CONFIDENTIALITY \u00b7 POPIA",
        title: "The agreement, continued.",
        context: `${context} \u00b7 ${signedDate.toUpperCase()}`,
      });
      y += 2;
    }
    drawText(pdf, String(index + 1).padStart(2, "0"), KIT_PAGE.margin, y, {
      font: "courier",
      size: 8.5,
      color: blend(KIT_COLORS.amber, 0.9),
      trackingEm: 0.08,
    });
    drawText(pdf, title, KIT_PAGE.margin + 12.7, y, { weight: "bold", size: 9.5 });
    paragraph(pdf, clause.body, KIT_PAGE.margin + 12.7, y + 5.6, bodyStyle, bodyWidth, { lineHeight: 4.3 });
    y += blockHeight + 6.2;
  });

  // ------------------------------------------------------- signature panels
  const signatureBlockHeight = 46 + 8 + 17 + 6;
  if (y + signatureBlockHeight > KIT_PAGE.bodyLimitY) {
    y = addKitPage(pdf, {
      eyebrow: "FOUNDATION-1 \u00b7 CONFIDENTIALITY \u00b7 POPIA",
      title: "Execution.",
      context: `${context} \u00b7 ${signedDate.toUpperCase()}`,
    });
    y += 2;
  } else {
    y = Math.max(y + 2, KIT_PAGE.bodyLimitY - signatureBlockHeight);
  }
  const signedAtText = new Date(record.signedAt).toLocaleString("en-ZA", { dateStyle: "long", timeStyle: "short" });
  const signaturePanelHeight = 46;
  panel(pdf, KIT_PAGE.margin, y, columnWidth, signaturePanelHeight);
  panel(pdf, rightX, y, columnWidth, signaturePanelHeight);
  monoLabel(pdf, "SIGNED FOR FOUNDATION-1 (PTY) LTD", KIT_PAGE.margin + 5, y + 6.4, partyLabel);
  monoLabel(pdf, `SIGNED FOR ${record.companyName.toUpperCase().slice(0, 30)}`, rightX + 5, y + 6.4, partyLabel);

  const signature = foundationSignature();
  if (signature) {
    pdf.addImage(signature, "PNG", KIT_PAGE.margin + 5, y + 11.5, 52, 17.6, undefined, "FAST");
  } else {
    drawText(pdf, FOUNDATION_NDA_SIGNATORY.name, KIT_PAGE.margin + 5, y + 24, { font: "times", weight: "italic", size: 13 });
  }
  drawText(pdf, record.signerName, rightX + 5, y + 26, { font: "times", weight: "italic", size: 12.5 });

  hairline(pdf, KIT_PAGE.margin + 5, y + 33, KIT_PAGE.margin + columnWidth - 5, y + 33, { alpha: 0.3, base: KIT_COLORS.panel });
  hairline(pdf, rightX + 5, y + 33, rightX + columnWidth - 5, y + 33, { alpha: 0.3, base: KIT_COLORS.panel });
  const signMeta = { size: 6.6, color: inkTint(KIT_INK.dim, KIT_COLORS.panel) } as const;
  drawText(pdf, `${FOUNDATION_NDA_SIGNATORY.name} \u00b7 ${FOUNDATION_NDA_SIGNATORY.position}`, KIT_PAGE.margin + 5, y + 37.6, signMeta);
  drawText(pdf, "Signed in advance of client execution", KIT_PAGE.margin + 5, y + 41.6, signMeta);
  drawText(pdf, `${record.signerName} \u00b7 ${record.signerPosition}`.slice(0, 54), rightX + 5, y + 37.6, signMeta);
  drawText(pdf, `Signed ${signedAtText}`, rightX + 5, y + 41.6, signMeta);
  y += signaturePanelHeight + 5;

  // Digital execution record.
  const recordHeight = 17;
  panel(pdf, KIT_PAGE.margin, y, KIT_PAGE.contentWidth, recordHeight);
  accentBar(pdf, KIT_PAGE.margin, y, recordHeight, KIT_COLORS.green);
  monoLabel(pdf, "DIGITAL EXECUTION RECORD", KIT_PAGE.margin + 5.6, y + 6, {
    size: 5.8,
    color: blend(KIT_COLORS.green, 0.85, KIT_COLORS.panel),
    trackingEm: 0.14,
  });
  drawText(
    pdf,
    `Agreement version ${MIGRATION_CASE_NDA_VERSION} \u00b7 Record ${record.ndaId} \u00b7 ${context}`,
    KIT_PAGE.margin + 5.6,
    y + 10.8,
    { size: 7, color: inkTint(KIT_INK.dim, KIT_COLORS.panel) },
  );
  drawText(
    pdf,
    "Both parties receive this executed copy inside the secure migration case.",
    KIT_PAGE.margin + 5.6,
    y + 14.4,
    { size: 6.6, color: inkTint(KIT_INK.faint, KIT_COLORS.panel) },
  );

  footerBand(pdf, "Non-disclosure and consent", context);
  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    filename: migrationCaseNdaPdfFilename(record),
  };
}
