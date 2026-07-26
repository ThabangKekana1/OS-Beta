"use client";

import { useState } from "react";
import { Check, Copy, Mail, Send } from "lucide-react";
import {
  ASSOCIATION_OUTREACH_STAGES,
  type AssociationOutreachStage,
} from "@/lib/association-stages";

export type AssociationRowData = {
  id: string;
  name: string;
  sector: string | null;
  referralCode: string;
  memberLink: string;
  website: string | null;
  memberBase: string | null;
  productFit: string | null;
  recommendedAction: string | null;
  priorityTier: number | null;
  priorityScore: number | null;
  stage: AssociationOutreachStage;
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string | null;
  lastContactedAt: string | null;
  commissionValue: number;
  memberCount: number;
};

function stageMeta(stage: AssociationOutreachStage) {
  return ASSOCIATION_OUTREACH_STAGES.find((item) => item.id === stage)
    ?? ASSOCIATION_OUTREACH_STAGES[0];
}

async function post(id: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/admin/associations/${encodeURIComponent(id)}/outreach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "The operation failed.");
}

function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-1.5 font-mono text-[0.58rem] text-white/55 transition hover:text-white"
      title={value}
    >
      {copied ? <Check className="size-3 text-emerald-300" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Member link"}
    </button>
  );
}

export function AssociationRow({ data }: { data: AssociationRowData }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [contactName, setContactName] = useState(data.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(data.contactEmail ?? "");
  const [detail, setDetail] = useState("");
  const [stage, setStage] = useState<AssociationOutreachStage>(data.stage);

  const meta = stageMeta(data.stage);

  async function run(label: string, body: Record<string, unknown>) {
    setBusy(label);
    setError("");
    try {
      await post(data.id, { contactName: contactName || undefined, contactEmail: contactEmail || undefined, ...body });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The operation failed.");
      setBusy("");
    }
  }

  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-white">{data.name}</h3>
            {data.priorityTier ? (
              <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.14em] text-white/40">
                Tier {data.priorityTier} · {data.priorityScore}
              </span>
            ) : null}
            <span className="rounded-full border border-cyan-200/20 bg-cyan-200/[0.06] px-2 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.14em] text-cyan-100/70">
              {meta.label}
            </span>
            {data.memberCount > 0 ? (
              <span className="rounded-full border border-emerald-200/20 bg-emerald-200/[0.06] px-2 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.14em] text-emerald-100/70">
                {data.memberCount} member case{data.memberCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[0.66rem] leading-5 text-white/38">
            {data.sector}{data.memberBase ? ` · ${data.memberBase}` : ""}
          </p>
          {data.contactName ? (
            <p className="mt-1.5 text-[0.66rem] leading-5 text-white/60">
              {data.contactName}
              {data.contactRole ? <span className="text-white/34"> · {data.contactRole}</span> : null}
              {data.contactEmail ? <span className="text-white/34"> · {data.contactEmail}</span> : <span className="text-amber-200/60"> · email not published</span>}
            </p>
          ) : null}
          <p className="mt-1 text-[0.62rem] leading-5 text-white/28">
            Next: {meta.nextAction}
            {data.lastContactedAt
              ? ` · last contacted ${new Date(data.lastContactedAt).toLocaleDateString("en-ZA", { dateStyle: "medium" })}`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <CopyLink value={data.memberLink} />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/16 bg-white/[0.03] px-3 text-[0.62rem] font-medium uppercase tracking-[0.13em] text-white/72 transition hover:bg-white/10"
          >
            {open ? "Close" : "Work"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="Secretariat contact name"
              className="h-8 rounded-lg border border-white/12 bg-white/[0.03] px-3 text-[0.68rem] text-white placeholder:text-white/25"
            />
            <input
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="contact@association.co.za"
              className="h-8 rounded-lg border border-white/12 bg-white/[0.03] px-3 text-[0.68rem] text-white placeholder:text-white/25"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy) || !contactEmail}
              onClick={() => void run("send", { action: "send" })}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-white bg-white px-3 text-[0.62rem] font-medium uppercase tracking-[0.13em] text-black transition hover:bg-white/88 disabled:opacity-40"
            >
              <Send className="size-3" /> {busy === "send" ? "Sending" : "Send approach"}
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || !contactEmail}
              onClick={() => void run("follow", { action: "follow_up" })}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/16 bg-white/[0.03] px-3 text-[0.62rem] font-medium uppercase tracking-[0.13em] text-white/72 transition hover:bg-white/10 disabled:opacity-40"
            >
              <Mail className="size-3" /> {busy === "follow" ? "Sending" : "Follow up"}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              placeholder="Log a call, meeting or reply…"
              className="h-8 rounded-lg border border-white/12 bg-white/[0.03] px-3 text-[0.68rem] text-white placeholder:text-white/25"
            />
            <select
              value={stage}
              onChange={(event) => setStage(event.target.value as AssociationOutreachStage)}
              className="h-8 rounded-lg border border-white/12 bg-black px-2 text-[0.62rem] text-white/80"
            >
              {ASSOCIATION_OUTREACH_STAGES.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void run("log", { eventType: detail ? "note" : "researched", detail, stage })}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/16 bg-white/[0.03] px-3 text-[0.62rem] font-medium uppercase tracking-[0.13em] text-white/72 transition hover:bg-white/10 disabled:opacity-40"
            >
              {busy === "log" ? "Saving" : "Log"}
            </button>
          </div>

          {data.recommendedAction ? (
            <p className="text-[0.62rem] leading-5 text-white/28">Play: {data.recommendedAction}</p>
          ) : null}
          {error ? <p className="text-[0.62rem] text-amber-200">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
