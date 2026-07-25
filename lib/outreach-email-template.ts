export const FOUNDATION_EMAIL_BANNER_PATH = "/resources/email-banner-1-3.png";
export const FOUNDATION_EMAIL_BANNER_FILENAME = "Email Banner 1-3.png";
export const FOUNDATION_EMAIL_BANNER_CONTENT_ID = "foundation1-outreach-banner";
export const FOUNDATION_BROCHURE_PATH = "/resources/foundation-1-brochure.pdf";
export const FOUNDATION_BROCHURE_FILENAME = "foundation-1 Brochure.pdf";
export const FOUNDATION_OUTREACH_SUBJECT = "Switch energy tariffs and save up to 60%";

export type OutreachTemplateLead = {
  contactName?: string | null;
  company?: string | null;
  migrationEstimateUrl?: string | null;
};

function firstName(value: string | null | undefined): string {
  return value?.trim().split(/\s+/)[0] ?? "";
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

  return [
    `Good day ${name},`,
    "",
    "Foundation-1 helps South African agribusinesses switch from Eskom to a clean-energy PPA tariff—saving qualifying businesses up to 60% on electricity costs.",
    "",
    "There is no infrastructure purchase, maintenance or insurance required. Send us six months of utility bills, and we’ll prepare a migration report showing your projected tariff and savings over the PPA term.",
    "",
    "I’ve attached a short presentation. Are you available for a brief conversation to assess your potential savings?",
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
