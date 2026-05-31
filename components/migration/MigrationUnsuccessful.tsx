"use client";

import Link from "next/link";
import styles from "@/components/migration/migration.module.css";

export function MigrationUnsuccessful() {
  return (
    <section className={styles.unsuccessfulSection}>
      <div className={styles.unsuccessfulAurora} aria-hidden>
        <div className={styles.unsuccessfulAuroraA} />
        <div className={styles.unsuccessfulAuroraB} />
        <div className={styles.unsuccessfulNoise} />
      </div>

      <div className={styles.unsuccessfulShell}>
        <div className={styles.unsuccessfulBadge} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle
              cx="12"
              cy="12"
              r="10.25"
              stroke="currentColor"
              strokeWidth="1"
              strokeOpacity="0.55"
            />
            <path
              d="M12 7.5v5.2"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="12" cy="16.4" r="0.95" fill="currentColor" />
          </svg>
        </div>

        <p className={styles.unsuccessfulEyebrow}>Qualification Result</p>
        <h1 className={styles.unsuccessfulTitle}>
          You&apos;re just below the threshold.
        </h1>
        <p className={styles.unsuccessfulCopy}>
          The Foundation-1 Energy Migration program currently serves businesses with a monthly
          electricity spend of <span className={styles.unsuccessfulHighlight}>R10,000 or more</span>.
          Based on what you entered, your business doesn&apos;t qualify for the migration
          assessment at this time.
        </p>

        <div className={styles.unsuccessfulDivider} aria-hidden />

        <dl className={styles.unsuccessfulMeta}>
          <div className={styles.unsuccessfulMetaItem}>
            <dt>Minimum spend</dt>
            <dd>R10,000 / month</dd>
          </div>
          <div className={styles.unsuccessfulMetaItem}>
            <dt>Status</dt>
            <dd>Not qualified</dd>
          </div>
        </dl>

        <div className={styles.unsuccessfulActions}>
          <Link href="/migration/start" className={styles.unsuccessfulPrimary}>
            Re-run assessment
          </Link>
          <Link href="/" className={styles.unsuccessfulSecondary}>
            Back to home
          </Link>
        </div>

        <p className={styles.unsuccessfulFootnote}>
          As your energy usage grows, you&apos;re welcome to return and run the assessment again.
        </p>
      </div>
    </section>
  );
}
