import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  findDealRoomByToken,
  isRoomOpen,
  listGrantedDocuments,
  logDealRoomAccess,
} from "@/lib/deal-rooms";

export const metadata: Metadata = {
  title: "Deal Room | Foundation-1",
  description: "Secure funder deal room prepared by Foundation-1 (Pty) Ltd.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return value;
  }
}

function summaryRows(summary: Record<string, unknown> | null) {
  if (!summary) return [] as Array<[string, string]>;
  const labels: Record<string, string> = {
    company: "Company",
    stage: "File stage",
    readinessScore: "Readiness score",
    monthlySpendZar: "Monthly electricity spend",
    documentCount: "Documents shared",
    preparedAt: "Pack prepared",
  };
  return Object.entries(labels)
    .filter(([key]) => summary[key] !== null && summary[key] !== undefined)
    .map(([key, label]) => {
      const raw = summary[key];
      const value =
        key === "monthlySpendZar" && typeof raw === "number"
          ? `R${Math.round(raw).toLocaleString("en-ZA")}`
          : key === "preparedAt" && typeof raw === "string"
            ? formatDate(raw)
            : String(raw);
      return [label, value] as [string, string];
    });
}

export default async function DealRoomPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const room = await findDealRoomByToken(token);

  if (!room || !isRoomOpen(room)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
        <p className="text-[0.66rem] uppercase tracking-[0.22em] text-white/60">Foundation-1 Deal Room</p>
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">This deal room is not available</h1>
        <p className="max-w-md text-sm leading-6 text-white/60">
          The link may have expired or been suspended. Contact Foundation-1 for renewed access.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <a
            href="mailto:karman@foundation-1.co.za?subject=Deal%20room%20access"
            className="rounded-full border border-[#b9ff91]/70 bg-[#b9ff91] px-5 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-black hover:bg-white"
          >
            Email Foundation-1
          </a>
          <a
            href="https://wa.me/27698117112?text=Hi%20Foundation-1%2C%20my%20deal%20room%20link%20is%20not%20working."
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-white/25 px-5 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-white/80 hover:border-white/50 hover:text-white"
          >
            WhatsApp 069 811 7112
          </a>
        </div>
      </main>
    );
  }

  const requestHeaders = await headers();
  await logDealRoomAccess({
    dealRoomId: room.id,
    action: "room_opened",
    ip: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: requestHeaders.get("user-agent") ?? undefined,
  });

  const documents = await listGrantedDocuments(room);
  const rows = summaryRows(room.bankabilitySummary);

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white md:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="border-b border-white/[0.12] pb-6">
          <p className="text-[0.66rem] uppercase tracking-[0.22em] text-lime-200/80">
            Foundation-1 (Pty) Ltd · Secure Deal Room
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
            {typeof room.bankabilitySummary?.company === "string"
              ? String(room.bankabilitySummary.company)
              : "Validated client file"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Prepared for {room.funderName}. This room contains only the documents Foundation-1 has
            released for this transaction. Access and downloads are logged. Client introduced and
            onboarded by Foundation-1 (Pty) Ltd — Reg 2026/138664/07.
          </p>
        </header>

        {rows.length > 0 ? (
          <section aria-label="Bankability summary" className="mt-6 rounded-[10px] border border-white/[0.12] bg-[#0a0a0a] p-5">
            <h2 className="text-[0.66rem] uppercase tracking-[0.18em] text-white/60">Bankability summary</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label} className="rounded-[7px] border border-white/[0.09] bg-white/[0.025] px-4 py-3">
                  <dt className="text-[0.66rem] uppercase tracking-[0.14em] text-white/60">{label}</dt>
                  <dd className="mt-1 text-base font-semibold text-white/90">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section aria-label="Shared documents" className="mt-6 rounded-[10px] border border-white/[0.12] bg-[#0a0a0a] p-5">
          <h2 className="text-[0.66rem] uppercase tracking-[0.18em] text-white/60">
            Shared documents ({documents.length})
          </h2>
          {documents.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">No documents are currently shared.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {documents.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[7px] border border-white/[0.09] bg-white/[0.025] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white/90">{document.title}</p>
                    <p className="mt-0.5 text-xs text-white/60">
                      {document.category} · {document.fileType} · uploaded {formatDate(document.uploadedAt)}
                    </p>
                  </div>
                  <a
                    href={`/api/dealroom/${encodeURIComponent(token)}/documents/${encodeURIComponent(document.id)}`}
                    className="rounded-full border border-lime-200/70 bg-lime-200 px-4 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-6 text-xs leading-5 text-white/60">
          Confidential. Supplied under the existing dealer and POPIA arrangements between the
          parties solely for assessing this transaction. Redistribution or use for direct client
          contact outside this transaction is not authorised. Every access to this room is
          recorded ({formatDate(room.createdAt)} · room {room.id.slice(0, 8)}).
        </footer>
      </div>
    </main>
  );
}
