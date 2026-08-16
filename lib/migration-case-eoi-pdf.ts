import { jsPDF } from "jspdf";
import { sanitizeFileSegment } from "@/lib/download-utils";
import {
  buildMigrationCaseEoiLetterParagraphs,
  MIGRATION_CASE_EOI_LETTER_RECIPIENT,
  MIGRATION_CASE_EOI_LETTER_TITLE,
} from "@/lib/migration-case-agreements";

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

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, 210, 297, "F");

  // Company letterhead block, populated from the business profile.
  let y = 26;
  pdf.setTextColor(20, 28, 24);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(record.companyName, 24, y);
  y += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.6);
  pdf.setTextColor(96, 108, 101);
  const letterheadLines = [
    record.companyRegistrationNumber ? `Company Registration Nr: ${record.companyRegistrationNumber}` : null,
    record.vatNumber ? `VAT Nr: ${record.vatNumber}` : null,
    record.physicalAddress || null,
  ].filter((line): line is string => Boolean(line));
  for (const line of letterheadLines) {
    pdf.text(line, 24, y);
    y += 4.6;
  }
  pdf.setDrawColor(210, 219, 213);
  pdf.line(24, y + 3, 186, y + 3);
  y += 15;

  pdf.setTextColor(20, 28, 24);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(MIGRATION_CASE_EOI_LETTER_TITLE, 24, y);
  y += 9;
  pdf.setFontSize(9.5);
  pdf.text("To Whom It May Concern:", 24, y);
  const labelWidth = pdf.getTextWidth("To Whom It May Concern:") + 1.6;
  pdf.setFont("helvetica", "normal");
  pdf.text(MIGRATION_CASE_EOI_LETTER_RECIPIENT, 24 + labelWidth, y);
  y += 11;

  for (const paragraph of buildMigrationCaseEoiLetterParagraphs({ companyName: record.companyName, economicallyPositive: record.economicallyPositive ?? true })) {
    pdf.setTextColor(31, 43, 36);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.6);
    const lines = pdf.splitTextToSize(paragraph, 162) as string[];
    pdf.text(lines, 24, y, { lineHeightFactor: 1.5 });
    y += lines.length * 5.5 + 6;
  }

  y += 4;
  pdf.setFontSize(9.6);
  pdf.text("Kind Regards,", 24, y);

  // Signature block: Signature / Name / Capacity, as in the letter template.
  y = Math.max(y + 14, 208);
  pdf.setFont("times", "italic");
  pdf.setFontSize(15);
  pdf.setTextColor(24, 36, 30);
  pdf.text(record.signerName, 26, y);
  pdf.setDrawColor(120, 132, 125);
  pdf.line(24, y + 3, 96, y + 3);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.4);
  pdf.setTextColor(96, 108, 101);
  pdf.text("Signature (digitally recorded)", 24, y + 8);

  y += 20;
  pdf.setTextColor(24, 36, 30);
  pdf.setFontSize(9.4);
  pdf.text(record.signerName, 24, y);
  pdf.text(record.signerPosition, 126, y);
  pdf.setDrawColor(120, 132, 125);
  pdf.line(24, y + 3, 96, y + 3);
  pdf.line(126, y + 3, 186, y + 3);
  pdf.setFontSize(7.4);
  pdf.setTextColor(96, 108, 101);
  pdf.text("Name", 24, y + 8);
  pdf.text("Capacity", 126, y + 8);

  // Digital signature certificate strip.
  const signedAt = new Date(record.signedAt).toLocaleString("en-ZA", {
    dateStyle: "long",
    timeStyle: "short",
  });
  pdf.setFillColor(238, 247, 241);
  pdf.roundedRect(24, 252, 162, 22, 3, 3, "F");
  pdf.setTextColor(35, 120, 82);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.6);
  pdf.text("DIGITAL SIGNATURE CERTIFICATE", 30, 259);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(72, 88, 80);
  pdf.text([
    `Signed ${signedAt} by ${record.signerName} (${record.signerPosition}) · authority and non-binding terms confirmed`,
    `Case ${record.caseReference} · ${record.proposalId ? `Proposal ${record.proposalId}` : "Signed on bill upload, ahead of the audited proposal"} · Signature ${record.signatureId}`,
  ], 30, 264.5, { lineHeightFactor: 1.45 });

  pdf.setDrawColor(214, 225, 218);
  pdf.line(24, 281, 186, 281);
  pdf.setFontSize(6.4);
  pdf.setTextColor(101, 114, 107);
  pdf.text(`Recorded by Foundation-1 (Pty) Ltd · declaration ${MIGRATION_CASE_EOI_DECLARATIONS_VERSION}`, 24, 286);
  pdf.text(record.caseReference, 186, 286, { align: "right" });

  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    filename: migrationCaseEoiPdfFilename(record),
  };
}
