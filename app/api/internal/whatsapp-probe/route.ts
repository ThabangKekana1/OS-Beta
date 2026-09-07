import { NextRequest, NextResponse } from "next/server";
import { whatsappConfigured } from "@/lib/whatsapp";

export const runtime = "nodejs";

/**
 * TEMPORARY ops probe — remove after use.
 *
 * Doc 15 asked for WhatsApp intake "the day Meta credentials arrive", and the
 * Cloud API credentials did arrive in production 48 days ago, but nobody wrote
 * down which business, app or number they belong to. This route asks Meta who
 * it is: the bound phone number, its display name and verification state, and
 * the identity the token carries. Metadata only — the access token never
 * leaves the server, and the route answers nothing without CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const configured = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!configured || supplied !== configured) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!whatsappConfigured()) {
    return NextResponse.json({ ok: false, error: "WhatsApp Cloud API is not configured." }, { status: 503 });
  }

  const pid = process.env.WHATSAPP_PHONE_NUMBER_ID as string;
  const token = (process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.WHATSAPP_TOKEN) as string;
  const graph = "https://graph.facebook.com/v21.0";
  const authHeaders = { Authorization: `Bearer ${token}` };

  try {
    const [phoneRes, identityRes] = await Promise.all([
      fetch(
        `${graph}/${pid}?fields=display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,account_mode`,
        { headers: authHeaders },
      ),
      fetch(`${graph}/me?fields=id,name,category`, { headers: authHeaders }),
    ]);
    const phone = (await phoneRes.json()) as Record<string, unknown>;
    const identity = (await identityRes.json()) as Record<string, unknown>;
    return NextResponse.json({
      ok: true,
      phone_number_id: pid,
      phone: phoneRes.ok ? phone : { error: phone },
      identity: identityRes.ok ? identity : { error: identity },
      probed_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Probe failed." },
      { status: 502 },
    );
  }
}
