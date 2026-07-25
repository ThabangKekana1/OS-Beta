import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  recordAssociationTouch,
  sendAssociationOutreach,
  type AssociationOutreachStage,
  type AssociationRecord,
  type AssociationTouchInput,
} from "@/lib/association-outreach";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const EVENT_TYPES = new Set([
  "researched", "email_sent", "email_replied", "call_logged", "meeting_held",
  "pack_sent", "agreement_sent", "agreement_signed", "programme_launched",
  "declined", "note",
]);

const STAGES = new Set([
  "not_started", "researching", "contacted", "in_conversation",
  "proposal_sent", "agreed", "live", "declined", "dormant",
]);

/**
 * Works one association relationship forward.
 *
 * `send` issues the approach or follow-up and logs it. Anything else records a
 * touch that happened elsewhere — a call, a meeting, a reply — so the pipeline
 * reflects reality rather than only what the system did itself.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || (session.role !== "admin" && session.role !== "sales")) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  const { id } = await params;
  let payload: {
    action?: unknown;
    eventType?: unknown;
    detail?: unknown;
    stage?: unknown;
    nextActionAt?: unknown;
    contactName?: unknown;
    contactEmail?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Storage unavailable." }, { status: 503 });
  }
  const { data, error } = await supabase.from("associations").select("*").eq("id", id).limit(1);
  if (error || !data?.[0]) {
    return NextResponse.json({ ok: false, error: "Association not found." }, { status: 404 });
  }
  const association = data[0] as AssociationRecord;
  const actor = session.email || session.name || "operator";

  try {
    // Record or update the secretariat contact before anything is sent to them.
    const contactName = typeof payload.contactName === "string" ? payload.contactName.trim().slice(0, 160) : null;
    const contactEmail = typeof payload.contactEmail === "string"
      ? payload.contactEmail.trim().toLowerCase().slice(0, 220)
      : null;
    if (contactName !== null || contactEmail !== null) {
      if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(contactEmail)) {
        return NextResponse.json({ ok: false, error: "Enter a valid contact email." }, { status: 400 });
      }
      await supabase
        .from("associations")
        .update({
          ...(contactName !== null ? { contact_name: contactName } : {}),
          ...(contactEmail !== null ? { contact_email: contactEmail } : {}),
        })
        .eq("id", id);
      association.contact_name = contactName ?? association.contact_name;
      association.contact_email = contactEmail ?? association.contact_email;
    }

    if (payload.action === "send" || payload.action === "follow_up") {
      const kind = payload.action === "send" ? "approach" : "follow_up";
      const result = await sendAssociationOutreach(association, kind, actor);
      if (!result.sent) {
        return NextResponse.json({ ok: false, error: result.reason ?? "Could not send." }, { status: 409 });
      }
      return NextResponse.json({ ok: true, action: payload.action });
    }

    const eventType = typeof payload.eventType === "string" ? payload.eventType : "";
    if (!EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ ok: false, error: "Unknown event type." }, { status: 400 });
    }
    const stage = typeof payload.stage === "string" && STAGES.has(payload.stage)
      ? (payload.stage as AssociationOutreachStage)
      : undefined;
    const nextActionAt = typeof payload.nextActionAt === "string" && payload.nextActionAt
      ? new Date(payload.nextActionAt).toISOString()
      : undefined;

    await recordAssociationTouch({
      associationId: id,
      eventType: eventType as AssociationTouchInput["eventType"],
      actor,
      detail: typeof payload.detail === "string" ? payload.detail : undefined,
      stage,
      nextActionAt,
    });

    return NextResponse.json({ ok: true, eventType, stage: stage ?? association.outreach_stage });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The operation failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
