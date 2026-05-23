"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateMigrationAssessment } from "@/lib/calculateMigrationAssessment";
import {
  useStoredMigrationAssessment,
  writeStoredMigrationAssessment,
  type StoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import styles from "@/components/migration/migration.module.css";

type ApiResponse = {
  ok?: boolean;
  error?: string;
  assessmentId?: string;
  backend?: "supabase" | "local";
};

export function MigrationRegister() {
  const router = useRouter();
  const stored = useStoredMigrationAssessment();
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyRegistrationNumber, setCompanyRegistrationNumber] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stored) return;
    if (!businessName.trim() || !contactName.trim() || !email.trim() || !phone.trim()) {
      setError("Business name, contact person, email, and phone number are required.");
      return;
    }
    if (!consent) {
      setError("Authorisation is required to continue the Migration Assessment.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/migration/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: stored.input,
          result,
          businessName,
          contactName,
          email,
          phone,
          companyRegistrationNumber,
        }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.ok || !payload.assessmentId || !payload.backend) {
        setError(payload.error ?? "Unable to register this Migration Assessment.");
        return;
      }

      const next: StoredMigrationAssessment = {
        ...stored,
        result,
        registration: {
          assessmentId: payload.assessmentId,
          backend: payload.backend,
          businessName: businessName.trim(),
          contactName: contactName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          companyRegistrationNumber: companyRegistrationNumber.trim(),
          registeredAt: new Date().toISOString(),
        },
        status: "registered",
      };
      writeStoredMigrationAssessment(next);
      router.push("/migration/upload");
    } catch {
      setError("Unable to reach the migration service. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (stored === undefined) return null;

  if (!stored) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`}>
            <h1 className={styles.sectionTitle}>Generate the report first.</h1>
            <p className={styles.sectionCopy}>
              Registration starts after the instant report so the Business sees value before creating a profile.
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

  const result = stored.result?.currentUtilityProjection
    ? stored.result
    : calculateMigrationAssessment(stored.input);

  return (
    <section className={styles.section}>
      <div className={styles.shell}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.sectionTitle}>Complete Business Details</h1>
            <p className={styles.sectionCopy}>
              Connect the estimate to your business so Foundation-1 can receive your utility
              profile and prepare the next proposal step.
            </p>
          </div>
        </div>
        <div className={`${styles.panel} ${styles.split}`}>
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.fieldStack}>
              <label className={styles.label}>
                Business name
                <input className={styles.input} value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
              </label>
              <label className={styles.label}>
                Contact person
                <input className={styles.input} value={contactName} onChange={(event) => setContactName(event.target.value)} />
              </label>
              <label className={styles.label}>
                Email
                <input className={styles.input} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label className={styles.label}>
                Phone number
                <input className={styles.input} value={phone} onChange={(event) => setPhone(event.target.value)} />
              </label>
              <label className={styles.label}>
                Company registration number optional
                <input
                  className={styles.input}
                  value={companyRegistrationNumber}
                  onChange={(event) => setCompanyRegistrationNumber(event.target.value)}
                />
              </label>
              <label className={styles.checkboxRow}>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>I authorise Foundation-1 to review my utility profile for energy migration suitability.</span>
              </label>
              {error ? <p className={styles.error}>{error}</p> : null}
              <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Registering" : "Continue to Utility Profile"}
              </button>
            </div>
          </form>
          <aside className={styles.reportPreview}>
            <span className={styles.cardLabel}>Assessment ready</span>
            <h2 className={styles.cardTitle}>{result.qualificationStatus}</h2>
            <div className={styles.cardRows}>
              <div className={styles.row}>
                <span>Next requirement</span>
                <strong>{result.recommendedPathway}</strong>
              </div>
              <div className={styles.row}>
                <span>Annual exposure</span>
                <strong>
                  {new Intl.NumberFormat("en-ZA", {
                    style: "currency",
                    currency: "ZAR",
                    maximumFractionDigits: 0,
                  }).format(result.currentUtilityProjection.currentAnnualSpend)}
                </strong>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
