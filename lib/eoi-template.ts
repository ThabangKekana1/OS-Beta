import { sanitizeFileSegment } from "@/lib/download-utils";

export type EoiTemplateLead = {
  clientProfileId: string;
  company: string;
  businessRegistrationNumber: string;
  contactName: string;
  physicalAddress: string;
  monthlyElectricitySpendEstimateZar?: number;
  userProfile: {
    phone: string;
    role: string;
  };
};

type BuildEoiTemplateOptions = {
  signedBy?: string | null;
  signedAt?: string | null;
  signatureId?: string | null;
};

export const EOI_TEMPLATE_TITLE = "Expression of Interest";

function formatSignedTimestamp(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZoneName: "short",
  }).format(parsed);
}

export function buildEoiTemplateText(
  lead: EoiTemplateLead,
  options: BuildEoiTemplateOptions = {},
) {
  const signedBy = options.signedBy?.trim() ?? "";
  const signedAt = formatSignedTimestamp(options.signedAt);
  const signatureId = options.signatureId?.trim() ?? "";
  const clientName = signedBy || lead.contactName;

  return [
    "EXPRESSION OF INTEREST: RENEWABLE ENERGY SUPPLY",
    "",
    "To Whom It May Concern: Green Share VPP",
    "",
    `${lead.company} has been approached by Green Share VPP, to supply Renewable Energy to ${lead.company} sites for operation of its facilities.`,
    "",
    "Subject to the receipt of the relevant approvals, we hereby confirm our interest to procure renewable energy from Green Share VPP and would like to enter into an information sharing and terms formulation period with the intent of reaching commercial and technical alignment. We hereby request you to commence your engagement with the relevant stakeholder in order to procure the approvals required to make the said terms available.",
    "",
    `Should we reach commercial and technical alignment, ${lead.company} would want to explore entering into a comprehensive Zero-Capex Solar agreement.`,
    "",
    `This letter is a non-binding expression of interest, and remains subject to a contract between the parties. There is no intention that the content of this letter shall create legal relations between ${lead.company} and Green Share VPP.`,
    "",
    "Kind Regards,",
    "",
    clientName,
    lead.userProfile.role,
    lead.company,
    lead.businessRegistrationNumber,
    `1OS Profile Number: ${lead.clientProfileId}`,
    "",
    signedAt ? `Digitally approved by ${clientName}` : "Awaiting digital approval",
    signedAt ? `Digital signature ID: ${signatureId || "Not recorded"}` : "Digital signature ID: assigned on approval",
    signedAt ? `Timestamp: ${signedAt}` : "Timestamp: assigned on approval",
  ].join("\n");
}

export function buildEoiTemplateFilename(company: string) {
  const companySlug = sanitizeFileSegment(company) || "client";
  return `${companySlug}-expression-of-interest.txt`;
}

export function buildEoiTemplatePdfFilename(company: string) {
  const companySlug = sanitizeFileSegment(company) || "client";
  return `${companySlug}-expression-of-interest.pdf`;
}

export async function buildEoiTemplatePdf(
  lead: EoiTemplateLead,
  options: BuildEoiTemplateOptions = {},
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 in points
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 56;
  const pageWidth = page.getWidth();
  const maxWidth = pageWidth - margin * 2;
  const bodySize = 11;
  const lineHeight = 15;
  let cursorY = page.getHeight() - margin;

  const wrap = (text: string, currentFont = font, fontSize = bodySize) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (currentFont.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
        if (current.length > 0) lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current.length > 0) lines.push(current);
    return lines;
  };

  const writeBlock = (text: string, opts: { bold?: boolean; size?: number; gap?: number } = {}) => {
    const useFont = opts.bold ? boldFont : font;
    const size = opts.size ?? bodySize;
    if (text.trim().length === 0) {
      cursorY -= lineHeight * 0.6;
      return;
    }
    const lines = wrap(text, useFont, size);
    for (const line of lines) {
      if (cursorY < margin) {
        const newPage = pdf.addPage([595.28, 841.89]);
        cursorY = newPage.getHeight() - margin;
      }
      page.drawText(line, {
        x: margin,
        y: cursorY,
        size,
        font: useFont,
        color: rgb(0.08, 0.08, 0.08),
      });
      cursorY -= lineHeight;
    }
    if (opts.gap) {
      cursorY -= opts.gap;
    }
  };

  const signedBy = options.signedBy?.trim() ?? "";
  const signedAt = formatSignedTimestamp(options.signedAt);
  const signatureId = options.signatureId?.trim() ?? "";
  const clientName = signedBy || lead.contactName;

  writeBlock("EXPRESSION OF INTEREST: RENEWABLE ENERGY SUPPLY", {
    bold: true,
    size: 14,
    gap: 8,
  });
  writeBlock("To Whom It May Concern: Green Share VPP", { bold: true, gap: 6 });
  writeBlock(
    `${lead.company} has been approached by Green Share VPP, to supply Renewable Energy to ${lead.company} sites for operation of its facilities.`,
    { gap: 6 },
  );
  writeBlock(
    "Subject to the receipt of the relevant approvals, we hereby confirm our interest to procure renewable energy from Green Share VPP and would like to enter into an information sharing and terms formulation period with the intent of reaching commercial and technical alignment. We hereby request you to commence your engagement with the relevant stakeholder in order to procure the approvals required to make the said terms available.",
    { gap: 6 },
  );
  writeBlock(
    `Should we reach commercial and technical alignment, ${lead.company} would want to explore entering into a comprehensive Zero-Capex Solar agreement.`,
    { gap: 6 },
  );
  writeBlock(
    `This letter is a non-binding expression of interest, and remains subject to a contract between the parties. There is no intention that the content of this letter shall create legal relations between ${lead.company} and Green Share VPP.`,
    { gap: 14 },
  );

  writeBlock("Kind Regards,", { gap: 6 });
  writeBlock(clientName, { bold: true });
  writeBlock(lead.userProfile.role);
  writeBlock(lead.company);
  writeBlock(lead.businessRegistrationNumber);
  writeBlock(`1OS Profile Number: ${lead.clientProfileId}`, { gap: 14 });

  writeBlock(signedAt ? `Digitally approved by ${clientName}` : "Awaiting digital approval", {
    bold: true,
  });
  writeBlock(
    signedAt
      ? `Digital signature ID: ${signatureId || "Not recorded"}`
      : "Digital signature ID: assigned on approval",
  );
  writeBlock(signedAt ? `Timestamp: ${signedAt}` : "Timestamp: assigned on approval");

  return await pdf.save();
}
