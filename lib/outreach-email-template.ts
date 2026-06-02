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
  const migrationEstimateUrl = lead?.migrationEstimateUrl?.trim() || "https://www.1os.co.za/migration/start";

  return [
    `Good day ${name},`,
    "",
    "I trust you are well.",
    "",
    "My name is Karman Kekana, founder of Foundation-1, an energy-as-a-service company based in Johannesburg.",
    "",
    `I am reaching out because I came across ${company} on our google map search of potential solar targets and thought I should reach out and see what might be ${company} appetite to migrate 100% to clean energy and potentially save up to 60% on monthly electricty spend with zero capital commitment.`,
    "",
    `I think we can help ${company} reduce its monthly electricity spend, carry the cost of the infrastructure, installation, maintenance, and insurance ourselves. ${shortCompany} would simply move onto a new energy tariff through a power purchase agreement from us. For example, if ${shortCompany} is currently paying around R3.00 per kilowatt-hour, we may be able to reduce that to around R2.00 per kilowatt-hour, and in strong cases as low as R0.98 per kilowatt-hour.`,
    "",
    "If this might be of interest to you, I would really love to have conversation, and or perhaps if you could make an introduction to the right persons to engage with.",
    "",
    `I have attached our brochure for context. You can also visit foundation-1.co.za,; you can also generate a quick migration estimate for ${company} at ${migrationEstimateUrl} using our calculator, it takes less than a minute.`,
    "",
    "If this is worth a chat I will be hoping to hear from you.",
    "",
    "Thanks,",
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
