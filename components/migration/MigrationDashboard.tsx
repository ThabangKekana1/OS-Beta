"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { calculateMigrationAssessment } from "@/lib/calculateMigrationAssessment";
import {
  unlockMigrationDashboard,
  useStoredMigrationAssessment,
  writeStoredMigrationAssessment,
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

function cleanProfileId(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
}

function profileIdFromUrl() {
  if (typeof window === "undefined") return "";
  return cleanProfileId(new URLSearchParams(window.location.search).get("p") ?? "");
}

function hasCompleteDashboardResult(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const result = value as {
    currentUtilityProjection?: unknown;
    ufmsSolar?: { scenarios?: unknown[] };
    wheeling?: { photovoltaicOnlyReference?: unknown };
  };
  return Boolean(
    result.currentUtilityProjection &&
    result.ufmsSolar?.scenarios?.[1] &&
    result.wheeling?.photovoltaicOnlyReference,
  );
}

export function MigrationDashboard() {
  const stored = useStoredMigrationAssessment();
  const [profileFromUrl, setProfileFromUrl] = useState("");
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [profileIdInput, setProfileIdInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    setProfileFromUrl(profileIdFromUrl());
  }, []);

  const activeStored = stored && (!profileFromUrl || stored.profileId === profileFromUrl) ? stored : null;

  useEffect(() => {
    if (!activeStored?.profileId || !activeStored?.accessCode) {
      setUnlocked(false);
      return;
    }
    const flag = sessionStorage.getItem("foundation1:migration:unlocked");
    setUnlocked(flag === activeStored.profileId);
  }, [activeStored]);

  useEffect(() => {
    const nextProfileId = profileFromUrl || activeStored?.profileId || "";
    if (nextProfileId) setProfileIdInput(nextProfileId);
  }, [activeStored?.profileId, profileFromUrl]);

  async function attemptUnlock() {
    const profileId = cleanProfileId(profileIdInput || profileFromUrl || activeStored?.profileId || "");
    const accessCode = codeInput.replace(/\D/g, "");

    if (!profileId) {
      setCodeError("Enter your Profile ID.");
      return;
    }
    if (!/^\d{4}$/.test(accessCode)) {
      setCodeError("Enter the 4-digit access code.");
      return;
    }

    if (activeStored?.profileId === profileId && activeStored.accessCode === accessCode) {
      unlockMigrationDashboard(profileId);
      setUnlocked(true);
      return;
    }

    setLoginLoading(true);
    setCodeError("");
    try {
      const response = await fetch("/api/migration/profiles/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, accessCode }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        assessment?: Parameters<typeof writeStoredMigrationAssessment>[0];
      };

      if (!response.ok || !payload.ok || !payload.assessment) {
        setCodeError(payload.error ?? "Unable to unlock this Migration Profile.");
        return;
      }

      writeStoredMigrationAssessment(payload.assessment);
      unlockMigrationDashboard(profileId);
      setUnlocked(true);
    } catch {
      setCodeError("Unable to reach the Migration Profile store. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  }

  const uploadedTypes = useMemo(() => {
    return new Set(activeStored?.documents.map((document) => document.documentType) ?? []);
  }, [activeStored]);
  const utilityProfileComplete =
    uploadedTypes.has("expression_of_interest") && uploadedTypes.has("utility_bill");

  if (stored === undefined || unlocked === null) return null;

  if (!activeStored || !unlocked) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`} style={{ maxWidth: 420 }}>
            <h1 className={styles.sectionTitle} style={{ fontSize: "1.1rem" }}>Unlock Migration Dashboard</h1>
            <p className={styles.sectionCopy}>
              Enter the Profile ID from your unique dashboard link and the 4-digit access code you were issued.
            </p>
            <div className={styles.fieldStack} style={{ marginTop: 20 }}>
              <label className={styles.label}>
                Profile ID
                <input
                  className={styles.input}
                  type="text"
                  value={profileIdInput}
                  placeholder="F1-ABCDEFGH"
                  onChange={(e) => {
                    setCodeError("");
                    setProfileIdInput(cleanProfileId(e.target.value));
                  }}
                />
              </label>
              <label className={styles.label}>
                Access Code
                <input
                  className={styles.input}
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={codeInput}
                  placeholder="0000"
                  onChange={(e) => {
                    setCodeError("");
                    setCodeInput(e.target.value.replace(/\D/g, ""));
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") void attemptUnlock(); }}
                />
              </label>
              {codeError && <p className={styles.error}>{codeError}</p>}
              <button
                className={styles.primaryButton}
                type="button"
                disabled={loginLoading}
                onClick={() => void attemptUnlock()}
              >
                {loginLoading ? "Unlocking…" : "Unlock Dashboard"}
              </button>
              <Link href="/migration/start" className={styles.ghostButton}>
                Start New Assessment
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const result = hasCompleteDashboardResult(activeStored.result)
    ? activeStored.result
    : calculateMigrationAssessment(activeStored.input);
  const eoiDocument = activeStored.documents.find(
    (document) => document.documentType === "expression_of_interest",
  );
  const utilityBillDocument = activeStored.documents.find(
    (document) => document.documentType === "utility_bill",
  );
  const nextAction = utilityProfileComplete
    ? {
        title: "Proposal Review Pending",
        copy: "Foundation-1 can now review your utility profile and prepare the Migration Proposal.",
        primaryHref: "/migration/proposal-status",
        primaryLabel: "View Proposal Status",
      }
    : activeStored.registration
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
            {formatStatus(activeStored.status)}
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
            <MigrationProgressTracker activeIndex={utilityProfileComplete ? 2 : activeStored.registration ? 1 : 0} />
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
