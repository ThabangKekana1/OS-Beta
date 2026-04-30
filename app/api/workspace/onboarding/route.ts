import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { resolveClientOnboardingLead } from "@/lib/client-onboarding";
import { buildClientEoiSigningPath, buildClientEoiSigningUrl } from "@/lib/eoi-signing";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const caseName = request.nextUrl.searchParams.get("caseName");
  const lead = await resolveClientOnboardingLead({
    sessionEmail: session.email,
    workspaceId,
    caseName,
  });

  if (!lead) {
    return NextResponse.json({ ok: true, lead: null });
  }

  return NextResponse.json({
    ok: true,
    lead: {
      id: lead.id,
      clientProfileId: lead.clientProfileId,
      company: lead.company,
      stage: lead.stage,
      eoiSigningToken: lead.eoiSigningToken,
      eoiSigningPath: buildClientEoiSigningPath(lead.eoiSigningToken),
      eoiSigningUrl: buildClientEoiSigningUrl(lead.eoiSigningToken),
      eoiSignedBy: lead.eoiSignedBy,
      eoiSignedAt: lead.eoiSignedAt,
      documents: lead.documents.map((document) => ({
        id: document.id,
        title: document.title,
        category: document.category,
        fileType: document.fileType,
        status: document.status,
        uploadedAt: document.uploadedAt,
        uploadedBy: document.uploadedBy,
        fileName: document.fileName ?? null,
        contentType: document.contentType ?? null,
        hasStorage: Boolean(document.storagePath),
      })),
    },
  });
}
