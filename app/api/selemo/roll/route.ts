/** The public Selemo roll: company names only. Built for the public page. */
import { NextResponse } from "next/server";
import { selemoPublicRoll, SELEMO_PLEDGE, SELEMO_SUBTITLE, SELEMO_TITLE } from "@/lib/selemo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const roll = await selemoPublicRoll();
    return NextResponse.json({
      ok: true,
      title: SELEMO_TITLE,
      subtitle: SELEMO_SUBTITLE,
      pledge: SELEMO_PLEDGE,
      count: roll.length,
      roll,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Roll unavailable." },
      { status: 500 },
    );
  }
}
