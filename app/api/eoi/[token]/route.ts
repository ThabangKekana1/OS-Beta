import { NextResponse } from "next/server";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import type { AdminLead } from "@/lib/admin-types";

export const runtime = "nodejs";

function toPublicEoiLead(lead: AdminLead) {
  return {
    clientProfileId: lead.clientProfileId,
    company: lead.company,
    businessRegistrationNumber: lead.businessRegistrationNumber,
    contactName: lead.contactName,
    physicalAddress: lead.physicalAddress,
    userProfile: {
      phone: lead.userProfile.phone,
      role: lead.userProfile.role,
    },
    stage: lead.stage,
    eoiSignatureId: lead.eoiSignatureId,
    eoiSignedBy: lead.eoiSignedBy,
    eoiSignedAt: lead.eoiSignedAt,
    isSigned: Boolean(lead.eoiSignedAt),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { backend, snapshot } = await readAdminStateSnapshot();
  const lead = snapshot.leads.find((entry) => entry.eoiSigningToken === token);

  if (!lead) {
    return NextResponse.json({ ok: false, error: "EOI template link not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    backend,
    lead: toPublicEoiLead(lead),
  });
}
