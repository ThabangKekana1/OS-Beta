"use client";

import Link from "next/link";
import {
  useStoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import { MigrationProgressTracker } from "@/components/migration/MigrationProgressTracker";
import styles from "@/components/migration/migration.module.css";

export function ProposalStatus() {
  const stored = useStoredMigrationAssessment();

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
            <h1 className={styles.sectionTitle}>Proposal Review Pending</h1>
            <p className={styles.sectionCopy}>
              Foundation-1 will prepare the Migration Proposal from your client profile and live qualification status.
            </p>
          </div>
        </div>
        <div className={`${styles.panel} ${styles.split}`}>
          <section className={styles.form}>
            <span className={styles.cardLabel}>Current gate</span>
            <h2 className={styles.cardTitle}>Migration Proposal Preparation</h2>
            <p className={styles.sectionCopy}>
              Your profile is ready for review. The next step is proposal preparation and term sheet review.
            </p>
            <div className={styles.buttonRow}>
              <Link href="/migration/dashboard" className={styles.primaryButton}>
                Return to Dashboard
              </Link>
            </div>
          </section>
          <section className={styles.reportPreview}>
            <span className={styles.cardLabel}>Approval process</span>
            <MigrationProgressTracker activeIndex={2} />
          </section>
        </div>
      </div>
    </section>
  );
}
