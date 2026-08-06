import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { lifecycleReplyTo, websiteOrigin } from "@/lib/case-lifecycle";
import {
  ASSOCIATION_OUTREACH_STAGES,
  type AssociationOutreachStage,
} from "@/lib/association-stages";

export { ASSOCIATION_OUTREACH_STAGES };
export type { AssociationOutreachStage };

/**
 * Association secretariat outreach.
 *
 * A different motion from cold SME email. There are roughly thirty of these
 * bodies, each one gating hundreds of qualifying members, so the unit of work
 * is a relationship rather than a send. Every touch is logged and the record
 * carries its own stage.
 */

export type AssociationRecord = {
  id: string;
  name: string;
  sector: string | null;
  referral_code: string;
  website: string | null;
  member_base: string | null;
  product_fit: string | null;
  partnership_angle: string | null;
  why_it_matters: string | null;
  recommended_action: string | null;
  priority_tier: number | null;
  priority_score: number | null;
  outreach_stage: AssociationOutreachStage;
  outreach_owner: string | null;
  last_contacted_at: string | null;
  next_action_at: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  commission_value: number;
  notes: string | null;
};

export function memberLinkForCode(referralCode: string) {
  return `${websiteOrigin()}/migrate/${referralCode.toUpperCase()}`;
}

function money(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

/**
 * The opening approach to a secretariat.
 *
 * Written for someone whose job is member value, not energy procurement. It
 * leads with what their members get, states the commercial terms plainly rather
 * than burying them, and asks for one specific thing.
 */
export function buildAssociationOutreachEmail(association: AssociationRecord) {
  const contact = association.contact_name?.trim().split(/\s+/)[0];
  const greeting = contact ? `Dear ${contact},` : "Good day,";
  const memberBase = association.member_base?.toLowerCase() || "your members";

  return {
    subject: `${association.name}: a no-cost energy benefit for your members`,
    body: [
      greeting,
      "",
      `I am writing about a member benefit for ${association.name} that costs the association nothing to offer and nothing to administer.`,
      "",
      `Foundation-1 migrates South African businesses off full-tariff Eskom and municipal supply onto funded clean-energy infrastructure. There is no capital outlay for the member: the equipment is financed and owned by the funder, and the member pays for energy rather than for hardware.`,
      "",
      "What a member actually receives:",
      "",
      "  •  A free assessment of their electricity position, audited against six of their own utility bills, not an area estimate.",
      "  •  A decision-grade proposal showing their true blended tariff, what each pathway costs, and what it saves over ten years.",
      "  •  An honest answer. Where the numbers do not work we say so and show the workings. Roughly a third of the operations we assess are told to stay where they are.",
      "",
      // Deliberately does NOT use why_it_matters: that field records why the
      // association matters to Foundation-1, and telling a secretariat they are
      // a "national gateway" reads exactly as instrumentally as it is.
      `Your membership covers ${memberBase}: operations that carry sustained electricity load and real exposure to annual tariff increases.`,
      "",
      `For the association, we pay ${money(association.commission_value)} for each member that reaches a signed funding term sheet. No exclusivity is asked for and no member is obliged to proceed at any stage.`,
      "",
      `Members would enter through a link that identifies them as yours: ${memberLinkForCode(association.referral_code)}`,
      "",
      "Could I have twenty minutes to walk you through the assessment as a member would see it? If it is useful we can discuss how a member campaign would run; if it is not, I will not follow up.",
      "",
      "Kind regards,",
      "Karman Kekana",
      "Foundation-1 (Pty) Ltd",
    ],
  };
}

/** A short follow-up for a secretariat that has not replied. */
export function buildAssociationFollowUpEmail(association: AssociationRecord) {
  const contact = association.contact_name?.trim().split(/\s+/)[0];
  return {
    subject: `Re: ${association.name}: a no-cost energy benefit for your members`,
    body: [
      contact ? `Dear ${contact},` : "Good day,",
      "",
      `I wrote recently about a no-cost energy assessment benefit for ${association.name} members and wanted to make the ask smaller.`,
      "",
      "Rather than a meeting: if you send me one member who is willing, we will run their full bill-audited assessment at no charge and you can judge the output on its merits before deciding whether it is worth putting in front of the wider membership.",
      "",
      "If energy is not a live issue for your members at the moment, tell me and I will close the file.",
      "",
      "Kind regards,",
      "Karman Kekana",
      "Foundation-1 (Pty) Ltd",
    ],
  };
}

export type AssociationTouchInput = {
  associationId: string;
  eventType:
    | "researched" | "email_sent" | "email_replied" | "call_logged" | "meeting_held"
    | "pack_sent" | "agreement_sent" | "agreement_signed" | "programme_launched"
    | "declined" | "note";
  actor: string;
  detail?: string;
  stage?: AssociationOutreachStage;
  nextActionAt?: string | null;
  metadata?: Record<string, unknown>;
};

/** Records a touch and optionally moves the relationship forward. */
export async function recordAssociationTouch(input: AssociationTouchInput) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Storage unavailable.");

  const { error: eventError } = await supabase.from("association_outreach_events").insert({
    association_id: input.associationId,
    event_type: input.eventType,
    actor: input.actor.slice(0, 160),
    detail: input.detail?.slice(0, 1000) ?? null,
    metadata: input.metadata ?? {},
  });
  if (eventError) throw new Error(eventError.message);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.stage) patch.outreach_stage = input.stage;
  if (input.nextActionAt !== undefined) patch.next_action_at = input.nextActionAt;
  if (input.eventType === "email_sent") patch.last_contacted_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("associations")
    .update(patch)
    .eq("id", input.associationId);
  if (updateError) throw new Error(updateError.message);
}

/** Sends an approach or follow-up and logs it as a touch. */
export async function sendAssociationOutreach(
  association: AssociationRecord,
  kind: "approach" | "follow_up",
  actor: string,
): Promise<{ sent: boolean; reason?: string }> {
  if (!association.contact_email) {
    return { sent: false, reason: "No contact email on record for this association." };
  }

  const built = kind === "approach"
    ? buildAssociationOutreachEmail(association)
    : buildAssociationFollowUpEmail(association);

  const result = await sendEmail({
    to: association.contact_email,
    replyTo: lifecycleReplyTo(),
    subject: built.subject,
    text: built.body.join("\n"),
    tags: [{ name: "association", value: kind.replace(/_/g, "-") }],
  });

  if (!result.ok) {
    const reason = "skipped" in result && result.skipped ? result.reason : result.error;
    return { sent: false, reason };
  }

  await recordAssociationTouch({
    associationId: association.id,
    eventType: "email_sent",
    actor,
    detail: `${kind === "approach" ? "Opening approach" : "Follow-up"} sent to ${association.contact_email}.`,
    stage: association.outreach_stage === "not_started" || association.outreach_stage === "researching"
      ? "contacted"
      : undefined,
  });

  return { sent: true };
}
