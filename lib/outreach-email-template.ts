export const FOUNDATION_EMAIL_BANNER_PATH = "/resources/email-banner-1-3.png";
export const FOUNDATION_EMAIL_BANNER_FILENAME = "Email Banner 1-3.png";
export const FOUNDATION_EMAIL_BANNER_CONTENT_ID = "foundation1-outreach-banner";
export const FOUNDATION_BROCHURE_PATH = "/resources/foundation-1-brochure.pdf";
export const FOUNDATION_BROCHURE_FILENAME = "foundation-1 Brochure.pdf";
export const FOUNDATION_OUTREACH_SUBJECT = "Zero Capex Energy Migration Proposal";

export type OutreachTemplateLead = {
  contactName?: string | null;
  company?: string | null;
  migrationEstimateUrl?: string | null;
};

function firstName(value: string | null | undefined): string {
  return value?.trim().split(/\s+/)[0] ?? "";
}

function companyShortName(value: string): string {
  return value.trim().split(/\s+/)[0] || value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

export function buildFoundationOutreachBody(lead: OutreachTemplateLead | null): string {
  const name = firstName(lead?.contactName) || "[name]";
  const company = lead?.company?.trim() || "[company]";
  const shortCompany = companyShortName(company);
  const migrationEstimateUrl = lead?.migrationEstimateUrl?.trim() || "1os.co.za";

  return [
    `Good day ${name},`,
    "",
    "I trust you are well.",
    "",
    "My name is Karman Kekana, founder of Foundation-1, an energy-as-a-service company helping South African businesses migrate to cleaner, cheaper energy with zero upfront capital expenditure.",
    "",
    `I am reaching out because ${company} appears to be exactly the kind of business that can benefit from a structured energy migration: high operational electricity demand, exposure to rising tariffs, and a clear need to protect margins without taking on infrastructure costs.`,
    "",
    `Foundation-1 can help ${company} reduce its monthly electricity spend by carrying the cost of the infrastructure, installation, maintenance, and insurance ourselves. ${shortCompany} would simply move onto a new energy tariff through a power purchase agreement. For example, if ${shortCompany} is currently paying around R3.00 per kilowatt-hour, we may be able to reduce that to around R2.00 per kilowatt-hour, and in strong cases as low as R0.98 per kilowatt-hour.`,
    "",
    "We do this through two solutions:",
    "",
    "Generocity UFMS: a full solar infrastructure solution where Foundation-1 installs, maintains, and insures the system.",
    "",
    `Lumen: a wheeling solution where power is supplied from our 56 megawatt solar farm, also with no upfront cost to ${shortCompany}.`,
    "",
    `Together, these solutions allow us to target savings of up to 60 percent on monthly electricity spend, while keeping the capital burden off ${shortCompany}’s balance sheet.`,
    "",
    `I have attached our brochure for context. You can also visit foundation-1.co.za, or generate a quick migration estimate for ${company} at ${migrationEstimateUrl} in under three minutes.`,
    "",
    "If this is worth a 20-minute conversation, I would welcome the opportunity to connect.",
  ].join("\n");
}

export function buildEmailHtmlWithFoundationBanner({
  bodyText,
  bodyHtml,
}: {
  bodyText: string;
  bodyHtml?: string | null;
  bannerContentId?: string;
}): string {
  if (bodyHtml?.trim()) {
    return bodyHtml;
  }

  return [
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">',
    textToHtml(bodyText),
    "</div>",
  ].join("");
}
