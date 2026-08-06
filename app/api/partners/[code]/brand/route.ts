import { NextResponse } from "next/server";
import { cleanReferralCode } from "@/lib/associations";
import { getPartnerBrandByCode } from "@/lib/partner-branding";

export const dynamic = "force-dynamic";

/** Public: resolves a partner's member-facing brand for the co-branded assessment journey. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  const code = cleanReferralCode(rawCode);
  if (!code) return NextResponse.json({ ok: false, error: "Unknown partner." }, { status: 404 });

  try {
    const brand = await getPartnerBrandByCode(code);
    if (!brand) {
      return NextResponse.json({ ok: false, error: "Unknown partner." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, brand });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load the partner." }, { status: 500 });
  }
}
