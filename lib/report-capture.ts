import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { isSuppressed, lifecycleReplyTo, websiteOrigin } from "@/lib/case-lifecycle";
import type { IndicativeMigrationReport } from "@/lib/indicative-migration-report";

/**
 * Soft capture at the top of the funnel.
 *
 * The indicative report is computed in the browser and its PDF is built there
 * too, so a prospect could take the whole thing and leave no trace. Below the
 * programme threshold they previously hit a wall with nothing recorded at all.
 *
 * Nothing here gates the report. The client already has it; this only offers to
 * send a copy and, in doing so, gives Foundation-1 someone to talk to.
 */

export type FunnelEventName =
  | "report_generated"
  | "report_captured"
  | "threshold_blocked"
  | "case_opened"
  | "bills_added"
  | "bill_pack_audited"
  | "proposal_ready"
  | "eoi_signed";

export type FunnelEventInput = {
  event: FunnelEventName;
  sessionHash?: string | null;
  email?: string | null;
  monthlySpendExVat?: number | null;
  province?: string | null;
  placeContext?: string | null;
  sourceCampaign?: string | null;
  partnerCampaignCode?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Records a named funnel step.
 *
 * Fire-and-forget by design: measurement must never break the thing it
 * measures. Callers should not await this on a critical path.
 */
export async function recordFunnelEvent(input: FunnelEventInput): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  await supabase.from("funnel_events").insert({
    event: input.event,
    session_hash: input.sessionHash ?? null,
    email_normalised: input.email?.trim().toLowerCase() || null,
    monthly_spend_ex_vat: input.monthlySpendExVat ?? null,
    province: input.province ?? null,
    place_context: input.placeContext ?? null,
    source_campaign: input.sourceCampaign ?? null,
    partner_campaign_code: input.partnerCampaignCode ?? null,
    metadata: input.metadata ?? {},
  });
}

export type ReportCaptureInput = {
  email: string;
  contactName?: string | null;
  businessName?: string | null;
  report: IndicativeMigrationReport;
  belowThreshold: boolean;
  sourceCampaign?: string | null;
  partnerCampaignCode?: string | null;
};

function money(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `R${Math.round(Math.abs(value)).toLocaleString("en-ZA")}`;
}

/**
 * The email a captured prospect receives.
 *
 * It restates their own numbers rather than marketing at them, and names one
 * next step. Below the threshold it is honest that the audit programme does not
 * open yet, and offers the route that does exist.
 */
function captureEmail(input: ReportCaptureInput, minimumSpend: number) {
  const { report } = input;
  const first = (input.contactName || "").trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hi,";
  const city = report.site?.city || "your site";
  const spend = money(report.currentPath?.monthlySpendExVat);
  const tenYear = money(report.currentPath?.tenYearUtilityCost);

  if (input.belowThreshold) {
    return {
      subject: "Your indicative electricity report",
      body: [
        greeting,
        "",
        `Here is the indicative position for ${city} based on what you entered${spend ? `: ${spend} per month` : ""}.`,
        tenYear ? `Staying on your current utility path costs an estimated ${tenYear} over ten years.` : "",
        "",
        `Our bill-audited migration programme opens at ${money(minimumSpend)} per month, so we are not going to pretend we can act on this today. We have kept your details on the register and will come back to you when a route exists for operations your size — that is most likely through an industry association or a co-operative buying group, where smaller sites are aggregated.`,
        "",
        "If your electricity spend is actually higher than the figure you entered — for example if you only counted part of the site, or excluded network and demand charges — re-run it and we can look properly.",
        "",
        `${websiteOrigin()}/pricing`,
      ].filter(Boolean),
    };
  }

  return {
    subject: "Your indicative electricity report",
    body: [
      greeting,
      "",
      `Here is the indicative position for ${city}${spend ? `, based on ${spend} per month` : ""}.`,
      tenYear ? `Staying on your current utility path costs an estimated ${tenYear} over ten years.` : "",
      "",
      "That figure is an area estimate. It is anchored on a representative local tariff, not on your actual account, so treat it as a direction of travel rather than a quote.",
      "",
      "The exact position comes from your own bills. Six billing periods let us read your true blended tariff, the split between energy and fixed network charges, and whether each pathway genuinely beats your utility path over ten years. That audit is free and produces a decision-grade proposal.",
      "",
      `Start the audit: ${websiteOrigin()}/pricing`,
      "",
      "If a number looks wrong, reply to this email — we would rather be challenged than ignored.",
    ].filter(Boolean),
  };
}

/**
 * Stores a capture and sends the prospect their report summary.
 * Returns false only when storage is unavailable; a failed email is not
 * treated as a failed capture.
 */
export async function captureIndicativeReport(
  input: ReportCaptureInput,
  minimumSpend: number,
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const email = input.email.trim().toLowerCase();
  const { report } = input;

  const { error } = await supabase.from("report_captures").insert({
    email_normalised: email,
    contact_name: input.contactName?.trim().slice(0, 160) || null,
    business_name: input.businessName?.trim().slice(0, 180) || null,
    site_city: report.site?.city ?? null,
    province: report.site?.province ?? null,
    supply_type: report.site?.supplyType ?? null,
    monthly_spend_ex_vat: report.currentPath?.monthlySpendExVat ?? null,
    tariff_family: report.tariffContext?.anchor?.id ?? null,
    below_threshold: input.belowThreshold,
    report,
    source_campaign: input.sourceCampaign ?? null,
    partner_campaign_code: input.partnerCampaignCode ?? null,
  });
  if (error) return false;

  void recordFunnelEvent({
    event: input.belowThreshold ? "threshold_blocked" : "report_captured",
    email,
    monthlySpendExVat: report.currentPath?.monthlySpendExVat ?? null,
    province: report.site?.province ?? null,
    placeContext: report.site?.placeContext ?? null,
    sourceCampaign: input.sourceCampaign ?? null,
    partnerCampaignCode: input.partnerCampaignCode ?? null,
  }).catch(() => undefined);

  // Never mail an address that has opted out, even for a report they asked for.
  if (await isSuppressed(email)) return true;

  const built = captureEmail(input, minimumSpend);
  void sendEmail({
    to: email,
    replyTo: lifecycleReplyTo(),
    subject: built.subject,
    text: [...built.body, "", "Foundation-1 (Pty) Ltd", lifecycleReplyTo()].join("\n"),
    tags: [{ name: "capture", value: input.belowThreshold ? "below-threshold" : "report" }],
  }).catch(() => undefined);

  return true;
}

export { captureEmail as buildReportCaptureEmail };
