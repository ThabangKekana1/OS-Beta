import { jsPDF } from "jspdf";
import { sanitizeFileSegment } from "@/lib/download-utils";
import type { EoiTemplateLead } from "@/lib/eoi-template";

export type SignedEoiRecord = EoiTemplateLead & {
  eoiSignatureId: string;
  eoiSignedBy: string;
  eoiSignedAt: string;
  eoiAcceptedTermsAt: string;
};

function bodyText(record: SignedEoiRecord) {
  return [
    `${record.company} has reviewed the completed Foundation-1 energy-migration assessment prepared from its submitted operating evidence.`,
    "Subject to all relevant approvals, we confirm our interest in continuing from that assessment through Foundation-1 and its approved supply and funding partners. We authorise a terms-formulation period so formal commercial, financial and technical options can be prepared.",
    "We request Foundation-1 to engage the relevant stakeholders to obtain the information and approvals required to formulate indicative and, where appropriate, formal terms.",
    `If commercial and technical alignment is reached, ${record.company} wishes to explore a comprehensive zero-capex solar, storage, wheeling or related energy-migration agreement.`,
    `This Expression of Interest is non-binding. It does not oblige ${record.company}, Foundation-1 or any supply or funding partner to conclude a transaction. Any binding relationship will arise only from a separate definitive agreement signed by the relevant parties.`,
  ];
}

export function signedEoiPdfFilename(company: string) {
  return `foundation-1-signed-eoi-${sanitizeFileSegment(company) || "client"}.pdf`;
}

export function buildSignedEoiPdf(record: SignedEoiRecord) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  pdf.setProperties({
    title: `Signed Expression of Interest — ${record.company}`,
    subject: "Non-binding renewable-energy supply Expression of Interest",
    author: "Foundation-1 (Pty) Ltd",
    creator: "Foundation-1 1OS Digital Signature",
  });

  pdf.setFillColor(4, 12, 8);
  pdf.rect(0, 0, 210, 48, "F");
  pdf.setFillColor(185, 255, 145);
  pdf.circle(183, 22, 11, "F");
  pdf.setFillColor(4, 12, 8);
  pdf.circle(183, 22, 5, "F");
  pdf.setTextColor(185, 255, 145);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("FOUNDATION-1 / DIGITAL AGREEMENTS", 18, 17);
  pdf.setTextColor(245, 248, 246);
  pdf.setFontSize(22);
  pdf.text("Expression of Interest", 18, 31);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(182, 195, 187);
  pdf.text("Renewable energy supply · non-binding", 18, 39);

  let y = 62;
  pdf.setTextColor(20, 31, 25);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("To: Foundation-1 (Pty) Ltd", 18, y);
  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(84, 98, 90);
  pdf.text(`Profile ${record.clientProfileId} · ${record.company}`, 18, y);
  y += 14;

  for (const paragraph of bodyText(record)) {
    const lines = pdf.splitTextToSize(paragraph, 174) as string[];
    pdf.setTextColor(31, 42, 36);
    pdf.setFontSize(9.5);
    pdf.text(lines, 18, y, { lineHeightFactor: 1.45 });
    y += lines.length * 5.5 + 5;
  }

  y = Math.max(y + 4, 188);
  pdf.setFillColor(239, 247, 242);
  pdf.roundedRect(18, y, 174, 48, 4, 4, "F");
  pdf.setTextColor(35, 155, 102);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text("DIGITAL SIGNATURE CERTIFICATE", 25, y + 10);
  pdf.setTextColor(20, 31, 25);
  pdf.setFontSize(17);
  pdf.text(record.eoiSignedBy, 25, y + 22);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(84, 98, 90);
  const signedAt = new Date(record.eoiSignedAt).toLocaleString("en-ZA", { dateStyle: "long", timeStyle: "short" });
  pdf.text([
    record.userProfile.role || "Authorised representative",
    `${record.company} · ${record.businessRegistrationNumber || "Registration number not supplied"}`,
    `Signed ${signedAt} · Terms accepted`,
    `Signature record ${record.eoiSignatureId}`,
  ], 25, y + 30, { lineHeightFactor: 1.35 });

  pdf.setDrawColor(215, 225, 219);
  pdf.line(18, 278, 192, 278);
  pdf.setFontSize(6.5);
  pdf.setTextColor(101, 115, 107);
  pdf.text("Foundation-1 (Pty) Ltd · Digitally executed non-binding EOI", 18, 284);
  pdf.text(record.clientProfileId, 192, 284, { align: "right" });

  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    filename: signedEoiPdfFilename(record.company),
  };
}
