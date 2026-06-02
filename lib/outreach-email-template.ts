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
  const migrationEstimateUrl = lead?.migrationEstimateUrl?.trim() || "https://www.1os.co.za";

  return [
    `Good day ${name},`,
    "",
    "I trust you are well.",
    "",
    "My name is Karman Kekana, founder of Foundation-1, an energy-as-a-service company based in Johannesburg.",
    "",
    `I came across ${company} while mapping potential energy migration candidates and thought it would be worth reaching out. Given the nature of your operations, I wanted to see whether ${company} has an appetite to migrate to cleaner energy and potentially reduce monthly electricity spend by up to 60 percent, with zero capital commitment.`,
    "",
    `Foundation-1 carries the cost of the infrastructure, installation, maintenance, and insurance. ${company} would simply move onto a new energy tariff through a power purchase agreement. For example, if ${shortCompany} currently pays around R2.00 per kilowatt-hour through Eskom, we could potentially reduce that to around R1.20c per kilowatt-hour, and in strong cases as low as R0.98 per kilowatt-hour.`,
    "",
    "The added benefit is no more load-shedding.",
    "",
    `I have attached our brochure for context. You can also visit foundation-1.co.za, or generate a quick migration estimate for ${company} at ${migrationEstimateUrl} in under a minute.`,
    "",
    "Since launching in April, we are already migrating five companies and saving them collectively over R25 million over the next ten years, without them spending a cent on infrastructure or maintenance. It is as simple as switching from Eskom to Foundation-1. We have opened our doors and I hope you will join us on the journey to a greener future.",
    "",
    "Thanks, and will be hoping to hear from you.",
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
