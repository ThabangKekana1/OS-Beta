"use client";

import { useEffect, useState } from "react";
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

const SUPPORT_EMAIL = "support@foundation-1.co.za";
const WHATSAPP_PHONE_DISPLAY = "+27 69 036 8243";
const WHATSAPP_LINK = "https://wa.me/27690368243";

type AdminProfileStatus = {
  leadId: string;
  clientProfileId: string;
  adminStage: string;
  migrationStatus: string;
  readinessScore: number;
  nextAction: string | null;
  documents: Array<{
    id: string;
    title: string;
    status: string;
    uploadedByType: string;
    fileName: string | null;
    createdAt: string | null;
  }>;
};

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
  registered: "Client Profile Opened",
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

function progressIndexForStatus(status: string) {
  if (status === "approved" || status === "declined") return 4;
  if (status === "term_sheet_pending") return 3;
  if (status === "proposal_pending" || status === "proposal_ready") return 2;
  if (status === "utility_profile_uploaded" || status === "registered") return 2;
  return 0;
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

function WhatsAppIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={styles.whatsappIcon}
      focusable="false"
    >
      <path
        d="M12 3.25a8.66 8.66 0 0 0-7.47 13.05L3.5 20.5l4.28-1a8.66 8.66 0 1 0 4.22-16.25Zm0 1.7a6.96 6.96 0 0 1 0 13.92 6.9 6.9 0 0 1-3.58-.99l-.3-.18-2.18.51.52-2.11-.2-.32A6.96 6.96 0 0 1 12 4.95Zm-2.38 3.36c-.17 0-.43.06-.66.31-.23.26-.87.86-.87 2.09 0 1.23.9 2.42 1.03 2.59.13.17 1.75 2.79 4.31 3.8 2.13.84 2.56.67 3.02.63.46-.04 1.49-.61 1.7-1.2.21-.59.21-1.1.15-1.2-.07-.11-.23-.17-.49-.3-.26-.13-1.49-.74-1.73-.82-.23-.09-.4-.13-.57.13-.17.25-.66.82-.81.99-.15.17-.3.19-.55.06-.26-.13-1.08-.4-2.06-1.27-.76-.68-1.28-1.52-1.43-1.78-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.57-1.39-.79-1.9-.2-.49-.41-.42-.57-.43l-.44-.01Z"
        fill="currentColor"
      />
    </svg>
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
  const [adminStatus, setAdminStatus] = useState<AdminProfileStatus | null>(null);
  const [adminStatusError, setAdminStatusError] = useState("");

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

  useEffect(() => {
    if (!unlocked || !activeStored?.registration || !activeStored.profileId || !activeStored.accessCode) {
      setAdminStatus(null);
      setAdminStatusError("");
      return;
    }

    let cancelled = false;
    async function loadAdminStatus() {
      try {
        const response = await fetch("/api/migration/profiles/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: activeStored?.profileId,
            accessCode: activeStored?.accessCode,
          }),
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          linked?: boolean;
          error?: string;
          status?: AdminProfileStatus | null;
        } | null;

        if (cancelled) return;
        if (!response.ok || !payload?.ok) {
          setAdminStatus(null);
          setAdminStatusError(payload?.error ?? "Unable to load live admin profile status.");
          return;
        }

        setAdminStatus(payload.linked && payload.status ? payload.status : null);
        setAdminStatusError("");
      } catch {
        if (!cancelled) {
          setAdminStatus(null);
          setAdminStatusError("Unable to load live admin profile status.");
        }
      }
    }

    void loadAdminStatus();
    const interval = window.setInterval(loadAdminStatus, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activeStored?.accessCode,
    activeStored?.profileId,
    activeStored?.registration,
    activeStored?.registration?.leadId,
    activeStored?.updatedAt,
    unlocked,
  ]);

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

  if (!activeStored.registration) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`} style={{ maxWidth: 560 }}>
            <h1 className={styles.sectionTitle} style={{ fontSize: "1.4rem" }}>Open Client Profile</h1>
            <p className={styles.sectionCopy}>
              This dashboard opens once Foundation-1 has opened your client file from the report. Add the short contact details first to activate live proposal and approval status.
            </p>
            <div className={styles.buttonRow}>
              <Link href="/migration/report" className={styles.primaryButton}>
                Open Profile From Report
              </Link>
              <Link href="/migration/report" className={styles.ghostButton}>
                View Report
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
  const displayStatus = adminStatus?.migrationStatus ?? activeStored.status;
  const progressIndex = progressIndexForStatus(displayStatus);
  const nextAction = {
    title: "Proposal Review Pending",
    copy: adminStatus?.nextAction ?? "Foundation-1 can now review your client profile and prepare the Migration Proposal.",
    primaryHref: "/migration/proposal-status",
    primaryLabel: "View Proposal Status",
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
          <div className={styles.dashboardHeaderActions}>
            <span className={styles.statusChip}>
              <span className={styles.statusDot} />
              {formatStatus(displayStatus)}
            </span>
            <div className={styles.supportLinks} aria-label="Foundation-1 support contacts">
              <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.supportLink}>
                {SUPPORT_EMAIL}
              </a>
              <a
                href={WHATSAPP_LINK}
                className={`${styles.supportLink} ${styles.whatsappLink}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Chat to Foundation-1 on WhatsApp at ${WHATSAPP_PHONE_DISPLAY}`}
              >
                <WhatsAppIcon />
                <span>WhatsApp {WHATSAPP_PHONE_DISPLAY}</span>
              </a>
            </div>
          </div>
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
            <span className={styles.cardLabel}>Client profile</span>
            <div className={styles.documentList}>
              {adminStatus ? (
                <div className={styles.documentRow}>
                  <span>Admin profile stage</span>
                  <strong>{adminStatus.adminStage}</strong>
                </div>
              ) : null}
              {adminStatus?.documents[0] ? (
                <div className={styles.documentRow}>
                  <span>Latest admin document</span>
                  <strong>{adminStatus.documents[0].title}</strong>
                </div>
              ) : null}
            </div>
            {adminStatusError ? <p className={styles.error}>{adminStatusError}</p> : null}
          </section>
          <section className={styles.reportPreview}>
            <span className={styles.cardLabel}>Progress</span>
            <MigrationProgressTracker activeIndex={progressIndex} />
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
