"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MigrationReport } from "@/components/migration/MigrationReport";
import {
  calculateMigrationAssessment,
  type MigrationAssessmentResult,
} from "@/lib/calculateMigrationAssessment";
import {
  useStoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import styles from "@/components/migration/migration.module.css";

const QUALIFICATION_THRESHOLD_ZAR = 10000;

function isCurrentMigrationAssessmentResult(
  result: unknown,
): result is MigrationAssessmentResult {
  if (!result || typeof result !== "object") return false;

  const candidate = result as Partial<MigrationAssessmentResult>;
  return Boolean(
    candidate.currentUtilityProjection &&
      Array.isArray(candidate.ufmsSolar?.scenarios) &&
      candidate.ufmsSolar.scenarios.length === 3 &&
      candidate.wheeling?.conservative &&
      candidate.wheeling?.photovoltaicOnlyReference &&
      Array.isArray(candidate.combinedScenarios) &&
      (candidate.combinedScenarios as unknown[]).length > 0,
  );
}

export function MigrationReportPageClient() {
  const stored = useStoredMigrationAssessment();
  const router = useRouter();

  const spend = stored
    ? stored.input.monthlyElectricitySpend ?? stored.input.monthlySpend ?? 0
    : 0;
  const disqualified = Boolean(stored) && spend > 0 && spend < QUALIFICATION_THRESHOLD_ZAR;

  useEffect(() => {
    if (disqualified) {
      router.replace("/migration/unsuccessful");
    }
  }, [disqualified, router]);

  if (stored === undefined) {
    return null;
  }

  if (disqualified) {
    return null;
  }

  if (!stored) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`}>
            <h1 className={styles.sectionTitle}>No migration report found.</h1>
            <p className={styles.sectionCopy}>
              Generate the instant assessment first so the report can be calculated from your migration inputs.
            </p>
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

  const result = isCurrentMigrationAssessmentResult(stored.result)
    ? stored.result
    : calculateMigrationAssessment(stored.input);

  return <MigrationReport result={result} />;
}
