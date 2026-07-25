"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, Download, LockKeyhole, PenLine, ShieldCheck, Sparkles } from "lucide-react";
import { downloadBlobFile } from "@/lib/download-utils";
import type { EoiTemplateLead } from "@/lib/eoi-template";
import styles from "@/components/eoi/eoi.module.css";

type EoiLeadView = EoiTemplateLead & {
  stage: string;
  eoiSignatureId: string | null;
  eoiSignedBy: string | null;
  eoiSignedAt: string | null;
  eoiAcceptedTermsAt: string | null;
  isSigned: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-ZA", { dateStyle: "long", timeStyle: "short" });
}

function EoiDocument({ lead }: { lead: EoiLeadView }) {
  const signer = lead.eoiSignedBy || lead.contactName;
  return (
    <article className={styles.document} aria-label="Expression of Interest document">
      <header className={styles.documentHeader}>
        <div className={styles.documentBrand}>
          <Image src="/foundation-1-icon.png" alt="" width={34} height={34} />
          <strong>Foundation-1</strong>
        </div>
        <div className={styles.documentMeta}>
          <span>Non-binding EOI</span>
          <strong>{lead.clientProfileId}</strong>
        </div>
      </header>
      <div className={styles.documentRule} />
      <p className={styles.documentEyebrow}>Renewable energy supply</p>
      <h2>Expression of Interest</h2>
      <p className={styles.addressLine}>To: Foundation-1 (Pty) Ltd</p>
      <div className={styles.documentBody}>
        <p><strong>{lead.company}</strong> has reviewed the completed Foundation-1 energy-migration assessment prepared from its submitted operating evidence.</p>
        <p>Subject to all relevant approvals, we confirm our interest in continuing from that assessment with Foundation-1 and its approved supply and funding partners. We authorise a terms-formulation period so formal commercial, financial and technical options can be prepared.</p>
        <p>We request Foundation-1 to engage the relevant stakeholders to obtain the information and approvals required to formulate formal terms.</p>
        <p>If commercial and technical alignment is reached, <strong>{lead.company}</strong> wishes to explore a comprehensive zero-capex solar, storage, wheeling or related energy-migration agreement.</p>
        <p><strong>This Expression of Interest is non-binding.</strong> It does not oblige {lead.company}, Foundation-1 or any supply or funding partner to conclude a transaction. A binding relationship can arise only through a separate definitive agreement signed by the relevant parties.</p>
      </div>
      <footer className={styles.signatureBlock}>
        <div>
          <span>Authorised signatory</span>
          <strong className={styles.signatureName}>{signer}</strong>
          <p>{lead.userProfile.role || "Authorised representative"}</p>
          <p>{lead.company}</p>
          <p>{lead.businessRegistrationNumber || "Registration number not supplied"}</p>
        </div>
        <div className={styles.signatureCertificate}>
          {lead.isSigned ? <Check size={20} aria-hidden="true" /> : <PenLine size={20} aria-hidden="true" />}
          <span>{lead.isSigned ? "Digitally signed" : "Awaiting signature"}</span>
          {lead.eoiSignedAt ? <small>{formatDate(lead.eoiSignedAt)}</small> : null}
          {lead.eoiSignatureId ? <small>Record {lead.eoiSignatureId}</small> : null}
        </div>
      </footer>
    </article>
  );
}

export function EoiSigningForm({ token, initialLead }: { token: string; initialLead: EoiLeadView }) {
  const [lead, setLead] = useState(initialLead);
  const [signedBy, setSignedBy] = useState(initialLead.contactName);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [signing, setSigning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  async function signEoi() {
    setSigning(true);
    setError("");
    try {
      const response = await fetch(`/api/eoi/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedBy, acceptedTerms }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; lead?: EoiLeadView } | null;
      if (!response.ok || !payload?.ok || !payload.lead) {
        setError(payload?.error ?? "Unable to sign the EOI.");
        return;
      }
      setLead(payload.lead);
      setAcceptedTerms(false);
    } catch {
      setError("Unable to reach the signature service. Try again.");
    } finally {
      setSigning(false);
    }
  }

  async function downloadSignedEoi() {
    setDownloading(true);
    setError("");
    try {
      const response = await fetch(`/api/eoi/${token}`, { method: "PUT" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Unable to prepare the signed EOI.");
        return;
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "foundation-1-signed-eoi.pdf";
      downloadBlobFile(filename, await response.blob());
    } catch {
      setError("Unable to download the signed EOI. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className={styles.experience}>
      <div className={styles.ambientOne} />
      <div className={styles.ambientTwo} />
      <header className={styles.topbar}>
        <Image src="/logo.png" alt="Foundation-1" width={120} height={40} className={styles.topbarLogo} />
        <span><LockKeyhole size={14} /> Secure digital agreement</span>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.heroEyebrow}><Sparkles size={14} /> Assessment complete · authorization next</p>
          <h1>{lead.isSigned ? "Interest confirmed." : "Continue from the evidence."}</h1>
          <p>{lead.isSigned
            ? "Your signed Expression of Interest is securely recorded. Foundation-1 can now coordinate the formal UFMS proposal."
            : "Review the non-binding letter after the completed assessment, confirm your authority, and digitally sign. This authorises formal-proposal preparation—not a purchase."}</p>
        </div>
        <div className={styles.trustRail}>
          <span><ShieldCheck size={16} /> Non-binding</span>
          <span><LockKeyhole size={16} /> Timestamped</span>
          <span><Download size={16} /> Downloadable</span>
        </div>
      </section>

      <div className={styles.layout}>
        <EoiDocument lead={lead} />
        <aside className={styles.signingPanel}>
          {lead.isSigned ? (
            <>
              <div className={styles.successMark}><Check size={26} /></div>
              <p className={styles.panelEyebrow}>Signature complete</p>
              <h2>Your EOI is safely recorded.</h2>
              <p>Signed by <strong>{lead.eoiSignedBy}</strong> on {formatDate(lead.eoiSignedAt)}. A permanent signature record is attached to the client profile.</p>
              <button type="button" className={styles.primaryAction} onClick={downloadSignedEoi} disabled={downloading}>
                <Download size={17} /> {downloading ? "Preparing PDF…" : "Download signed EOI"}
              </button>
              <a href="/migration/dashboard" className={styles.secondaryAction}>Continue to dashboard</a>
            </>
          ) : (
            <>
              <p className={styles.panelEyebrow}>Digital signature</p>
              <h2>Confirm on behalf of {lead.company}</h2>
              <label className={styles.fieldLabel}>
                Full name of authorised signatory
                <input value={signedBy} onChange={(event) => setSignedBy(event.target.value)} autoComplete="name" />
              </label>
              <div className={styles.termsBox}>
                <strong>What you are agreeing to</strong>
                <ul>
                  <li>Foundation-1 may continue from the completed assessment and formulate formal options.</li>
                  <li>This EOI is non-binding and creates no purchase obligation.</li>
                  <li>Any final transaction requires a separate signed agreement and approvals.</li>
                </ul>
              </div>
              <label className={styles.consentRow}>
                <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
                <span>I confirm that I am authorised to act for {lead.company}, have read this EOI, and accept the <a href="/terms" target="_blank">Terms of Service</a> and <a href="/privacy" target="_blank">Privacy Notice</a>.</span>
              </label>
              <button type="button" className={styles.primaryAction} onClick={signEoi} disabled={signing || !acceptedTerms || signedBy.trim().length < 2}>
                <PenLine size={17} /> {signing ? "Applying secure signature…" : "Sign non-binding EOI"}
              </button>
              <p className={styles.securityNote}><ShieldCheck size={15} /> A server timestamp and unique signature record are created when you sign.</p>
            </>
          )}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </aside>
      </div>
    </main>
  );
}
