import { jsPDF } from "jspdf";
import { sanitizeFileSegment } from "@/lib/download-utils";
import type { EoiTemplateLead } from "@/lib/eoi-template";
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
// Foundation-1 signed Expression of Interest (assessment journey), print
// layer. House document design system: the letter as the centrepiece under
// the NON-BINDING EXPRESSION OF INTEREST header treatment, with the digital
// signature record. Client-facing: no funder or partner is ever named.
// =============================================================================

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
    title: `Signed Expression of Interest: ${record.company}`,
    subject: "Non-binding renewable-energy supply Expression of Interest",
    author: "Foundation-1 (Pty) Ltd",
    creator: "Foundation-1 1OS Digital Signature",
  });
  const signedDate = kitLongDate(record.eoiSignedAt);
  const context = `PROFILE ${record.clientProfileId}`;

  paintPaper(pdf);
  coverGridTexture(pdf, { fadeBottomY: 58 });
  brandLockup(pdf, KIT_PAGE.margin, 10.2);
  monoLabel(pdf, `${context} \u00b7 ${signedDate}`, KIT_PAGE.width - KIT_PAGE.margin, 14.8, {
    size: 6.2,
    alpha: KIT_INK.faint,
    trackingEm: 0.14,
    align: "right",
  });

  eyebrow(pdf, "NON-BINDING EXPRESSION OF INTEREST", KIT_PAGE.margin, 32);
  drawText(pdf, "Expression of Interest.", KIT_PAGE.margin, 43, { weight: "bold", size: 24 });
  drawText(pdf, "Renewable energy supply.", KIT_PAGE.margin, 53, { weight: "bold", size: 24, color: inkTint(KIT_INK.faint) });
  monoLabel(pdf, "NON-BINDING \u00b7 SUBJECT TO CONTRACT \u00b7 RECORDED DIGITALLY", KIT_PAGE.margin, 60.5, {
    size: 6.2,
    alpha: KIT_INK.dim,
    trackingEm: 0.13,
  });

  // The business letterhead, populated from the assessment profile.
  let y = 68;
  const letterheadLines = [
    record.businessRegistrationNumber ? `Registration ${record.businessRegistrationNumber}` : "Registration number not supplied",
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
  drawText(pdf, record.company, KIT_PAGE.margin + 5.6, y + 12.6, { weight: "bold", size: 11 });
  letterheadLines.forEach((line, index) => {
    drawText(pdf, line, KIT_PAGE.margin + 5.6, y + 18.2 + index * 4.1, { size: 6.8, color: inkTint(KIT_INK.dim, KIT_COLORS.panel) });
  });
  y += letterheadHeight + 9;

  // The letter, set directly on the paper.
  monoLabel(pdf, "TO \u00b7 FOUNDATION-1 (PTY) LTD", KIT_PAGE.margin, y, { alpha: KIT_INK.dim, size: 6.4 });
  y += 8.5;
  const letterStyle = { size: 9.6, color: inkTint(0.86) } as const;
  for (const letterParagraph of bodyText(record)) {
    y = paragraph(pdf, letterParagraph, KIT_PAGE.margin, y, letterStyle, KIT_PAGE.contentWidth, { lineHeight: 5.2 });
    y += 3.4;
  }
  y += 2;
  drawText(pdf, "Kind regards,", KIT_PAGE.margin, y, letterStyle);

  // Signature block.
  y = Math.max(y + 15, 208);
  drawText(pdf, record.eoiSignedBy, KIT_PAGE.margin + 2, y, { font: "times", weight: "italic", size: 15 });
  hairline(pdf, KIT_PAGE.margin, y + 3, KIT_PAGE.margin + 72, y + 3, { alpha: 0.3 });
  monoLabel(pdf, "SIGNATURE \u00b7 DIGITALLY RECORDED", KIT_PAGE.margin, y + 7.6, { size: 5.6, alpha: KIT_INK.faint, trackingEm: 0.12 });
  drawText(pdf, record.eoiSignedBy, KIT_PAGE.margin + 108, y, { weight: "bold", size: 9.4 });
  hairline(pdf, KIT_PAGE.margin + 108, y + 3, KIT_PAGE.width - KIT_PAGE.margin, y + 3, { alpha: 0.3 });
  monoLabel(pdf, record.userProfile.role ? `NAME \u00b7 ${record.userProfile.role.toUpperCase()}` : "NAME \u00b7 AUTHORISED REPRESENTATIVE", KIT_PAGE.margin + 108, y + 7.6, {
    size: 5.6,
    alpha: KIT_INK.faint,
    trackingEm: 0.12,
  });

  // Digital signature record.
  const signedAtText = new Date(record.eoiSignedAt).toLocaleString("en-ZA", { dateStyle: "long", timeStyle: "short" });
  const recordY = 245;
  const recordHeight = 25;
  panel(pdf, KIT_PAGE.margin, recordY, KIT_PAGE.contentWidth, recordHeight);
  accentBar(pdf, KIT_PAGE.margin, recordY, recordHeight, KIT_COLORS.green);
  monoLabel(pdf, "DIGITAL SIGNATURE RECORD", KIT_PAGE.margin + 5.6, recordY + 6, {
    size: 5.8,
    color: blend(KIT_COLORS.green, 0.85, KIT_COLORS.panel),
    trackingEm: 0.14,
  });
  drawText(pdf, record.eoiSignedBy, KIT_PAGE.margin + 5.6, recordY + 12.4, { weight: "bold", size: 11 });
  drawText(
    pdf,
    `${record.userProfile.role || "Authorised representative"} \u00b7 ${record.company} \u00b7 ${record.businessRegistrationNumber || "Registration number not supplied"}`,
    KIT_PAGE.margin + 5.6,
    recordY + 17,
    { size: 7, color: inkTint(KIT_INK.dim, KIT_COLORS.panel) },
  );
  drawText(
    pdf,
    `Signed ${signedAtText} \u00b7 Terms accepted \u00b7 Signature record ${record.eoiSignatureId}`,
    KIT_PAGE.margin + 5.6,
    recordY + 21.2,
    { size: 6.4, color: inkTint(KIT_INK.faint, KIT_COLORS.panel) },
  );

  footerBand(pdf, "Expression of Interest", context);
  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    filename: signedEoiPdfFilename(record.company),
  };
}
