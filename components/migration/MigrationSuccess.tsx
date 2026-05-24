"use client";

import Link from "next/link";
import { Check, Download, Mail, Share2 } from "lucide-react";
import { useState } from "react";
import { useStoredMigrationAssessment } from "@/components/migration/MigrationState";
import {
  downloadMigrationReportPDF,
  emailMigrationReport,
} from "@/components/migration/MigrationReport";
import styles from "@/components/migration/migration.module.css";

function zar(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function contactMethodLabel(value: string | undefined) {
  if (value === "email") return "email";
  if (value === "phone") return "phone call";
  return "WhatsApp";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shareText(stored: any) {
  const result = stored.result;
  const bestSaving = Math.max(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...result.ufmsSolar.scenarios.map((s: any) => s.tenYearSavingAgainstEskom),
    result.wheeling.conservative.tenYearSavingAgainstEskom,
    result.wheeling.photovoltaicOnlyReference.tenYearSavingAgainstEskom,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...result.combinedScenarios.map((s: any) => s.combinedTenYearSavingAgainstEskom),
  );
  return [
    "Foundation-1 Energy Migration Estimate",
    `Business: ${stored.registration?.businessName ?? "Migration prospect"}`,
    `Monthly electricity spend: ${zar(result.currentUtilityProjection.currentMonthlySpend)}`,
    `Estimated 10-year current utility path: ${zar(result.currentUtilityProjection.tenYearSpend)}`,
    `Indicative 10-year saving range up to: ${zar(bestSaving)}`,
    "Figures are indicative and subject to formal review.",
  ].join("\n");
}

export function MigrationSuccess() {
  const stored = useStoredMigrationAssessment();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  if (stored === undefined) return null;

  if (!stored?.registration) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`} style={{ maxWidth: 560 }}>
            <h1 className={styles.sectionTitle}>No registration found.</h1>
            <p className={styles.sectionCopy}>
              Generate your migration estimate first, then submit your contact details to open a Foundation-1 file.
            </p>
            <div className={styles.buttonRow}>
              <Link href="/migration/start" className={styles.primaryButton}>Start Assessment</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const preferredContact = contactMethodLabel(stored.registration.preferredContactMethod);

  async function shareReport() {
    if (!stored) return;
    const text = shareText(stored);
    setShareStatus("");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Foundation-1 Energy Migration Estimate", text });
        setShareStatus("Report shared.");
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareStatus("Report summary copied.");
    } catch {
      setShareStatus("Unable to share automatically. Use Email Report instead.");
    }
  }

  return (
    <section className={styles.successSection}>
      {/* Full-page atmospheric rings */}
      <div className={styles.successAtmosphere} aria-hidden="true">
        <span className={styles.successRingLg} />
        <span className={styles.successRingLg} style={{ animationDelay: "0.8s" }} />
        <span className={styles.successRingLg} style={{ animationDelay: "1.6s" }} />
        <span className={styles.successRingLg} style={{ animationDelay: "2.4s" }} />
        <div className={styles.successGlowCore} />
      </div>

      <div className={styles.shell}>
        <div className={styles.successBody}>

          {/* Badge */}
          <div className={styles.successIconWrap} aria-hidden="true">
            <Check size={28} strokeWidth={2.8} />
          </div>

          {/* Headline */}
          <p className={styles.successKicker}>Registration successful</p>
          <h1 className={styles.successTitle}>
            Your Foundation&#8209;1<br />file is open.
          </h1>
          <p className={styles.successCopy}>
            A representative will reach out via{" "}
            <strong style={{ color: "rgba(255,255,255,0.88)" }}>{preferredContact}</strong>.
          </p>

          {/* Actions */}
          <div className={styles.successActions}>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={pdfLoading}
              onClick={async () => {
                setPdfLoading(true);
                try { await downloadMigrationReportPDF(stored.result); }
                finally { setPdfLoading(false); }
              }}
            >
              <Download size={15} strokeWidth={2.5} />
              {pdfLoading ? "Generating\u2026" : "Download Report"}
            </button>
            <button className={styles.ghostButton} type="button" onClick={() => void shareReport()}>
              <Share2 size={15} strokeWidth={2.5} />
              Share Report
            </button>
            <button className={styles.ghostButton} type="button" onClick={() => emailMigrationReport(stored.result)}>
              <Mail size={15} strokeWidth={2.5} />
              Email Report
            </button>
          </div>

          {shareStatus ? <p className={styles.successShareStatus}>{shareStatus}</p> : null}

          {/* Glass data strip */}
          <div className={styles.successDataStrip}>
            <div className={styles.successDataItem}>
              <span>Business</span>
              <strong>{stored.registration.businessName}</strong>
            </div>
            <div className={styles.successDataDivider} aria-hidden="true" />
            <div className={styles.successDataItem}>
              <span>Contact preference</span>
              <strong style={{ textTransform: "capitalize" }}>{preferredContact}</strong>
            </div>
            <div className={styles.successDataDivider} aria-hidden="true" />
            <div className={styles.successDataItem}>
              <span>Monthly spend</span>
              <strong>{zar(stored.result.currentUtilityProjection.currentMonthlySpend)}</strong>
            </div>
          </div>

          {/* Footer */}
          <div className={styles.successFooterLinks}>
            <Link href="/migration/report">View report again</Link>
          </div>

        </div>
      </div>
    </section>
  );
}
