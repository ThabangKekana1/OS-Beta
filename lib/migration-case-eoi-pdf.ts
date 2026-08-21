import { jsPDF } from "jspdf";
import { sanitizeFileSegment } from "@/lib/download-utils";
import {
  buildMigrationCaseEoiLetterParagraphs,
  MIGRATION_CASE_EOI_LETTER_RECIPIENT,
} from "@/lib/migration-case-agreements";
import {
  KIT_COLORS,
  KIT_INK,
  KIT_PAGE,
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
} from "@/lib/document-kit";

// =============================================================================
// Foundation-1 Expression of Interest (secure migration case), print layer.
// House document design system: the letter is the centrepiece, set directly
// on the paper texture under the NON-BINDING EXPRESSION OF INTEREST header
// treatment, with the signature block and the digital signature record.
// Client-facing: no funder or partner is ever named.
// =============================================================================

export const MIGRATION_CASE_EOI_DECLARATIONS_VERSION = "2026-08-01.1";

export type MigrationCaseEoiCertificate = {
  signatureId: string;
  caseReference: string;
  proposalId: string | null;
  proposalGeneratedAt: string | null;
  companyName: string;
  companyRegistrationNumber: string | null;
  vatNumber: string | null;
  physicalAddress: string | null;
  signerName: string;
  signerPosition: string;
  signedAt: string;
  economicallyPositive: boolean | null;
  yearOneMonthlyDifference: number | null;
  tenYearDifference: number | null;
};

export function migrationCaseEoiPdfFilename(record: Pick<MigrationCaseEoiCertificate, "companyName" | "caseReference">) {
  const company = sanitizeFileSegment(record.companyName) || "client";
  return `foundation-1-eoi-${company}-${record.caseReference.toLowerCase()}.pdf`;
}

export function buildMigrationCaseEoiPdf(record: MigrationCaseEoiCertificate) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  pdf.setProperties({
    title: `Expression of Interest: ${record.companyName}`,
    subject: "Non-binding Expression of Interest: renewable energy supply",
    author: record.companyName,
    creator: "Foundation-1 Migration Case Pipeline",
  });
  const signedDate = kitLongDate(record.signedAt);
  const context = `CASE ${record.caseReference}`;

  paintPaper(pdf);
  coverGridTexture(pdf, { fadeBottomY: 58 });
  brandLockup(pdf, KIT_PAGE.margin, 10.2);
  monoLabel(pdf, `${context} \u00b7 ${signedDate}`, KIT_PAGE.width - KIT_PAGE.margin, 14.8, {
    size: 6.2,
    alpha: KIT_INK.faint,
    trackingEm: 0.14,
    align: "right",
  });

  // The header treatment.
  eyebrow(pdf, "NON-BINDING EXPRESSION OF INTEREST", KIT_PAGE.margin, 32);
  drawText(pdf, "Expression of Interest.", KIT_PAGE.margin, 43, { weight: "bold", size: 24 });
  drawText(pdf, "Renewable energy supply.", KIT_PAGE.margin, 53, { weight: "bold", size: 24, color: inkTint(KIT_INK.faint) });
  monoLabel(pdf, "NON-BINDING \u00b7 SUBJECT TO CONTRACT \u00b7 RECORDED DIGITALLY", KIT_PAGE.margin, 60.5, {
    size: 6.2,
    alpha: KIT_INK.dim,
    trackingEm: 0.13,
  });

  // The business letterhead, populated from the case profile.
  let y = 68;
  const letterheadLines = [
    record.companyRegistrationNumber ? `Registration ${record.companyRegistrationNumber}` : null,
    record.vatNumber ? `VAT ${record.vatNumber}` : null,
    record.physicalAddress || null,
  ].filter((line): line is string => Boolean(line));
  const letterheadHeight = 15.4 + Math.max(1, letterheadLines.length) * 4.1;
  panel(pdf, KIT_PAGE.margin, y, KIT_PAGE.contentWidth, letterheadHeight);
  monoLabel(pdf, "FROM \u00b7 THE AUTHORISED BUSINESS", KIT_PAGE.margin + 5.6, y + 6, {
    size: 5.6,
    alpha: KIT_INK.ghost,
    trackingEm: 0.12,
    base: KIT_COLORS.panel,
  });
  drawText(pdf, record.companyName, KIT_PAGE.margin + 5.6, y + 12.6, { weight: "bold", size: 11 });
  letterheadLines.forEach((line, index) => {
    drawText(pdf, line, KIT_PAGE.margin + 5.6, y + 18.2 + index * 4.1, { size: 6.8, color: inkTint(KIT_INK.dim, KIT_COLORS.panel) });
  });
  y += letterheadHeight + 9;

  // The letter, set directly on the paper.
  monoLabel(pdf, `TO \u00b7 ${MIGRATION_CASE_EOI_LETTER_RECIPIENT.toUpperCase()}`, KIT_PAGE.margin, y, { alpha: KIT_INK.dim, size: 6.4 });
  y += 8.5;
  const letterStyle = { size: 9.6, color: inkTint(0.86) } as const;
  for (const letterParagraph of buildMigrationCaseEoiLetterParagraphs({
    companyName: record.companyName,
    economicallyPositive: record.economicallyPositive ?? true,
  })) {
    y = paragraph(pdf, letterParagraph, KIT_PAGE.margin, y, letterStyle, KIT_PAGE.contentWidth, { lineHeight: 5.2 });
    y += 3.4;
  }
  y += 2;
  drawText(pdf, "Kind regards,", KIT_PAGE.margin, y, letterStyle);

  // Signature block: Signature / Name / Capacity, as in the letter template.
  y = Math.max(y + 15, 205);
  drawText(pdf, record.signerName, KIT_PAGE.margin + 2, y, { font: "times", weight: "italic", size: 15 });
  hairline(pdf, KIT_PAGE.margin, y + 3, KIT_PAGE.margin + 72, y + 3, { alpha: 0.3 });
  monoLabel(pdf, "SIGNATURE \u00b7 DIGITALLY RECORDED", KIT_PAGE.margin, y + 7.6, { size: 5.6, alpha: KIT_INK.faint, trackingEm: 0.12 });

  y += 17;
  drawText(pdf, record.signerName, KIT_PAGE.margin, y, { weight: "bold", size: 9.4 });
  drawText(pdf, record.signerPosition, KIT_PAGE.margin + 108, y, { weight: "bold", size: 9.4 });
  hairline(pdf, KIT_PAGE.margin, y + 3, KIT_PAGE.margin + 72, y + 3, { alpha: 0.3 });
  hairline(pdf, KIT_PAGE.margin + 108, y + 3, KIT_PAGE.width - KIT_PAGE.margin, y + 3, { alpha: 0.3 });
  monoLabel(pdf, "NAME", KIT_PAGE.margin, y + 7.6, { size: 5.6, alpha: KIT_INK.faint, trackingEm: 0.12 });
  monoLabel(pdf, "CAPACITY", KIT_PAGE.margin + 108, y + 7.6, { size: 5.6, alpha: KIT_INK.faint, trackingEm: 0.12 });

  // Digital signature record.
  const signedAtText = new Date(record.signedAt).toLocaleString("en-ZA", { dateStyle: "long", timeStyle: "short" });
  const recordY = 249;
  const recordHeight = 21;
  panel(pdf, KIT_PAGE.margin, recordY, KIT_PAGE.contentWidth, recordHeight);
  accentBar(pdf, KIT_PAGE.margin, recordY, recordHeight, KIT_COLORS.green);
  monoLabel(pdf, "DIGITAL SIGNATURE RECORD", KIT_PAGE.margin + 5.6, recordY + 6, {
    size: 5.8,
    color: blend(KIT_COLORS.green, 0.85, KIT_COLORS.panel),
    trackingEm: 0.14,
  });
  const recordMeta = { size: 7, color: inkTint(KIT_INK.dim, KIT_COLORS.panel) } as const;
  drawText(
    pdf,
    `Signed ${signedAtText} by ${record.signerName} (${record.signerPosition}) \u00b7 authority and non-binding terms confirmed`,
    KIT_PAGE.margin + 5.6,
    recordY + 11,
    recordMeta,
  );
  drawText(
    pdf,
    `${context} \u00b7 ${record.proposalId ? `Proposal ${record.proposalId}` : "Signed on bill upload, ahead of the audited proposal"} \u00b7 Signature ${record.signatureId} \u00b7 Declaration ${MIGRATION_CASE_EOI_DECLARATIONS_VERSION}`,
    KIT_PAGE.margin + 5.6,
    recordY + 15.4,
    { size: 6.4, color: inkTint(KIT_INK.faint, KIT_COLORS.panel) },
  );

  footerBand(pdf, "Expression of Interest", context);
  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    filename: migrationCaseEoiPdfFilename(record),
  };
}
