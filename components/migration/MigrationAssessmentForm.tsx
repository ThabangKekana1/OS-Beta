"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateMigrationAssessment,
  type MigrationAssessmentInput,
} from "@/lib/calculateMigrationAssessment";
import styles from "@/components/migration/migration.module.css";
import {
  clearStoredMigrationAssessment,
  type MigrationLeadAttribution,
  writeStoredMigrationAssessment,
} from "@/components/migration/MigrationState";

function parseCurrency(value: string) {
  const numeric = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatSpendInput(raw: string): string {
  // Strip everything except digits and a single decimal point
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";

  const firstDot = cleaned.indexOf(".");
  const intPart =
    firstDot === -1 ? cleaned : cleaned.slice(0, firstDot);
  const decimalPart =
    firstDot === -1
      ? ""
      : "." + cleaned.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);

  const intWithCommas = intPart.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `R${intWithCommas || "0"}${decimalPart}`;
}

const QUALIFICATION_THRESHOLD_ZAR = 10000;

export function MigrationAssessmentForm({
  paneClass,
  leadAttribution = null,
}: {
  paneClass?: string;
  leadAttribution?: MigrationLeadAttribution | null;
}) {
  const router = useRouter();
  const [monthlySpend, setMonthlySpend] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const spend = parseCurrency(monthlySpend);
    if (spend <= 0) {
      setError("Enter a valid monthly electricity spend greater than zero.");
      return;
    }

    if (spend < QUALIFICATION_THRESHOLD_ZAR) {
      clearStoredMigrationAssessment();
      setLoading(true);
      setTimeout(() => {
        router.push("/migration/unsuccessful");
      }, 5000);
      return;
    }

    const input: MigrationAssessmentInput = {
      monthlyElectricitySpend: spend,
    };
    const result = calculateMigrationAssessment(input);

    writeStoredMigrationAssessment({
      input,
      result,
      documents: [],
      leadAttribution,
      status: "instant_report_generated",
      updatedAt: new Date().toISOString(),
    });

    setLoading(true);
    setTimeout(() => {
      router.push("/migration/report");
    }, 5000);
  };

  return (
    <>
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.solarLoader}>
            <div className={styles.solarPulse} />
            <div className={styles.solarPulse} />
            <div className={styles.solarPulse} />
            <div className={styles.solarOrbitRing}>
              <div className={styles.solarOrbitDot} />
            </div>
            <div className={styles.solarCore} />
          </div>
          <div className={styles.loadingTextBlock}>
            <span className={`${styles.loadingStep} ${styles.loadingStep1}`}>
              Modelling your electricity exposure
            </span>
            <span className={`${styles.loadingStep} ${styles.loadingStep2}`}>
              Calculating saving scenarios
            </span>
            <span className={`${styles.loadingStep} ${styles.loadingStep3}`}>
              Preparing your report
            </span>
          </div>
          <p className={styles.loadingMeta}>This will only take a moment</p>
        </div>
      )}
      <form className={paneClass ?? styles.form} onSubmit={submit}>
        <div className={styles.fieldStack}>
          <label className={styles.label}>
            Monthly Electricity Spend
            <input
              className={styles.input}
              value={monthlySpend}
              inputMode="decimal"
              placeholder="e.g R10,000"
              onChange={(event) => setMonthlySpend(formatSpendInput(event.target.value))}
            />
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}

          <button className={styles.primaryButton} type="submit">
            Generate Migration Assessment
          </button>
        </div>
      </form>
    </>
  );
}
