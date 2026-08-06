"use client";

import { useEffect, useState } from "react";
import { calculateMigrationAssessment } from "@/lib/calculateMigrationAssessment";
import {
  unlockMigrationDashboard,
  useStoredMigrationAssessment,
  writeStoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import { MigrationProgressTracker } from "@/components/migration/MigrationProgressTracker";
import { NextActionPanel } from "@/components/migration/NextActionPanel";
import { DirectUfmsKycHandoff } from "@/components/migration/DirectUfmsKycHandoff";
import { ProposalExplainer } from "@/components/migration/ProposalExplainer";
import { countDocumentsByType } from "@/lib/document-taxonomy";
import styles from "@/components/migration/migration.module.css";

const SUPPORT_EMAIL = "support@1os.foundation-1.co.za";
const WHATSAPP_PHONE_DISPLAY = "+27 69 036 8243";
const WHATSAPP_LINK = "https://wa.me/27690368243";
const WEBSITE_ORIGIN = process.env.NEXT_PUBLIC_WEBSITE_ORIGIN ?? "https://foundation-1.co.za";
const WEBSITE_ASSESSMENT_URL = `${WEBSITE_ORIGIN}/pricing`;

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
  uploadToken?: string | null;
  eoiToken?: string | null;
  proposalAcceptedAt?: string | null;
  mandateToken?: string | null;
  mandateSignedAt?: string | null;
  directKycSubmittedAt?: string | null;
  directKycSubmittedBy?: string | null;
  directKycRecipient?: string | null;
  formalProposalIssued?: boolean;
  assessmentCompleted?: boolean;
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
  proposal_pending: "Assessment Pending",
  proposal_ready: "Assessment Ready",
  proposal_accepted: "Proposal Accepted",
  mandate_signed: "Formal Authorization Signed",
  term_sheet_pending: "Term Sheet Pending",
  direct_kyc_submitted: "Direct KYC Submitted",
  approved: "Approved",
  declined: "Declined",
};

function formatStatus(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

function progressIndexForStatus(status: string, adminStage?: string) {
  // 9-step journey: first report → complete bills → assessment → EOI →
  // formal proposal → signed proposal → direct KYC → funding → close.
  const stage = (adminStage ?? "").toLowerCase();
  if (stage.includes("onboarding complete")) return 8;
  if (status === "approved" || status === "declined") return 8;
  if (stage.includes("term sheet")) return 8;
  if (status === "term_sheet_pending") return 8;
  if (stage.includes("direct kyc submitted") || status === "direct_kyc_submitted") return 7;
  if (stage.includes("mandate signed") || stage.includes("signed proposal")) return 6;
  if (stage.includes("proposal accepted")) return 5;
  if (stage.includes("eoi signed")) return 4;
  if (stage.includes("proposal ready") || stage.includes("compliance pack")) return 3;
  if (status === "proposal_ready" || status === "proposal_pending") return 3;
  if (status === "utility_profile_uploaded") return 2;
  if (status === "registered") return 1;
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
  const [refreshTick, setRefreshTick] = useState(0);

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
    refreshTick,
  ]);

  if (stored === undefined || unlocked === null) return null;

  if (!activeStored || !unlocked) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`} style={{ maxWidth: 420, margin: "0 auto" }}>
            <h1 className={styles.sectionTitle} style={{ fontSize: "1.1rem" }}>Unlock Migration Dashboard</h1>
            <p className={styles.sectionCopy}>
              Enter the Profile ID from your unique dashboard link and the 4-digit access code shown when you registered.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void attemptUnlock();
              }}
            >
              <div className={styles.fieldStack} style={{ marginTop: 20 }}>
                <label className={styles.label}>
                  Profile ID
                  <input
                    className={styles.input}
                    type="text"
                    value={profileIdInput}
                    placeholder="F1-ABCDEFGH"
                    autoComplete="username"
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
                    pattern="\d{4}"
                    autoComplete="one-time-code"
                    maxLength={4}
                    value={codeInput}
                    placeholder="0000"
                    onChange={(e) => {
                      setCodeError("");
                      setCodeInput(e.target.value.replace(/\D/g, ""));
                    }}
                  />
                </label>
                {codeError && (
                  <div>
                    <p className={styles.error} role="alert">{codeError}</p>
                    <a
                      className={styles.supportLink}
                      href={`https://wa.me/27690368243?text=${encodeURIComponent(
                        `Hi Foundation-1, I can't unlock my migration dashboard. My Profile ID is ${profileIdInput || "(not sure)"} .`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Stuck? WhatsApp us and we&apos;ll get you in.
                    </a>
                  </div>
                )}
                <button
                  className={styles.primaryButton}
                  type="submit"
                  disabled={loginLoading}
                >
                  {loginLoading ? "Unlocking…" : "Unlock Dashboard"}
                </button>
                <a href={WEBSITE_ASSESSMENT_URL} className={styles.ghostButton}>
                  Start a new assessment
                </a>
              </div>
            </form>
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
              Your dashboard activates once you complete the assessment and registration on the
              Foundation-1 website. It takes one number and a minute.
            </p>
            <div className={styles.buttonRow}>
              <a href={WEBSITE_ASSESSMENT_URL} className={styles.primaryButton}>
                Complete Registration
              </a>
              <a
                href={`${WHATSAPP_LINK}?text=${encodeURIComponent("Hi Foundation-1, I need help activating my dashboard.")}`}
                className={styles.ghostButton}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp Support
              </a>
            </div>
          </div>
        </div>
      </section>
    );
  }

  let result: ReturnType<typeof calculateMigrationAssessment> | null = null;
  try {
    // Recompute when the stored result predates the engine (`proposal` missing)
    // so the explainer and honest numbers always render.
    result =
      hasCompleteDashboardResult(activeStored.result) &&
      activeStored.result &&
      typeof activeStored.result === "object" &&
      "proposal" in activeStored.result
        ? activeStored.result
        : calculateMigrationAssessment(activeStored.input);
  } catch {
    result = null;
  }

  if (!result) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`} style={{ maxWidth: 560 }}>
            <h1 className={styles.sectionTitle} style={{ fontSize: "1.4rem" }}>We need fresh numbers</h1>
            <p className={styles.sectionCopy}>
              Your saved assessment could not be loaded. Run a quick new assessment — it takes one number and a minute.
            </p>
            <div className={styles.buttonRow}>
              <a href={WEBSITE_ASSESSMENT_URL} className={styles.primaryButton}>
                Start New Assessment
              </a>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const documentCounts = countDocumentsByType(adminStatus?.documents ?? []);
  const displayStatus = adminStatus?.migrationStatus ?? activeStored.status;
  const adminStage = adminStatus?.adminStage ?? "";
  const billsUploaded = (documentCounts.utility_bills ?? 0) > 0;
  const signedEoi = (documentCounts.signed_eoi ?? 0) > 0;
  const assessmentCompleted = displayStatus === "proposal_ready"
    || Boolean(adminStatus?.assessmentCompleted)
    || /proposal ready|assessment complete|compliance pack/i.test(adminStage);
  const formalProposalIssued = Boolean(adminStatus?.formalProposalIssued);
  const signedFormalProposal = formalProposalIssued && (documentCounts.signed_proposal ?? 0) > 0;
  const directKycSubmitted = Boolean(adminStatus?.directKycSubmittedAt);
  const caseStageLabel = directKycSubmitted
    ? "Funding review"
    : signedFormalProposal
      ? "Direct bank KYC"
      : formalProposalIssued
        ? "Formal UFMS proposal"
        : signedEoi
          ? "Formal proposal preparation"
          : assessmentCompleted
            ? "Post-assessment EOI"
            : billsUploaded
              ? "Foundation-1 assessment"
              : formatStatus(displayStatus);
  const progressIndex = Math.max(
    progressIndexForStatus(displayStatus, adminStage),
    billsUploaded ? 2 : 0,
    assessmentCompleted ? 3 : 0,
    signedEoi ? 4 : 0,
    formalProposalIssued ? 5 : 0,
    signedFormalProposal ? 6 : 0,
    directKycSubmitted ? 7 : 0,
  );
  const proposalEngine =
    result && typeof result === "object" && "proposal" in result
      ? (result as { proposal?: import("@/lib/pricing-engine").EngineResult }).proposal ?? null
      : null;
  const nextAction = (() => {
    const eoiToken = adminStatus?.eoiToken ?? null;
    if (signedFormalProposal && !directKycSubmitted) {
      return {
        title: "Send the bank KYC pack directly to UFMS",
        copy: "For POPIA compliance, the six bank documents must go from your email directly to info@UFMS.net. Foundation-1 does not receive or store them.",
        primaryHref: "#ufms-direct-kyc",
        primaryLabel: "Open direct handoff",
      };
    }
    if (eoiToken && !signedEoi && assessmentCompleted) {
      return {
        title: "Sign your non-binding Expression of Interest",
        copy: "Your Foundation-1 assessment is complete. The non-binding EOI records authority to continue from that completed decision asset; it is not proposal acceptance and carries no purchase obligation.",
        primaryHref: `/eoi/${eoiToken}`,
        primaryLabel: "Review & Sign EOI",
      };
    }
    if (formalProposalIssued && !signedFormalProposal) {
      return {
        title: "Review and return the formal UFMS proposal",
        copy: "The formal funding proposal is available for independent review. Bank KYC remains locked until the complete formal proposal has been signed and returned.",
        primaryHref: "/migration/proposal-status",
        primaryLabel: "Open formal proposal",
      };
    }
    if (signedEoi && !formalProposalIssued) {
      return {
        title: "Formal UFMS proposal preparation",
        copy: "Your assessment and non-binding EOI are complete. Foundation-1 is coordinating the formal proposal; no bank KYC is requested at this stage.",
        primaryHref: "/migration/proposal-status",
        primaryLabel: "View formal-proposal status",
      };
    }
    if (billsUploaded && !assessmentCompleted) {
      return {
        title: "Your complete bill pack is under assessment",
        copy: "Foundation-1 is reconciling the supplied billing periods and preparing the decision-grade assessment. No EOI is requested until that assessment is complete.",
        primaryHref: "/migration/proposal-status",
        primaryLabel: "View assessment status",
      };
    }
    if (assessmentCompleted && !signedEoi) {
      return {
        title: "Post-assessment EOI preparation",
        copy: "The Foundation-1 assessment is complete. The non-binding EOI will become available here for review before any formal UFMS proposal is issued.",
        primaryHref: "/migration/proposal-status",
        primaryLabel: "View completed assessment",
      };
    }
    if (!billsUploaded) {
      return {
        title: "Submit the complete six-period bill pack",
        copy: "Provide all six recent billing periods together. Foundation-1 will reconcile the evidence and complete the assessment before requesting an EOI.",
        primaryHref: adminStatus?.uploadToken ? `/upload/${adminStatus.uploadToken}` : "/migration/proposal-status",
        primaryLabel: "Open complete bill-pack gate",
      };
    }
    return {
      title: "Assessment status",
      copy:
        adminStatus?.nextAction ??
        "Foundation-1 is progressing the migration case from the complete evidence pack.",
      primaryHref: "/migration/proposal-status",
      primaryLabel: "View assessment status",
    };
  })();

  return (
    <section className={styles.section}>
      <div className={styles.shell}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.sectionTitle}>Your migration case.</h1>
            <p className={styles.sectionCopy}>
              One operating record for assessment, post-assessment EOI, formal proposal, direct bank handoff, and funding progression.
            </p>
          </div>
          <div className={styles.dashboardHeaderActions}>
            <span className={styles.statusChip}>
              <span className={styles.statusDot} />
              {caseStageLabel}
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

        <p className={styles.caseTelemetryLabel}>Initial model snapshot · retained for comparison</p>
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
            <span className={styles.metricLabel}>Base model annual difference</span>
            <span className={styles.metricValue}>{zar(result.ufmsSolar.scenarios[1].annualSaving)}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>PV-only reference annual difference</span>
            <span className={styles.metricValue}>{zar(result.wheeling.photovoltaicOnlyReference.annualSaving)}</span>
          </div>
        </div>

        <div className={`${styles.panel} ${styles.split}`} style={{ marginTop: 20 }}>
          <section className={styles.form}>
            <span className={styles.cardLabel}>Client profile</span>
            <div className={styles.documentList}>
              {adminStatus ? (
                <div className={styles.documentRow}>
                  <span>Where your file is</span>
                  <strong>{caseStageLabel}</strong>
                </div>
              ) : null}
              {adminStatus?.documents[0] ? (
                <div className={styles.documentRow}>
                  <span>Latest document on file</span>
                  <strong>{adminStatus.documents[0].title}</strong>
                </div>
              ) : null}
            </div>
            {adminStatusError ? <p className={styles.error} role="alert">{adminStatusError}</p> : null}
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
            secondaryHref={WEBSITE_ASSESSMENT_URL}
            secondaryLabel="New Assessment"
          />
        </div>

        {proposalEngine ? (
          <div style={{ marginTop: 20 }}>
            <ProposalExplainer
              result={proposalEngine}
              businessName={activeStored.registration?.businessName}
              preliminarySnapshot={proposalEngine.input.tariffSource === "assumed"}
            />
          </div>
        ) : null}

        <div style={{ marginTop: 20 }}>
          <DirectUfmsKycHandoff
            profileId={activeStored.profileId ?? ""}
            accessCode={activeStored.accessCode ?? ""}
            businessName={activeStored.registration.businessName}
            signedProposalReceived={Boolean(adminStatus?.formalProposalIssued) && (documentCounts.signed_proposal ?? 0) > 0}
            confirmedAt={adminStatus?.directKycSubmittedAt}
            confirmedBy={adminStatus?.directKycSubmittedBy}
            onConfirmed={() => setRefreshTick((tick) => tick + 1)}
          />
        </div>
      </div>
    </section>
  );
}
