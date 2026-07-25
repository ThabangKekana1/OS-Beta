"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { downloadBlobFile } from "@/lib/download-utils";
import styles from "@/components/migration/migration.module.css";

function responseFilename(response: Response) {
  const disposition = response.headers.get("content-disposition") ?? "";
  return disposition.match(/filename="?([^";]+)"?/i)?.[1]?.trim()
    ?? "foundation-1-bill-audited-assessment.pdf";
}

export function ProposalPdfDownloadButton({
  profileId,
  accessCode,
}: {
  profileId: string;
  accessCode: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  async function downloadProposal() {
    setDownloading(true);
    setError("");
    try {
      const response = await fetch("/api/migration/proposal/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, accessCode }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Unable to prepare the assessment PDF.");
        return;
      }
      downloadBlobFile(responseFilename(response), await response.blob());
    } catch {
      setError("Unable to reach the document service. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className={`${styles.downloadAction} ${styles.printHide}`}>
      <button
        type="button"
        onClick={downloadProposal}
        disabled={downloading}
        className={styles.downloadButton}
      >
        <Download size={16} aria-hidden="true" />
        {downloading ? "Building your PDF…" : "Download Foundation-1 assessment"}
      </button>
      {error ? <p className={styles.downloadError} role="alert">{error}</p> : null}
    </div>
  );
}
