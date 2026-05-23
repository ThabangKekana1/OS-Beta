"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "@/components/migration/migration.module.css";
import { useStoredMigrationAssessment } from "@/components/migration/MigrationState";

export function MigrationShell({ children }: { children: React.ReactNode }) {
  const stored = useStoredMigrationAssessment();
  const hasReport = stored !== null;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.nav} aria-label="Migration navigation">
          <Link href="/migration" className={styles.brand}>
            <Image
              src="/favicon.png"
              alt="Foundation-1"
              width={26}
              height={26}
              className={styles.brandIcon}
            />
            <span className={styles.brandName}>Foundation-1</span>
            <span className={styles.brandPill}>Migration</span>
          </Link>
          <div className={styles.navLinks}>
            <Link href="/migration/start">Assessment</Link>
            {hasReport && <Link href="/migration/report">Report</Link>}
            {hasReport && <Link href="/migration/dashboard">Dashboard</Link>}
          </div>
        </nav>
      </div>
      {children}
    </main>
  );
}
