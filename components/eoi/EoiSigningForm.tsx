"use client";

import { useMemo, useState } from "react";
import {
  buildEoiTemplateFilename,
  buildEoiTemplateText,
  type EoiTemplateLead,
} from "@/lib/eoi-template";
import { downloadTextFile } from "@/lib/download-utils";

const EOI_RETURN_EMAIL = "karman@foundation-1.co.za";

type EoiLeadView = EoiTemplateLead & {
  stage: string;
  eoiSignatureId: string | null;
  eoiSignedBy: string | null;
  eoiSignedAt: string | null;
  isSigned: boolean;
};

type EoiSigningFormProps = {
  initialLead: EoiLeadView;
};

function signedAtLabel(value: string | null) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function EoiTemplatePreview({ templateText }: { templateText: string }) {
  return (
    <article className="mx-auto w-full max-w-[210mm] bg-white px-7 py-10 text-black shadow-[0_30px_120px_rgba(0,0,0,0.48)] sm:px-[24mm] sm:py-[24mm]">
      <pre className="whitespace-pre-wrap break-words font-sans text-[clamp(0.82rem,1.45vw,1.05rem)] leading-7 text-black">
        {templateText}
      </pre>
    </article>
  );
}

function copyTextWithTextarea(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Copy command failed");
  }
}

export function EoiSigningForm({ initialLead }: EoiSigningFormProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const signedAt = signedAtLabel(initialLead.eoiSignedAt);
  const templateText = useMemo(
    () => buildEoiTemplateText(initialLead),
    [initialLead],
  );
  const filename = useMemo(
    () => buildEoiTemplateFilename(initialLead.company),
    [initialLead.company],
  );
  const mailtoHref = `mailto:${EOI_RETURN_EMAIL}?subject=${encodeURIComponent(
    `Signed Expression of Interest - ${initialLead.company}`,
  )}`;

  const copyTemplate = async () => {
    setCopyError(null);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(templateText);
      } else {
        copyTextWithTextarea(templateText);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      try {
        copyTextWithTextarea(templateText);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      } catch {
        setCopied(false);
        setCopyError("Clipboard access failed. Download the text file and copy it from there.");
      }
    }
  };

  const downloadTemplate = () => {
    downloadTextFile(filename, templateText);
  };

  return (
    <div className="w-full max-w-5xl">
      <section className="mb-5 rounded-[1.4rem] border border-white/12 bg-white/[0.04] px-5 py-4">
        <p className="text-[0.66rem] uppercase tracking-[0.26em] text-white/46">
          Expression of Interest
        </p>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em] text-white">
          Copy EOI template for {initialLead.company}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/68">
          The template below is already filled with the registered client information. Copy it onto
          your company letterhead, sign it through your normal internal process, then email the
          signed letter back to Foundation-1.
        </p>

        {initialLead.isSigned ? (
          <p className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100/78">
            Signed EOI already recorded{signedAt ? ` on ${signedAt}` : ""}. You can still copy the
            template if it needs to be reissued.
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/70 md:grid-cols-3">
          <div>
            <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/42">Step 1</p>
            <p className="mt-1">Copy the filled EOI text.</p>
          </div>
          <div>
            <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/42">Step 2</p>
            <p className="mt-1">Paste it onto company letterhead and sign it.</p>
          </div>
          <div>
            <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/42">Step 3</p>
            <p className="mt-1">
              Email the signed letter to{" "}
              <a className="text-white underline-offset-4 hover:underline" href={mailtoHref}>
                {EOI_RETURN_EMAIL}
              </a>
              .
            </p>
          </div>
        </div>

        {copyError ? (
          <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {copyError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyTemplate}
            className="rounded-xl border border-white/18 bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90"
          >
            {copied ? "Copied" : "Copy Template"}
          </button>
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-xl border border-white/14 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/78 transition hover:border-white/26 hover:text-white"
          >
            Download Text
          </button>
          <a
            href={mailtoHref}
            className="rounded-xl border border-white/14 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/78 transition hover:border-white/26 hover:text-white"
          >
            Email Signed EOI
          </a>
        </div>
      </section>

      <EoiTemplatePreview templateText={templateText} />
    </div>
  );
}
