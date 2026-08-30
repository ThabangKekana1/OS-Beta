/**
 * THE SELEMO INITIATIVE (founder-commissioned, 30 August 2026).
 *
 * Selemo is a Sepedi word: harvest, spring, new beginnings. The pledge is a
 * public commitment to food security in South Africa powered by the sun.
 * Signing is open to any client after the mutual NDA, stands on its own, and
 * binds nobody to migrate. Public surfaces carry the COMPANY name only; the
 * human who signed stays private to the platform.
 */
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const SELEMO_TITLE = "The Selemo Pledge";
export const SELEMO_SUBTITLE = "Food security for South Africa, powered by the sun.";

/** The pledge, written by Karman Kekana. */
export const SELEMO_PLEDGE: { paragraphs: string[]; commitments: string[]; closing: string; author: string } = {
  paragraphs: [
    "Selemo is a Sepedi word. It means harvest. It means spring. It means a new beginning.",
    "Everything on a South African table exists because somewhere a pump ran, a cold room held, a mill turned and a light stayed on. The businesses that feed this country carry its heaviest electricity costs, and every year that burden grows. When power fails or becomes unaffordable, it is not only a business that suffers. It is the nation's plate.",
    "We believe the country that feeds us deserves energy that never runs out. The sun rises on every farm, every packhouse, every mill in this land, free, clean and inexhaustible. Turning that light into food security is not a dream. It is engineering, and it has already begun.",
  ],
  commitments: [
    "We treat reliable, affordable energy as part of our duty to the nation's food supply.",
    "We pursue clean power for our operations, at the pace that is right for our business.",
    "We stand publicly for a South African food system powered by the sun, and we invite those who feed this country alongside us to stand with us.",
  ],
  closing:
    "This pledge binds no company to any provider or product. It is a statement of intent, made freely, by businesses that feed South Africa and choose to say so in the open. The harvest belongs to all of us.",
  author: "Karman Kekana, Founder, Foundation-1",
};

function client() {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin configuration is unavailable.");
  return admin;
}

export type SelemoSignInput = {
  caseId: string;
  companyName: string;
  signerName: string;
  signerPosition?: string | null;
};

export async function signSelemoPledge(input: SelemoSignInput): Promise<{ signedAt: string }> {
  if (!input.companyName.trim()) throw new Error("The company name is required.");
  if (!input.signerName.trim()) throw new Error("The signer's name is required.");
  const { data, error } = await client()
    .from("foundation1_selemo_pledges")
    .upsert(
      {
        case_id: input.caseId,
        company_name: input.companyName.trim(),
        signer_name: input.signerName.trim(),
        signer_position: input.signerPosition?.trim() ?? "",
      },
      { onConflict: "case_id" },
    )
    .select("signed_at")
    .single();
  if (error) throw new Error(error.message);
  return { signedAt: data.signed_at as string };
}

export async function selemoStatusForCase(caseId: string): Promise<{ signed: boolean; signedAt: string | null }> {
  const { data } = await client()
    .from("foundation1_selemo_pledges")
    .select("signed_at")
    .eq("case_id", caseId)
    .maybeSingle();
  return { signed: Boolean(data), signedAt: (data?.signed_at as string | undefined) ?? null };
}

/** The public roll: company names only, newest first. Nothing personal leaves. */
export async function selemoPublicRoll(limit = 500): Promise<Array<{ company: string; signedAt: string }>> {
  const { data, error } = await client()
    .from("foundation1_selemo_pledges")
    .select("company_name,signed_at")
    .eq("is_public", true)
    .order("signed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    company: row.company_name as string,
    signedAt: row.signed_at as string,
  }));
}
