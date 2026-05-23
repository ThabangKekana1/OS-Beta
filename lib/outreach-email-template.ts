export const FOUNDATION_EMAIL_BANNER_PATH = "/resources/email-banner-1-3.png";
export const FOUNDATION_EMAIL_BANNER_FILENAME = "Email Banner 1-3.png";
export const FOUNDATION_EMAIL_BANNER_CONTENT_ID = "foundation1-outreach-banner";
export const FOUNDATION_BROCHURE_PATH = "/resources/foundation-1-brochure.pdf";
export const FOUNDATION_BROCHURE_FILENAME = "foundation-1 Brochure.pdf";
export const FOUNDATION_OUTREACH_SUBJECT = "Zero-Cost Solar Proposal";

export type OutreachTemplateLead = {
  contactName?: string | null;
  company?: string | null;
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
  const name = firstName(lead?.contactName) || "[Name]";
  const company = lead?.company?.trim();
  const companyLowerPlaceholder = company || "[company name]";
  const companyTitlePlaceholder = company || "[Company Name]";

  return [
    `Good day ${name},`,
    "",
    "I hope you are well.",
    "",
    "My name is Karman Kekana, the founder of Foundation-1, an energy-as-a-service company based in Johannesburg.",
    "",
    "I am reaching out because I would like to have a discussion to reduce your electricity costs through zero-capex energy solutions.",
    "",
    `For ${companyLowerPlaceholder}, our Generocity solar solution can help save up to 45% on monthly electricity spend. This means there is no upfront payment for the solar panels, installation, maintenance, or insurance.. these are 100% taken care of. There are also no separate monthly payments for the system. You only pay your new electricity tariff, which is structured to be lower than your current electricity cost.. this also means no more load shedding.`,
    "",
    `The solar infrastructure remains owned by our development financier. In return, ${companyTitlePlaceholder} gets access to the system, full maintenance support, insurance cover, and reduced exposure to load shedding without carrying the capital cost of buying the system.`,
    "",
    "Foundation-1 also offers Lumen, backed by a 56 megawatt solar farm in the Free State. We would bring electricity to your business premises through a process called wheeling, should your electricity spend be much higher, you also pay nothing upfront, pay nothing during the course except for your new and improved monthly tarrif.",
    "",
    "",
    "I hope our energy-as-a-service model excites you and would like to ask if this might be of interest to for further discussion?",
    "",
    "Thanks, and I will be hoping to hear from you.",
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
