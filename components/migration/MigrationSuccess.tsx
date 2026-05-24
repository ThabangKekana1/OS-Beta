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

function shareText(stored: NonNullable<ReturnType<typeof useStoredMigrationAssessment>>) {
  const result = stored.result;
  const bestSaving = Math.max(
    ...result.ufmsSolar.scenarios.map((scenario) => scenario.tenYearSavingAgainstEskom),
    result.wheeling.conservative.tenYearSavingAgainstEskom,
    result.wheeling.photovoltaicOnlyReference.tenYearSavingAgainstEskom,
    ...result.combinedScenarios.map((scenario) => scenario.combinedTenYearSavingAgainstEskom),
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
        await navigator.share({
          title: "Foundation-1 Energy Migration Estimate",
          text,
        });
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
      <div className={styles.successAura} aria-hidden="true" />
      <div className={styles.shell}>
        <div className={styles.successCard}>
          <div className={styles.successOrb} aria-hidden="true">
            <span className={styles.successRing} />
            <span className={styles.successRing} />
            <span className={styles.successRing} />
            <span className={styles.successCheck}>
              <Check size={42} strokeWidth={2.6} />
            </span>
          </div>

          <span className={styles.successKicker}>Registration successful</span>
          <h1 className={styles.successTitle}>Your Foundation-1 file is open.</h1>
          <p className={styles.successCopy}>
            Thanks, {stored.registration.contactName}. A Foundation-1 representative will contact you via {preferredContact} using the details you provided. Your estimate and intake profile are now linked to the admin dashboard.
          </p>

          <div className={styles.successMetaGrid}>
            <div>
              <span>Business</span>
              <strong>{stored.registration.businessName}</strong>
            </div>
            <div>
              <span>Preferred contact</span>
              <strong>{preferredContact}</strong>
            </div>
            <div>
              <span>Monthly spend</span>
              <strong>{zar(stored.result.currentUtilityProjection.currentMonthlySpend)}</strong>
            </div>
          </div>

          <div className={styles.successActions}>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={pdfLoading}
              onClick={async () => {
                setPdfLoading(true);
                try {
                  await downloadMigrationReportPDF(stored.result);
                } finally {
                  setPdfLoading(false);
                }
              }}
            >
              <Download size={15} strokeWidth={2.5} />
              {pdfLoading ? "Generating…" : "Download Report"}
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => void shareReport()}>
              <Share2 size={15} strokeWidth={2.5} />
              Share Report
            </button>
            <button className={styles.ghostButton} type="button" onClick={() => emailMigrationReport(stored.result)}>
              <Mail size={15} strokeWidth={2.5} />
              Email Report
            </button>
          </div>

          {shareStatus ? <p className={styles.successShareStatus}>{shareStatus}</p> : null}

          <div className={styles.successFooterLinks}>
            <Link href="/migration/report">View report again</Link>
            <span aria-hidden="true">•</span>
            <Link href="/migration/upload">Upload documents if ready</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
