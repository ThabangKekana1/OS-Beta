"use client";

/**
 * The Dossier (doc 21): one prospect, everything known. Book-row evidence,
 * every queued or sent touch, outcome events, and the harness's own memory —
 * what it believes and why — in a single read.
 */
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminPrimitives";

type Dossier = {
  ok: boolean;
  key: string;
  book: {
    company_name: string;
    sector: string;
    sub_sector: string | null;
    site_type: string | null;
    province: string | null;
    town: string | null;
    scale_signal: string | null;
    electricity_rationale: string | null;
    est_spend_band: string | null;
    contact_channel: string | null;
    verification: string | null;
    source_name: string | null;
    source_url: string | null;
    source_accessed: string | null;
    popia_basis: string | null;
  } | null;
  touches: Array<{ id: string; subject: string; status: string; created_at: string; sent_at: string | null }>;
  outcomes: Array<{ event: string; occurred_at: string }>;
  memory: Array<{ kind: string; content: Record<string, unknown>; created_at: string }>;
};

const zar = (v: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(v);

export function AdminDossierRoute({ prospectKey }: { prospectKey: string }) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const response = await fetch(`/api/admin/deck/dossier/${encodeURIComponent(prospectKey)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (payload?.ok) setDossier(payload);
      else setError(payload?.error ?? "Dossier unavailable.");
    })();
  }, [prospectKey]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AdminHeader eyebrow="Dossier" title={dossier?.book?.company_name ?? prospectKey} description="" />

      {error && (
        <p className="rounded-sm border border-[color:var(--magenta)]/30 bg-[color:var(--magenta)]/10 px-3 py-2 font-mono text-xs text-white/85">{error}</p>
      )}

      {dossier?.book && (
        <section className="space-y-2 overflow-hidden rounded-md border border-white/10 bg-[var(--canvas)] p-4">
          <p className="text-[11px] uppercase tracking-widest opacity-50">The evidence</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
            <Fact label="Sector" value={[dossier.book.sector, dossier.book.sub_sector].filter(Boolean).join(" · ")} />
            <Fact label="Site" value={dossier.book.site_type} />
            <Fact label="Where" value={[dossier.book.town, dossier.book.province].filter(Boolean).join(", ")} />
            <Fact
              label="Spend band"
              value={
                dossier.book.est_spend_band === "250k+" ? zar(250_000) + "+" :
                dossier.book.est_spend_band === "50k-250k" ? `${zar(50_000)} – ${zar(250_000)}` :
                dossier.book.est_spend_band === "10k-50k" ? `${zar(10_000)} – ${zar(50_000)}` :
                dossier.book.est_spend_band ?? null
              }
            />
          </div>
          {dossier.book.scale_signal && (
            <p className="border-l-2 border-[var(--electric)] pl-3 text-[13px] italic leading-5 text-white/85">
              "{dossier.book.scale_signal}"
            </p>
          )}
          {dossier.book.electricity_rationale && (
            <p className="text-xs leading-5 opacity-55">{dossier.book.electricity_rationale}</p>
          )}
          <p className="pt-1 text-[11px] opacity-40">
            Source: {dossier.book.source_name ?? "unrecorded"} ·{" "}
            {dossier.book.verification === "V" ? "[V] verified" : "[I] inferred"}
            {dossier.book.popia_basis ? ` · ${dossier.book.popia_basis}` : ""}
          </p>
        </section>
      )}

      <section className="space-y-2">
        <p className="text-[11px] uppercase tracking-widest opacity-50">Funnel position</p>
        <ol className="flex flex-wrap gap-1.5">
          {(dossier?.outcomes ?? []).map((o, i) => (
            <li key={`${o.event}-${i}`} className="rounded-full border border-white/14 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/75">
              {o.event.replaceAll("_", " ")}
            </li>
          ))}
          {!dossier?.outcomes?.length && <li className="text-xs opacity-45">No funnel events yet.</li>}
        </ol>
      </section>

      {!!dossier?.touches?.length && (
        <section className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-widest opacity-50">Touches</p>
          <ul className="divide-y divide-white/8 rounded-lg border border-white/10">
            {dossier.touches.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-3 py-2 text-[13px]">
                <span className="truncate">{t.subject}</span>
                <span className="shrink-0 text-[11px] opacity-50">
                  {t.status}
                  {t.sent_at ? ` · ${t.sent_at.slice(0, 10)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!dossier?.memory?.length && (
        <section className="space-y-2">
          <p className="text-[11px] uppercase tracking-widest opacity-50">What the harness remembers</p>
          <ul className="space-y-1.5">
            {dossier.memory.map((m, i) => (
              <li key={i} className="border-b border-white/8 px-0 py-2  px-3 py-2 text-xs leading-5 opacity-80">
                <span className="mr-2 rounded bg-white/8 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{m.kind}</span>
                {JSON.stringify(m.content).slice(0, 300)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <p>
      <span className="mr-2 text-[11px] uppercase tracking-wide opacity-45">{label}</span>
      <span>{value ?? "—"}</span>
    </p>
  );
}
