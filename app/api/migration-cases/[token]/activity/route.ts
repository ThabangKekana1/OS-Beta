import { NextRequest, NextResponse } from "next/server";
import {
  findMigrationCaseByToken,
  isMigrationCaseWebsiteRequest,
} from "@/lib/migration-case-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Only events the client should see, in their language. Anything not listed
 * here (operator notes, internal blockers, partner mechanics) never surfaces.
 */
const CLIENT_EVENTS: Record<string, { title: string; body: string }> = {
  case_created: { title: "Case opened", body: "Your secure migration case was created and your access link was emailed to you." },
  client_profile_completed: { title: "Business profile saved", body: "Your company details are on file and will populate your documents." },
  nda_signed: { title: "NDA signed", body: "The mutual NDA and POPIA consent are recorded. Your signed copy is in Documents." },
  complete_bill_pack_submitted: { title: "Bills received", body: "Your utility bills arrived safely and the audit started." },
  bill_pack_needs_review: { title: "Bills with our audit team", body: "Foundation-1 is completing your bill audit by hand. Nothing is needed from you." },
  proposal_completed: { title: "Proposal ready", body: "Your bill-audited migration proposal is finished and waiting for review." },
  proposal_not_recommended: { title: "Bill audit complete", body: "Your audit finished. The result and the reasons behind it are in your case." },
  post_proposal_eoi_signed: { title: "Expression of Interest signed", body: "Your signed EOI is recorded and your full proposal is unlocked." },
  kyc_readiness_confirmed: { title: "Readiness confirmed", body: "Your document readiness is recorded and your case is queued for submission." },
  submitted_to_funder: { title: "Pack submitted", body: "Foundation-1 submitted your pack and is tracking the response deadline." },
  partner_proposal_issued: { title: "Formal proposal issued", body: "Your formal pathway proposal has arrived for review and signature." },
  partner_proposal_signed: { title: "Signed proposal received", body: "Thank you — your KYC pack is the next step." },
  kyc_verified: { title: "KYC verified", body: "Every document in your pack has been verified." },
  kyc_handed_off: { title: "Official handoff complete", body: "Your verified pack was handed to the bank with a recorded manifest." },
  term_sheet_issued: { title: "Term sheet issued", body: "Terms for your pathway have been issued. Review them with your Foundation-1 owner." },
  support_message_received: { title: "Message sent to Foundation-1", body: "We received your message and will reply by email." },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const { data, error } = await client
      .from("migration_case_events")
      .select("id,event_type,created_at")
      .eq("case_id", caseRow.id)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    const items = (data ?? [])
      .map((row) => {
        const copy = CLIENT_EVENTS[row.event_type as string];
        if (!copy) return null;
        return { id: row.id as string, at: row.created_at as string, ...copy };
      })
      .filter((item): item is { id: string; at: string; title: string; body: string } => item !== null);

    return NextResponse.json(
      { ok: true, items },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load your updates." },
      { status: 500 },
    );
  }
}
