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

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, 210, 297, "F");
  pdf.setFillColor(4, 12, 8);
  pdf.rect(0, 0, 210, 46, "F");
  pdf.setTextColor(185, 255, 145);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("FOUNDATION-1 / CONFIDENTIALITY & POPIA", 18, 16);
  pdf.setTextColor(246, 248, 247);
  pdf.setFontSize(19);
  pdf.text("Non-Disclosure & Consent Agreement", 18, 29);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(181, 193, 186);
  pdf.text("Mutual confidentiality · POPIA processing · limited sharing consent", 18, 38);

  let y = 58;
  pdf.setTextColor(22, 34, 27);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("THE PARTIES", 18, y);
  y += 6;

  // Two party columns, each carrying the full contact record.
  const columnWidth = 84;
  const rightX = 108;
  pdf.setFillColor(246, 248, 247);
  pdf.roundedRect(18, y - 4, columnWidth, 34, 2, 2, "F");
  pdf.roundedRect(rightX, y - 4, columnWidth, 34, 2, 2, "F");

  pdf.setFontSize(8.4);
  pdf.setTextColor(20, 31, 25);
  pdf.text(FOUNDATION_NDA_PARTY.name, 23, y + 2);
  pdf.text(record.companyName.slice(0, 40), rightX + 5, y + 2);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(86, 99, 91);
  pdf.text([
    `Reg ${FOUNDATION_NDA_PARTY.registrationNumber}`,
    FOUNDATION_NDA_PARTY.contactName,
    FOUNDATION_NDA_PARTY.email,
    FOUNDATION_NDA_PARTY.phone,
  ], 23, y + 8, { lineHeightFactor: 1.5 });
  pdf.text([
    record.companyRegistrationNumber ? `Reg ${record.companyRegistrationNumber}` : "Registration number not supplied",
    `${record.clientContactName} (${record.signerPosition})`.slice(0, 46),
    record.clientEmail,
    record.clientPhone,
    ...(record.physicalAddress ? (pdf.splitTextToSize(record.physicalAddress, columnWidth - 10) as string[]).slice(0, 2) : []),
  ], rightX + 5, y + 8, { lineHeightFactor: 1.5 });
  y += 38;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.6);
  pdf.setTextColor(86, 99, 91);
  pdf.text(`Case ${record.caseReference}`, 18, y);
  y += 8;

  for (const clause of buildMigrationCaseNdaClauses(record.companyName)) {
    pdf.setTextColor(22, 34, 27);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.4);
    pdf.text(clause.title, 18, y);
    y += 4.6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.2);
    pdf.setTextColor(45, 58, 51);
    const lines = pdf.splitTextToSize(clause.body, 174) as string[];
    pdf.text(lines, 18, y, { lineHeightFactor: 1.4 });
    y += lines.length * 4.3 + 5;
  }

  // Two signature columns: Foundation-1 (pre-signed) and the client.
  const signedAt = new Date(record.signedAt).toLocaleString("en-ZA", {
    dateStyle: "long",
    timeStyle: "short",
  });
  // Signatures never collide with the footer: overflow onto a clean page.
  if (y + 4 > 222) {
    pdf.addPage();
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, 210, 297, "F");
    y = 40;
  } else {
    y = Math.max(y + 4, 214);
  }
  pdf.setFillColor(246, 248, 247);
  pdf.roundedRect(18, y, 84, 44, 3, 3, "F");
  pdf.roundedRect(108, y, 84, 44, 3, 3, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.4);
  pdf.setTextColor(90, 102, 95);
  pdf.text("SIGNED FOR FOUNDATION-1 (PTY) LTD", 23, y + 7);
  pdf.text(`SIGNED FOR ${record.companyName.toUpperCase().slice(0, 30)}`, 113, y + 7);

  const signature = foundationSignature();
  if (signature) {
    pdf.addImage(signature, "PNG", 23, y + 9, 40, 26.5, undefined, "FAST");
  } else {
    pdf.setFont("times", "italic");
    pdf.setFontSize(13);
    pdf.setTextColor(24, 36, 30);
    pdf.text(FOUNDATION_NDA_SIGNATORY.name, 23, y + 22);
  }
  pdf.setFont("times", "italic");
  pdf.setFontSize(12.5);
  pdf.setTextColor(24, 36, 30);
  pdf.text(record.signerName, 113, y + 24);

  pdf.setDrawColor(150, 160, 154);
  pdf.line(23, y + 30, 97, y + 30);
  pdf.line(113, y + 30, 187, y + 30);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.6);
  pdf.setTextColor(72, 88, 80);
  pdf.text([
    `${FOUNDATION_NDA_SIGNATORY.name} · ${FOUNDATION_NDA_SIGNATORY.position}`,
    "Signed in advance of client execution",
  ], 23, y + 34.5, { lineHeightFactor: 1.5 });
  pdf.text([
    `${record.signerName} · ${record.signerPosition}`.slice(0, 52),
    `Signed ${signedAt}`,
  ], 113, y + 34.5, { lineHeightFactor: 1.5 });

  pdf.setDrawColor(214, 225, 218);
  pdf.line(18, 281, 192, 281);
  pdf.setFontSize(6.2);
  pdf.setTextColor(101, 114, 107);
  pdf.text(`Foundation-1 (Pty) Ltd · agreement version ${MIGRATION_CASE_NDA_VERSION} · ${record.ndaId}`, 18, 286);
  pdf.text(record.caseReference, 192, 286, { align: "right" });

  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    filename: migrationCaseNdaPdfFilename(record),
  };
}
