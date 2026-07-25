import { jsPDF } from "jspdf";
import { sanitizeFileSegment } from "@/lib/download-utils";

export const MIGRATION_CASE_EOI_DECLARATIONS_VERSION = "2026-07-12.1";

export type MigrationCaseEoiCertificate = {
  signatureId: string;
  caseReference: string;
  proposalId: string;
  proposalGeneratedAt: string;
  companyName: string;
  companyRegistrationNumber: string | null;
  signerName: string;
  signerPosition: string;
  signedAt: string;
  economicallyPositive: boolean;
  yearOneMonthlyDifference: number;
  tenYearDifference: number;
};

function money(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

export function migrationCaseEoiPdfFilename(record: MigrationCaseEoiCertificate) {
  const company = sanitizeFileSegment(record.companyName) || "client";
  return `foundation-1-eoi-${company}-${record.caseReference.toLowerCase()}.pdf`;
}

export function buildMigrationCaseEoiPdf(record: MigrationCaseEoiCertificate) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  pdf.setProperties({
    title: `Foundation-1 Expression of Interest — ${record.companyName}`,
    subject: "Post-proposal non-binding Expression of Interest",
    author: "Foundation-1 (Pty) Ltd",
    creator: "Foundation-1 Migration Case Pipeline",
  });

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, 210, 297, "F");
  pdf.setFillColor(4, 12, 8);
  pdf.rect(0, 0, 210, 54, "F");
  pdf.setFillColor(185, 255, 145);
  pdf.circle(183, 25, 12, "F");
  pdf.setFillColor(4, 12, 8);
  pdf.circle(183, 25, 5, "F");
  pdf.setTextColor(185, 255, 145);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("FOUNDATION-1 / POST-PROPOSAL INTENT", 18, 17);
  pdf.setTextColor(246, 248, 247);
  pdf.setFontSize(22);
  pdf.text("Expression of Interest", 18, 33);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(181, 193, 186);
  pdf.text("Non-binding · issued after the bill-audited proposal was completed", 18, 43);

  let y = 69;
  pdf.setTextColor(22, 34, 27);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("To: Foundation-1 (Pty) Ltd", 18, y);
  y += 9;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.8);
  pdf.setTextColor(86, 99, 91);
  pdf.text(`Case ${record.caseReference}`, 18, y);
  pdf.text(`Proposal ${record.proposalId}`, 18, y + 5);
  y += 17;

  const outcomeParagraph = record.economicallyPositive
    ? `Based on the proposal's pre-engineering commercial case, including a modelled year-one monthly reduction of ${money(Math.abs(record.yearOneMonthlyDifference))} and ten-year reduction of ${money(Math.abs(record.tenYearDifference))}, ${record.companyName} expresses its interest in progressing the proposed renewable-energy migration through Foundation-1 (Pty) Ltd and its approved supply and funding partners.`
    : `The proposal identifies current commercial gaps, including a modelled year-one monthly premium of ${money(Math.abs(record.yearOneMonthlyDifference))} and ten-year premium of ${money(Math.abs(record.tenYearDifference))}. ${record.companyName} nevertheless expresses its interest in Foundation-1 (Pty) Ltd retaining and reassessing the opportunity if system sizing, commercial pricing, consumption or utility tariffs change. This does not accept the current configuration or its modelled costs.`;
  const paragraphs = [
    `${record.companyName} confirms that it has reviewed the completed Foundation-1 bill-audited migration proposal associated with ${record.caseReference}.`,
    outcomeParagraph,
    "The client authorises Foundation-1 to continue the information-sharing, site-assessment, engineering, funding and formal-terms process needed to determine whether a definitive transaction can be offered.",
    "This Expression of Interest is non-binding. It is not an acceptance of the proposal, a credit agreement, an energy supply agreement or an obligation to transact. A binding relationship arises only from a separate definitive agreement signed by the relevant parties.",
    "The client confirms that the signer is authorised to submit this Expression of Interest and that the company and site information supplied for the assessment is accurate to the best of the signer's knowledge.",
  ];

  for (const paragraph of paragraphs) {
    pdf.setTextColor(31, 43, 36);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.3);
    const lines = pdf.splitTextToSize(paragraph, 174) as string[];
    pdf.text(lines, 18, y, { lineHeightFactor: 1.45 });
    y += lines.length * 5.2 + 5;
  }

  y = Math.max(y + 3, 194);
  pdf.setFillColor(238, 247, 241);
  pdf.roundedRect(18, y, 174, 52, 4, 4, "F");
  pdf.setTextColor(35, 155, 102);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.2);
  pdf.text("DIGITAL SIGNATURE CERTIFICATE", 25, y + 10);
  pdf.setTextColor(20, 31, 25);
  pdf.setFontSize(17);
  pdf.text(record.signerName, 25, y + 23);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(84, 98, 90);
  const signedAt = new Date(record.signedAt).toLocaleString("en-ZA", {
    dateStyle: "long",
    timeStyle: "short",
  });
  pdf.text([
    `${record.signerPosition} · ${record.companyName}`,
    record.companyRegistrationNumber || "Company registration number not supplied",
    `Signed ${signedAt} · authority and non-binding terms confirmed`,
    `Signature ${record.signatureId}`,
  ], 25, y + 32, { lineHeightFactor: 1.35 });

  pdf.setDrawColor(214, 225, 218);
  pdf.line(18, 278, 192, 278);
  pdf.setFontSize(6.4);
  pdf.setTextColor(101, 114, 107);
  pdf.text(`Foundation-1 (Pty) Ltd · declaration ${MIGRATION_CASE_EOI_DECLARATIONS_VERSION}`, 18, 284);
  pdf.text(record.caseReference, 192, 284, { align: "right" });

  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    filename: migrationCaseEoiPdfFilename(record),
  };
}
