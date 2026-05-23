"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  useStoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import { MigrationProgressTracker } from "@/components/migration/MigrationProgressTracker";
import styles from "@/components/migration/migration.module.css";

export function ProposalStatus() {
  const stored = useStoredMigrationAssessment();

  const complete = useMemo(() => {
    const types = new Set(stored?.documents.map((document) => document.documentType) ?? []);
    return types.has("expression_of_interest") && types.has("utility_bill");
  }, [stored]);

  if (stored === undefined) return null;

  if (!stored) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`}>
            <h1 className={styles.sectionTitle}>No proposal status found.</h1>
            <p className={styles.sectionCopy}>Generate a Migration Assessment first.</p>
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

  return (
    <section className={styles.section}>
      <div className={styles.shell}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.sectionTitle}>
              {complete ? "Proposal Review Pending" : "Utility Profile Pending"}
            </h1>
            <p className={styles.sectionCopy}>
              The Migration Proposal can move into preparation after Foundation-1 has both required profile files.
            </p>
          </div>
        </div>
        <div className={`${styles.panel} ${styles.split}`}>
          <section className={styles.form}>
            <span className={styles.cardLabel}>Current gate</span>
            <h2 className={styles.cardTitle}>
              {complete ? "Migration Proposal Preparation" : "Upload Utility Profile"}
            </h2>
            <p className={styles.sectionCopy}>
              {complete
                ? "Your profile is ready for review. The next step is proposal preparation and term sheet review."
                : "Foundation-1 still requires the Expression of Interest and six-month utility bill."}
            </p>
            <div className={styles.buttonRow}>
              <Link href={complete ? "/migration/dashboard" : "/migration/upload"} className={styles.primaryButton}>
                {complete ? "Return to Dashboard" : "Upload Utility Profile"}
              </Link>
            </div>
          </section>
          <section className={styles.reportPreview}>
            <span className={styles.cardLabel}>Approval process</span>
            <MigrationProgressTracker activeIndex={complete ? 3 : 1} />
          </section>
        </div>
      </div>
    </section>
  );
}
