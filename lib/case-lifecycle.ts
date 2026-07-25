import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { issueCaseEmailLinkToken } from "@/lib/case-email-links";
import type { MigrationCaseRow } from "@/lib/migration-case-store";

/**
 * Case lifecycle communication.
 *
 * The migration pipeline moves through thirteen stages. Before this module
 * existed only three of them spoke to the client, so the most valuable moment
 * in the journey — a completed bill-audited proposal — produced silence.
 *
 * Every message is written once to `migration_case_lifecycle_messages` keyed by
 * (case_id, message_key). That makes delivery exactly-once and lets the daily
 * tick run repeatedly without ever sending a duplicate.
 *
 * Suppression is checked before every send: an address on the suppression list
 * is never contacted again, for any reason.
 */

const SIGN_OFF = ["Foundation-1 (Pty) Ltd", "support@foundation-1.co.za"];

export type LifecycleMessageKey =
  | "bill_pack_received"
  | "proposal_ready"
  | "proposal_gap"
  | "bill_pack_needs_attention"
  | "kyc_ready"
  | "submitted_to_funder"
  | "partner_proposal_ready"
  | "partner_proposal_signed"
  | "kyc_verified"
  | "kyc_handed_off"
  | "term_sheet_issued"
  | "reminder_bill_pack_d1"
  | "reminder_bill_pack_d3"
  | "reminder_bill_pack_d7"
  | "reminder_bill_pack_d14"
  | "reminder_review_d2"
  | "reminder_eoi_d3"
  | "reminder_eoi_d7";

type Template = { subject: string; body: string[] };

export type LifecycleContext = {
  /** Plain-language blockers shown to the client when a pack needs attention. */
  blockers?: string[];
  /** Year-one monthly difference, negative means the bill goes down. */
  monthlySaving?: number | null;
  tenYearDifference?: number | null;
  slaDueAt?: string | null;
  recipientLabel?: string | null;
  termSheetPathway?: string | null;
};

export function websiteOrigin() {
  return (process.env.NEXT_PUBLIC_WEBSITE_ORIGIN || "https://foundation-1.co.za").replace(/\/+$/, "");
}

function supportEscape() {
  const whatsapp = process.env.SUPPORT_WHATSAPP_URL?.trim();
  return whatsapp
    ? `If anything is unclear, reply to this email or message us on WhatsApp: ${whatsapp}`
    : "If anything is unclear, reply to this email and a person will help you.";
}

function rand(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `R${Math.round(Math.abs(value)).toLocaleString("en-ZA")}`;
}

/**
 * Every client-facing message in the pipeline. Each one names the single next
 * action; none of them ask the client to guess.
 */
function template(
  key: LifecycleMessageKey,
  caseRow: MigrationCaseRow,
  portalUrl: string,
  context: LifecycleContext,
): Template | null {
  const ref = caseRow.public_reference;
  const first = (caseRow.contact_name || "there").split(/\s+/)[0];
  const business = caseRow.business_name;

  switch (key) {
    case "bill_pack_received":
      return {
        subject: `${ref}: your bill pack is being audited`,
        body: [
          `Hi ${first},`,
          "",
          `We have received the complete bill pack for ${business} and the audit is running now.`,
          "",
          "Every billing period is read individually: supplier, tariff, billing dates, consumption, fixed charges, VAT and any rebill or correction. We do not estimate what a bill already states.",
          "",
          "This usually completes within minutes. We will email you the moment the bill-audited proposal is finished — you do not need to keep the page open.",
          "",
          `Your case: ${portalUrl}`,
        ],
      };

    case "proposal_ready": {
      const saving = rand(context.monthlySaving);
      const tenYear = rand(context.tenYearDifference);
      return {
        subject: `${ref}: your bill-audited proposal is ready`,
        body: [
          `Hi ${first},`,
          "",
          `The audit of your six billing periods is complete and the bill-audited migration proposal for ${business} is ready.`,
          "",
          saving
            ? `Modelled year-one movement: ${saving} per month against your current utility path.`
            : "The proposal sets out the modelled year-one and ten-year position against your current utility path.",
          tenYear ? `Modelled ten-year difference: ${tenYear}.` : "",
          "",
          "These figures come from your own bills, not from an area estimate. The proposal shows every assumption, the system sizing, and the limits of what the evidence supports.",
          "",
          "The next step is the non-binding Expression of Interest. It creates no obligation to transact — it records your interest and releases the full proposal and its underlying workings.",
          "",
          `Review your proposal: ${portalUrl}`,
          "",
          supportEscape(),
        ].filter(Boolean),
      };
    }

    case "proposal_gap":
      return {
        subject: `${ref}: your bill audit is complete`,
        body: [
          `Hi ${first},`,
          "",
          `The audit of your six billing periods for ${business} is complete.`,
          "",
          "On the evidence in your bills, the modelled complete solution cost does not currently sit below your utility path. We are telling you this plainly rather than presenting a saving that your own bills do not support.",
          "",
          "That is not the end of the matter. Tariff structure, site sizing, load profile and product pathway all move this result, and so does the annual utility increase. The full gap report sets out exactly which factors are working against the case and what would need to change.",
          "",
          "The non-binding Expression of Interest releases that full report and allows Foundation-1 to retain and reassess the opportunity as pricing and pathways change. It does not accept the current configuration or its costs.",
          "",
          `Review the outcome: ${portalUrl}`,
          "",
          supportEscape(),
        ],
      };

    case "bill_pack_needs_attention": {
      const blockers = (context.blockers ?? []).filter(Boolean).slice(0, 6);
      return {
        subject: `${ref}: your bill pack needs one correction`,
        body: [
          `Hi ${first},`,
          "",
          `We read every file you submitted for ${business}, but the pack cannot be audited yet. Here is exactly what is missing:`,
          "",
          ...blockers.map((blocker) => `  •  ${blocker}`),
          blockers.length ? "" : "  •  The pack did not contain six recognisable billing periods.",
          "",
          "Nothing is lost and nothing is rejected. Add or replace the affected files and submit the pack again — the audit restarts automatically.",
          "",
          `Resubmit here: ${portalUrl}`,
          "",
          supportEscape(),
        ].filter((line, index, all) => !(line === "" && all[index - 1] === "")),
      };
    }

    case "kyc_ready":
      return {
        subject: `${ref}: your pack is funder-ready`,
        body: [
          `Hi ${first},`,
          "",
          `Your readiness confirmation is recorded and the case for ${business} is now queued for funder submission.`,
          "",
          "Foundation-1 submits complete packs in batches. We will email you on the day yours goes across, together with the date by which the funder is expected to respond.",
          "",
          "Nothing is required from you right now.",
          "",
          `Your case: ${portalUrl}`,
        ],
      };

    case "submitted_to_funder": {
      const due = context.slaDueAt
        ? new Date(context.slaDueAt).toLocaleDateString("en-ZA", { dateStyle: "long" })
        : null;
      return {
        subject: `${ref}: submitted to the funder`,
        body: [
          `Hi ${first},`,
          "",
          `The complete bankable pack for ${business} has been submitted to the funder.`,
          "",
          due ? `A response is expected by ${due}.` : "We are tracking the response against an agreed service level.",
          "",
          "We chase this on your behalf. If the funder is late, we escalate — you do not need to follow up.",
          "",
          `Your case: ${portalUrl}`,
        ],
      };
    }

    case "partner_proposal_ready":
      return {
        subject: `${ref}: your formal proposal has arrived`,
        body: [
          `Hi ${first},`,
          "",
          `The formal pathway proposal for ${business} has been issued and is waiting in your case.`,
          "",
          "Download it, review the terms against the bill-audited assessment we prepared, and return a signed copy through the same page. Both documents stay side by side so you can compare them line by line.",
          "",
          `Review and sign: ${portalUrl}`,
          "",
          supportEscape(),
        ],
      };

    case "partner_proposal_signed":
      return {
        subject: `${ref}: signed proposal received`,
        body: [
          `Hi ${first},`,
          "",
          `We have your signed formal proposal for ${business}. Thank you.`,
          "",
          "The next step is your KYC pack — six documents, uploaded securely in your case as you gather them. You do not need them all at once.",
          "",
          `Continue here: ${portalUrl}`,
        ],
      };

    case "kyc_verified":
      return {
        subject: `${ref}: your KYC pack is verified`,
        body: [
          `Hi ${first},`,
          "",
          `All six KYC documents for ${business} have been checked and verified.`,
          "",
          "Your pack is now complete. Foundation-1 releases it to the funder under a recorded handoff, and we will confirm the moment that happens.",
          "",
          `Your case: ${portalUrl}`,
        ],
      };

    case "kyc_handed_off":
      return {
        subject: `${ref}: your pack is with the funder`,
        body: [
          `Hi ${first},`,
          "",
          `Your verified pack for ${business} has been formally handed to ${context.recipientLabel || "the funder"}.`,
          "",
          "A record of exactly which documents were released, and when, is held in your case for your own audit trail.",
          "",
          "The term sheet is the next milestone. We will tell you the moment it is issued.",
          "",
          `Your case: ${portalUrl}`,
        ],
      };

    case "term_sheet_issued":
      return {
        subject: `${ref}: your term sheet has been issued`,
        body: [
          `Hi ${first},`,
          "",
          `A term sheet has been issued for ${business}${context.termSheetPathway ? ` on the ${context.termSheetPathway} pathway` : ""}.`,
          "",
          "This is the milestone the whole migration has been working toward. It is available in your case now, alongside every document and decision that produced it.",
          "",
          `Review your term sheet: ${portalUrl}`,
          "",
          supportEscape(),
        ],
      };

    case "reminder_bill_pack_d1":
      return {
        subject: `${ref}: the six bills we need`,
        body: [
          `Hi ${first},`,
          "",
          `Your migration case for ${business} is open and waiting for one thing: your six most recent utility bills.`,
          "",
          "Most operations already have these as PDFs from their supplier portal or as email attachments. If you use Eskom's online account, they download in a couple of minutes.",
          "",
          "Until real bills are read, everything we have shown you is an area estimate. The bills are what turn it into a proposal you can act on.",
          "",
          `Submit your bills: ${portalUrl}`,
          "",
          supportEscape(),
        ],
      };

    case "reminder_bill_pack_d3":
      return {
        subject: `${ref}: still holding your case open`,
        body: [
          `Hi ${first},`,
          "",
          `We are holding the migration case for ${business} open.`,
          "",
          "If the bills are difficult to gather, tell us which supplier and account you are on and we will tell you exactly where to find them. If you would rather send them another way, reply to this email and we will take them from there.",
          "",
          `Your case: ${portalUrl}`,
          "",
          supportEscape(),
        ],
      };

    case "reminder_bill_pack_d7":
      return {
        subject: `${ref}: what your bills would tell us`,
        body: [
          `Hi ${first},`,
          "",
          `Your case for ${business} is still open and still waiting on the six billing periods.`,
          "",
          "It is worth saying what the audit actually produces: your true blended tariff, the split between energy and fixed network charges, the shape of your load, and whether each product pathway genuinely beats your utility path over ten years. Operations are regularly surprised by their own numbers.",
          "",
          "It takes one upload.",
          "",
          `Submit your bills: ${portalUrl}`,
          "",
          supportEscape(),
        ],
      };

    case "reminder_bill_pack_d14":
      return {
        subject: `${ref}: keeping your case on file`,
        body: [
          `Hi ${first},`,
          "",
          `We have not received the utility bills for ${business}, so we are moving this case to standby.`,
          "",
          "Nothing is deleted. Your indicative report and your secure link stay valid, and you can submit the bills whenever the timing is better.",
          "",
          "If the timing is simply wrong, replying to tell us so is genuinely useful — it stops us contacting you unnecessarily.",
          "",
          `Your case: ${portalUrl}`,
        ],
      };

    case "reminder_review_d2":
      return {
        subject: `${ref}: your bill pack is still waiting on one fix`,
        body: [
          `Hi ${first},`,
          "",
          `The bill pack for ${business} still needs the correction we flagged, and the audit cannot run until it is in.`,
          "",
          "If it is not obvious what is wrong, reply to this email and a person will look at your pack directly and tell you exactly which file to replace.",
          "",
          `Your case: ${portalUrl}`,
          "",
          supportEscape(),
        ],
      };

    case "reminder_eoi_d3":
      return {
        subject: `${ref}: your proposal is waiting`,
        body: [
          `Hi ${first},`,
          "",
          `Your bill-audited proposal for ${business} is complete and has not been opened yet.`,
          "",
          "The non-binding Expression of Interest releases the full report — every calculation, assumption and limitation behind the numbers. It commits you to nothing.",
          "",
          `Open your proposal: ${portalUrl}`,
          "",
          supportEscape(),
        ],
      };

    case "reminder_eoi_d7":
      return {
        subject: `${ref}: anything you want challenged?`,
        body: [
          `Hi ${first},`,
          "",
          `Your proposal for ${business} has been sitting complete for a week.`,
          "",
          "If a number in it looks wrong, we would rather hear that than have you walk away quietly. The whole model is built from your bills and we will show our working on any line you want to test.",
          "",
          `Your proposal: ${portalUrl}`,
          "",
          supportEscape(),
        ],
      };

    default:
      return null;
  }
}

/** An address on the suppression list is never contacted again. */
export async function isSuppressed(email: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("outreach_suppressions")
    .select("id")
    .eq("email_normalised", email.trim().toLowerCase())
    .limit(1);
  if (error) return false;
  return Boolean(data?.length);
}

/**
 * Sends one lifecycle message, exactly once per case.
 *
 * Returns the outcome rather than throwing: a failed notification must never
 * break the pipeline transition that triggered it.
 */
export async function sendCaseLifecycleMessage(
  caseRow: MigrationCaseRow,
  key: LifecycleMessageKey,
  context: LifecycleContext = {},
): Promise<"sent" | "duplicate" | "suppressed" | "skipped" | "failed"> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return "skipped";

  // Claim the message first. The unique constraint makes this the lock: if the
  // insert conflicts, another run already owns this message.
  const { error: claimError } = await supabase
    .from("migration_case_lifecycle_messages")
    .insert({
      case_id: caseRow.id,
      message_key: key,
      channel: "email",
      recipient: caseRow.contact_email,
      outcome: "sent",
    });
  if (claimError) {
    return claimError.code === "23505" ? "duplicate" : "failed";
  }

  const finish = async (outcome: "sent" | "suppressed" | "failed", detail?: string) => {
    await supabase
      .from("migration_case_lifecycle_messages")
      .update({ outcome, detail: detail?.slice(0, 500) ?? null })
      .eq("case_id", caseRow.id)
      .eq("message_key", key);
  };

  if (!caseRow.contact_email) {
    await finish("failed", "No contact email on the case.");
    return "failed";
  }
  if (await isSuppressed(caseRow.contact_email)) {
    await finish("suppressed", "Recipient is on the suppression list.");
    return "suppressed";
  }

  // A stable deep link: following it mints a fresh workspace token, so the
  // client never has to hunt for an older email.
  const linkToken = await issueCaseEmailLinkToken(caseRow);
  const portalUrl = linkToken
    ? `${websiteOrigin()}/c/${linkToken}`
    : `${websiteOrigin()}/login`;

  const built = template(key, caseRow, portalUrl, context);
  if (!built) {
    await finish("failed", `No template for ${key}.`);
    return "failed";
  }

  const result = await sendEmail({
    to: caseRow.contact_email,
    replyTo: "support@foundation-1.co.za",
    subject: built.subject,
    text: [...built.body, "", ...SIGN_OFF].join("\n"),
    tags: [{ name: "lifecycle", value: key.replace(/_/g, "-") }],
  });

  if (result.ok) {
    await finish("sent");
    return "sent";
  }
  await finish("failed", "skipped" in result && result.skipped ? result.reason : result.error);
  return "failed";
}

export { template as buildLifecycleTemplate };
