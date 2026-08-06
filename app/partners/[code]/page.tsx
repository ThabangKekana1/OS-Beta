import type { Metadata } from "next";
import Link from "next/link";
import {
  cleanReferralCode,
  findAssociationByCode,
  listAssociationReferrals,
  portalKeyForCode,
} from "@/lib/associations";

export const metadata: Metadata = {
  title: "Partner Portal | Foundation-1",
  description: "Association partner portal: member pipeline and commission ledger.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function zar(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return value;
  }
}

export default async function PartnerPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { code: rawCode } = await params;
  const { k } = await searchParams;
  const code = cleanReferralCode(rawCode);

  const denied = (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
      <p className="text-[0.66rem] uppercase tracking-[0.22em] text-white/60">Foundation-1 Partner Portal</p>
      <h1 className="text-2xl font-semibold tracking-[-0.03em]">Portal not available</h1>
      <p className="max-w-md text-sm leading-6 text-white/60">
        This partner link is invalid or inactive. Contact Foundation-1 to renew access.
      </p>
    </main>
  );

  if (!code || !k || k !== portalKeyForCode(code)) return denied;

  const association = await findAssociationByCode(code);
  if (!association || association.status !== "active") return denied;

  const referrals = await listAssociationReferrals(association.id);
  const totalDue = referrals.reduce((sum, row) => sum + (row.commissionDue ?? 0), 0);
  const totalPaid = referrals
    .filter((row) => row.commissionPaidAt)
    .reduce((sum, row) => sum + (row.commissionDue ?? 0), 0);
  const memberLink = `https://foundation-1.co.za/estimate/a/${association.referralCode}`;

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white md:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="border-b border-white/[0.12] pb-6">
          <p className="text-[0.66rem] uppercase tracking-[0.22em] text-lime-200/80">
            Foundation-1 Partner Portal
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{association.name}</h1>
          <p className="mt-2 text-sm leading-6 text-white/60">
            {association.sector ? `${association.sector} · ` : ""}Member energy programme partner.
            Share the member link below. Every member who starts an assessment through it is
            attributed to {association.name} automatically.
          </p>
        </header>

        <section className="mt-6 rounded-[10px] border border-white/[0.12] bg-[#0a0a0a] p-5">
          <h2 className="text-[0.66rem] uppercase tracking-[0.18em] text-white/60">Your member link</h2>
          <p className="mt-2 break-all rounded-[7px] border border-white/[0.09] bg-white/[0.025] px-4 py-3 font-mono text-sm text-lime-200">
            {memberLink}
          </p>
          <p className="mt-2 text-xs leading-5 text-white/60">
            Works in WhatsApp broadcasts, newsletters and SMS. Members get a free instant energy
            assessment; qualifying members are onboarded by Foundation-1 end-to-end.
          </p>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Members referred", value: String(referrals.length) },
            { label: "Commission accrued", value: zar(totalDue) },
            { label: "Commission paid", value: zar(totalPaid) },
          ].map((stat) => (
            <div key={stat.label} className="rounded-[10px] border border-white/[0.12] bg-[#0a0a0a] px-4 py-4">
              <p className="text-[0.66rem] uppercase tracking-[0.16em] text-white/60">{stat.label}</p>
              <p className="mt-1 text-xl font-semibold text-white/90">{stat.value}</p>
            </div>
          ))}
        </section>

        <section aria-label="Member pipeline" className="mt-6 rounded-[10px] border border-white/[0.12] bg-[#0a0a0a] p-5">
          <h2 className="text-[0.66rem] uppercase tracking-[0.18em] text-white/60">Member pipeline</h2>
          {referrals.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">
                No members yet. Share your link to start the pipeline. The first assessment takes a
              member about a minute.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {referrals.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[7px] border border-white/[0.09] bg-white/[0.025] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white/90">
                      {row.memberBusinessName ?? "Member (name pending registration)"}
                    </p>
                    <p className="mt-0.5 text-xs text-white/60">
                      {formatDate(row.createdAt)} · {row.stageAtReferral ?? "estimate"}
                    </p>
                  </div>
                  <span className="text-xs text-white/70">
                    {row.commissionDue
                      ? `${zar(row.commissionDue)} ${row.commissionPaidAt ? "paid" : "accrued"}`
                      : "Not yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-5 text-white/60">
            POPIA: this portal shows business names and pipeline stages only. Member documents and
            personal information stay inside Foundation-1&apos;s secure platform.
          </p>
        </section>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-white/60">
          <span>Foundation-1 (Pty) Ltd · Reg 2026/138664/07 · sales@1os.foundation-1.co.za</span>
          <Link href="/" className="underline decoration-white/30 underline-offset-4 hover:text-white">
            foundation-1.co.za
          </Link>
        </footer>
      </div>
    </main>
  );
}
