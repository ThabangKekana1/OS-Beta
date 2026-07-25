import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  cleanReferralCode,
  createAssociation,
  isMissingAssociationTables,
  portalKeyForCode,
} from "@/lib/associations";

export const runtime = "nodejs";

/**
 * POST /api/admin/associations — register an association partner.
 * Body: { name, referralCode, sector?, contactName?, contactEmail?,
 *         commissionModel?, commissionValue? }
 * Returns the member referral link and the association's portal link.
 */
export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const referralCode = cleanReferralCode(body.referralCode);
  if (!name || referralCode.length < 4) {
    return NextResponse.json(
      { ok: false, error: "name and a referralCode of at least 4 characters (A-Z, 0-9, -) are required." },
      { status: 400 },
    );
  }

  const created = await createAssociation({
    name,
    sector: typeof body.sector === "string" ? body.sector : undefined,
    contactName: typeof body.contactName === "string" ? body.contactName : undefined,
    contactEmail: typeof body.contactEmail === "string" ? body.contactEmail : undefined,
    referralCode,
    commissionModel: typeof body.commissionModel === "string" ? body.commissionModel : undefined,
    commissionValue: typeof body.commissionValue === "number" ? body.commissionValue : undefined,
  });

  if ("error" in created) {
    const status = isMissingAssociationTables({ message: created.error }) ? 501 : 500;
    return NextResponse.json(
      {
        ok: false,
        error:
          status === 501
            ? "Association tables are not deployed yet. Apply supabase/migrations/20260706120000_platform_kyc_dealrooms_associations.sql first."
            : created.error,
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    association: created,
    memberLink: `/estimate/a/${created.referralCode}`,
    portalLink: `/partners/${created.referralCode}?k=${portalKeyForCode(created.referralCode)}`,
  });
}
