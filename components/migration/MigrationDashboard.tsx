"use client";

import { useMemo } from "react";
import Link from "next/link";
import { calculateMigrationAssessment } from "@/lib/calculateMigrationAssessment";
import {
  useStoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import { MigrationProgressTracker } from "@/components/migration/MigrationProgressTracker";
import { NextActionPanel } from "@/components/migration/NextActionPanel";
import styles from "@/components/migration/migration.module.css";

function zar(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

const STATUS_LABELS: Record<string, string> = {
  draft_assessment: "Draft",
  instant_report_generated: "Report Generated",
  registered: "Registered",
  utility_profile_uploaded: "Profile Submitted",
  proposal_pending: "Proposal Pending",
  proposal_ready: "Proposal Ready",
  term_sheet_pending: "Term Sheet Pending",
  approved: "Approved",
  declined: "Declined",
};

function formatStatus(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function MigrationDashboard() {
  const stored = useStoredMigrationAssessment();

  const uploadedTypes = useMemo(() => {
    return new Set(stored?.documents.map((document) => document.documentType) ?? []);
  }, [stored]);
  const utilityProfileComplete =
    uploadedTypes.has("expression_of_interest") && uploadedTypes.has("utility_bill");

  if (stored === undefined) return null;

  if (!stored) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`}>
            <h1 className={styles.sectionTitle}>No Migration Assessment found.</h1>
            <p className={styles.sectionCopy}>Start with the instant assessment to generate a report.</p>
            <div className={styles.buttonRow}>
              <Link href="/migration/start" className={styles.primaryButton}>
                Start Migration Assessment
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const result = stored.result?.currentUtilityProjection
    ? stored.result
    : calculateMigrationAssessment(stored.input);
  const eoiDocument = stored.documents.find(
    (document) => document.documentType === "expression_of_interest",
  );
  const utilityBillDocument = stored.documents.find(
    (document) => document.documentType === "utility_bill",
  );
  const nextAction = utilityProfileComplete
    ? {
        title: "Proposal Review Pending",
        copy: "Foundation-1 can now review your utility profile and prepare the Migration Proposal.",
        primaryHref: "/migration/proposal-status",
        primaryLabel: "View Proposal Status",
      }
    : stored.registration
      ? {
          title: "Utility Profile Required",
          copy: "Upload your signed Expression of Interest and six months of utility bills to unlock proposal preparation.",
          primaryHref: "/migration/upload",
          primaryLabel: "Upload Utility Profile",
        }
      : {
          title: "Complete Business Details",
          copy: "Capture your business details first, then upload your Expression of Interest and utility bills.",
          primaryHref: "/migration/register",
          primaryLabel: "Complete Business Details",
        };

  return (
    <section className={styles.section}>
      <div className={styles.shell}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.sectionTitle}>Migration Dashboard</h1>
            <p className={styles.sectionCopy}>
              Track your profile intake, proposal preparation, and deployment status.
            </p>
          </div>
          <span className={styles.statusChip}>
            <span className={styles.statusDot} />
            {formatStatus(stored.status)}
          </span>
        </div>

        <div className={styles.metricStrip}>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Monthly spend</span>
            <span className={styles.metricValue}>{zar(result.currentUtilityProjection.currentMonthlySpend)}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Annual exposure</span>
            <span className={styles.metricValue}>{zar(result.currentUtilityProjection.currentAnnualSpend)}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Base UFMS annual saving</span>
            <span className={styles.metricValue}>{zar(result.ufmsSolar.scenarios[1].annualSaving)}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>PV-only reference annual saving</span>
            <span className={styles.metricValue}>{zar(result.wheeling.photovoltaicOnlyReference.annualSaving)}</span>
          </div>
        </div>

        <div className={`${styles.panel} ${styles.split}`} style={{ marginTop: 20 }}>
          <section className={styles.form}>
            <span className={styles.cardLabel}>Profile files</span>
            <div className={styles.documentList}>
              <div className={styles.documentRow}>
                <span>Expression of Interest</span>
                <strong>{eoiDocument?.fileName ?? "Pending"}</strong>
              </div>
              <div className={styles.documentRow}>
                <span>Six months utility bills</span>
                <strong>{utilityBillDocument?.fileName ?? "Pending"}</strong>
              </div>
            </div>
          </section>
          <section className={styles.reportPreview}>
            <span className={styles.cardLabel}>Progress</span>
            <MigrationProgressTracker activeIndex={utilityProfileComplete ? 2 : stored.registration ? 1 : 0} />
          </section>
        </div>

        <div style={{ marginTop: 20 }}>
          <NextActionPanel
            title={nextAction.title}
            copy={nextAction.copy}
            primaryHref={nextAction.primaryHref}
            primaryLabel={nextAction.primaryLabel}
            secondaryHref="/migration/report"
            secondaryLabel="View Report"
          />
        </div>
      </div>
    </section>
  );
}
