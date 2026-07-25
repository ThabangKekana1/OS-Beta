"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useStoredMigrationAssessment } from "@/components/migration/MigrationState";
import { MigrationProgressTracker } from "@/components/migration/MigrationProgressTracker";
import { ProposalPdfDownloadButton } from "@/components/migration/ProposalPdfDownloadButton";
import { ProposalTariffChart } from "@/components/migration/ProposalTariffChart";
import styles from "@/components/migration/migration.module.css";
import type { F1Proposal } from "@/lib/f1-proposal";
import {
  proposalGateProgressIndex,
} from "@/lib/proposal-progress";

const WEBSITE_ORIGIN = process.env.NEXT_PUBLIC_WEBSITE_ORIGIN ?? "https://foundation-1.co.za";

type ProposalResponse = {
  ok: boolean;
  error?: string;
  available?: boolean;
  reason?: string;
  proposal?: F1Proposal;
  accepted?: boolean;
  acceptedAt?: string | null;
  mandateToken?: string | null;
  mandateSignedAt?: string | null;
  eoiToken?: string | null;
  acceptanceReady?: boolean;
  acceptanceBlockers?: string[];
  readiness?: {
    signedEoi: boolean;
    recognisedBillingPeriods: number;
    requiredBillingPeriods: number;
    confidence: string;
    blockers: string[];
    warnings: string[];
  };
};

function rand(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function tariff(value: number) {
  return `R${value.toFixed(2)}/kWh`;
}

function tonnes(value: number) {
  return `${value.toLocaleString("en-ZA", { maximumFractionDigits: 1 })} tCO₂e`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "10px 0",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <span style={{ opacity: 0.62, fontSize: "0.85rem" }}>{label}</span>
      <strong style={{ fontSize: "0.9rem", textAlign: "right" }}>{value}</strong>
    </div>
  );
}

function ReportMetric({
  label,
  value,
  note,
  tag,
}: {
  label: string;
  value: string;
  note?: string;
  tag: "Audited" | "Modelled" | "Planning";
}) {
  return (
    <div className={styles.reportMetric}>
      <div>
        <span>{label}</span>
        <em>{tag}</em>
      </div>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

export function ProposalStatus() {
  const stored = useStoredMigrationAssessment();
  const [response, setResponse] = useState<ProposalResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");

  const profileId = stored?.profileId ?? "";
  const accessCode = stored?.accessCode ?? "";

  const loadProposal = useCallback(async () => {
    if (!profileId || !accessCode) return;
    setLoadError("");
    try {
      const result = await fetch("/api/migration/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, accessCode }),
      });
      const payload = (await result.json().catch(() => null)) as ProposalResponse | null;
      if (!result.ok || !payload?.ok) {
        setLoadError(payload?.error ?? "Unable to load your Foundation-1 assessment right now.");
        return;
      }
      setResponse(payload);
    } catch {
      setLoadError("Unable to reach the assessment service. Check your connection and retry.");
    }
  }, [profileId, accessCode]);

  useEffect(() => {
    void loadProposal();
  }, [loadProposal]);

  async function acceptProposal() {
    setAccepting(true);
    setAcceptError("");
    try {
      const result = await fetch("/api/migration/proposal/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, accessCode }),
      });
      const payload = (await result.json().catch(() => null)) as ProposalResponse | null;
      if (!result.ok || !payload?.ok) {
        setAcceptError(payload?.error ?? "Unable to record your acceptance. Try again.");
        return;
      }
      await loadProposal();
    } catch {
      setAcceptError("Unable to reach the proposal service. Check your connection and retry.");
    } finally {
      setAccepting(false);
    }
  }

  if (stored === undefined) return null;

  if (!stored || !profileId || !accessCode) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`} style={{ maxWidth: 480, margin: "0 auto" }}>
            <h1 className={styles.sectionTitle}>No assessment status found.</h1>
            <p className={styles.sectionCopy}>
              Unlock your dashboard first — the bill-audited assessment belongs to your migration case.
            </p>
            <div className={styles.buttonRow}>
              <Link href="/migration/dashboard" className={styles.primaryButton}>
                Open my dashboard
              </Link>
              <a href={`${WEBSITE_ORIGIN}/pricing`} className={styles.ghostButton}>
                Start a new assessment
              </a>
            </div>
          </div>
        </div>
      </section>
    );
  }

  /* Proposal not yet available — show the gate and the reason. */
  if (!response || response.available === false || !response.proposal) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionHeader}>
            <div>
              <h1 className={styles.sectionTitle}>Foundation-1 Assessment</h1>
              <p className={styles.sectionCopy}>
                {response?.reason ??
                  (loadError || "Preparing the assessment from your complete evidence pack…")}
              </p>
            </div>
          </div>
          <div className={`${styles.panel} ${styles.split}`}>
            <section className={styles.form}>
              <span className={styles.cardLabel}>Current gate</span>
              <h2 className={styles.cardTitle}>Bill-audited assessment preparation</h2>
              <p className={styles.sectionCopy}>
                {response?.reason ??
                  "The assessment generates after six recognised billing periods pass validation. The non-binding EOI follows the completed assessment."}
              </p>
              {response?.readiness ? (
                <div style={{ marginTop: 18 }}>
                  <Row
                    label="Post-assessment EOI"
                    value={response.readiness.signedEoi ? "Signed" : "Follows this assessment"}
                  />
                  <Row
                    label="Recognised billing periods"
                    value={`${response.readiness.recognisedBillingPeriods} / ${response.readiness.requiredBillingPeriods}`}
                  />
                  <Row label="Bill-analysis confidence" value={response.readiness.confidence} />
                  {response.readiness.blockers.length > 1 ? (
                    <ul style={{ marginTop: 14, paddingLeft: 18 }}>
                      {response.readiness.blockers.slice(1).map((blocker) => (
                        <li key={blocker} className={styles.sectionCopy} style={{ marginTop: 6 }}>
                          {blocker}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <div className={styles.buttonRow}>
                <Link href="/migration/dashboard" className={styles.primaryButton}>
                  Return to Dashboard
                </Link>
              </div>
              {loadError ? (
                <p className={styles.error} role="alert">
                  {loadError}
                </p>
              ) : null}
            </section>
            <section className={styles.reportPreview}>
              <span className={styles.cardLabel}>Approval process</span>
              <MigrationProgressTracker activeIndex={proposalGateProgressIndex(response?.readiness)} />
            </section>
          </div>
        </div>
      </section>
    );
  }

  const proposal = response.proposal;
  const accepted = Boolean(response.accepted);
  const mandateToken = response.mandateToken ?? null;
  const mandateSigned = Boolean(response.mandateSignedAt);
  const needsPostAssessmentEoi = !response.readiness?.signedEoi;

  const yearOne = proposal.billAwareEconomics?.yearOne;
  const headlineSaving = yearOne?.saving ?? proposal.ufmsOption.monthlySaving;
  const headlineSavingPct = yearOne?.savingPercentage ?? proposal.ufmsOption.yearOneSavingPct;

  return (
    <section className={`${styles.section} ${styles.premiumReport}`}>
      <div className={`${styles.shell} ${styles.reportShell}`}>
        <header className={styles.reportHero}>
          <div className={styles.reportHeroMain}>
            <div className={styles.reportStateRow}>
                <span className={styles.reportStateBadge}>Foundation-1 assessment · bill-audited</span>
              <span>Confidential client assessment</span>
            </div>
            <p className={styles.reportKicker}>Foundation-1 Migration Intelligence</p>
            <h1>Energy economics,<br />made decision-ready.</h1>
            <p className={styles.reportHeroCopy}>
              Prepared for <strong>{proposal.businessName}</strong>
              {proposal.clientProfileId ? ` · ${proposal.clientProfileId}` : ""} ·{" "}
              {new Date(proposal.generatedAt).toLocaleDateString("en-ZA", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div className={styles.reportHeroActions}>
            <ProposalPdfDownloadButton profileId={profileId} accessCode={accessCode} />
            <button type="button" onClick={() => window.print()} className={`${styles.reportTextAction} ${styles.printHide}`}>
              Print report
            </button>
          </div>
        </header>

        <nav className={`${styles.reportSectionNav} ${styles.printHide}`} aria-label="Proposal sections">
          <a href="#summary">Summary</a>
          <a href="#evidence">Bill evidence</a>
          <a href="#solution">Solution</a>
          <a href="#economics">Economics</a>
          <a href="#tariffs">Tariffs</a>
          <a href="#funding">Funding</a>
          <a href="#impact">Impact</a>
        </nav>

        <section id="summary" className={styles.executiveSummary}>
          <div className={styles.executiveLead}>
            <p className={styles.reportEyebrow}>Modelled monthly difference</p>
            <strong>{rand(headlineSaving)}</strong>
            <span>{pct(headlineSavingPct)} of the approved-current high-load design baseline · ex VAT</span>
          </div>
          <div className={styles.executiveMetrics}>
            <ReportMetric label="Current design path" value={yearOne ? `${rand(yearOne.currentUtilityCost)}/mo` : rand(proposal.profile.monthlySpend)} tag="Audited" />
            <ReportMetric label="Complete solution path" value={yearOne ? `${rand(yearOne.solutionCost)}/mo` : rand(proposal.profile.monthlySpend - headlineSaving)} tag="Modelled" />
            <ReportMetric label="10-year difference" value={rand(proposal.tenYearComparison.ufmsSaving)} tag="Planning" />
            <ReportMetric label="System architecture" value={`${proposal.ufmsOption.sizing.pvKwp}/${proposal.ufmsOption.sizing.pcsKw}/${proposal.ufmsOption.sizing.bessKwh}`} note="PV kWp · PCS kW · battery kWh" tag="Planning" />
          </div>
          <p className={styles.executiveVerdict}>
            The bill pack supports a maximum {rand(headlineSaving)} monthly reduction on the selected
            design period. Engineering must validate generation, battery dispatch and imported-energy
            displacement before this becomes a formal offer.
          </p>
        </section>

        <div id="evidence" className={styles.evidenceLedger}>
          <span><strong>{proposal.billAudit?.uniquePeriodCount ?? 0}</strong> recognised periods</span>
          <span><strong>{proposal.billAudit?.coveredDays ?? 0}</strong> covered days</span>
          <span><strong>{proposal.billAudit ? pct(proposal.billAudit.actualReadShare) : "—"}</strong> actual reads</span>
          <span><strong>{proposal.billAudit?.currentTariff?.matchedPeriodCount ?? 0}/{proposal.billAudit?.uniquePeriodCount ?? 0}</strong> approved-rate matches</span>
          <span><strong>{proposal.billAudit?.confidence ?? "planning"}</strong> audit confidence</span>
        </div>

        <div className={`${styles.panel} ${styles.split} ${styles.reportSectionPanel}`}>
          <section className={styles.form}>
            <span className={styles.cardLabel}>Energy profile</span>
            {proposal.site.city || proposal.site.province ? (
              <Row
                label="Registered site"
                value={[proposal.site.city, proposal.site.province].filter(Boolean).join(", ")}
              />
            ) : null}
            {proposal.site.registeredUtilityProvider ? (
              <Row label="Registered electricity supplier" value={proposal.site.registeredUtilityProvider} />
            ) : null}
            <Row
              label={proposal.calculationBasis ? "Design-basis electricity spend" : "Monthly electricity spend"}
              value={rand(proposal.profile.monthlySpend)}
            />
            <Row
              label={proposal.calculationBasis ? "Design-basis monthly usage" : "Estimated monthly usage"}
              value={`${Math.round(proposal.profile.estimatedMonthlyKwh).toLocaleString("en-ZA")} kWh`}
            />
            <Row
              label={`Blended tariff (${proposal.profile.tariffSource === "bills" ? "from your bills" : "estimated"})`}
              value={tariff(proposal.profile.blendedTariff)}
            />
            <Row label="Qualification" value={proposal.qualification.band} />
            <Row label="Recommended pathway" value={proposal.qualification.recommendedPathway} />
          </section>
          <section className={styles.reportPreview}>
            <span className={styles.cardLabel}>Evidence state</span>
            <h2 className={styles.cardTitle}>Audited inputs. Planning solution.</h2>
            <p className={styles.sectionCopy}>
              Bill values and tariff matching are audited. System yield, dispatch, savings and final
              commercial terms remain subject to engineering and partner approval.
            </p>
            <div className={styles.provenanceLegend}>
              <span><i className={styles.provenanceAudited} /> Audited</span>
              <span><i className={styles.provenancePlanning} /> Planning</span>
              <span><i className={styles.provenanceFinal} /> Engineering-final</span>
            </div>
          </section>
        </div>

        {proposal.calculationBasis ? (
          <div className={`${styles.panel} ${styles.form} ${styles.reportSectionPanel}`} style={{ marginTop: 20 }}>
            <span className={styles.cardLabel}>Calculation basis — highest valid bill</span>
            <h2 className={styles.cardTitle}>
              {proposal.calculationBasis.periodStart} to {proposal.calculationBasis.periodEnd}
            </h2>
            <Row
              label="Selected invoice"
              value={proposal.calculationBasis.taxInvoiceNumber ?? "Invoice number unavailable"}
            />
            <Row
              label="Meter reading and service period"
              value={`${proposal.calculationBasis.readType} · ${proposal.calculationBasis.billingDays} days`}
            />
            <Row
              label="Actual selected-period electricity charges (ex VAT)"
              value={rand(proposal.calculationBasis.historical.billedSpendExVat)}
            />
            <Row
              label="Actual selected-period usage"
              value={`${Math.round(proposal.calculationBasis.historical.billedKwh).toLocaleString("en-ZA")} kWh`}
            />
            <Row
              label="Standard-month equivalent (ex VAT)"
              value={`${rand(proposal.calculationBasis.historical.monthlyEquivalentSpendExVat)} · ${Math.round(proposal.calculationBasis.historical.monthlyEquivalentKwh).toLocaleString("en-ZA")} kWh`}
            />
            {proposal.calculationBasis.approvedCurrent?.monthlyEquivalentSpendExVat !== null
              && proposal.calculationBasis.approvedCurrent?.monthlyEquivalentSpendExVat !== undefined ? (
                <Row
                  label="Approved-current equivalent (ex VAT)"
                  value={rand(proposal.calculationBasis.approvedCurrent.monthlyEquivalentSpendExVat)}
                />
              ) : null}
            <Row
              label="Six-period audit average — shown separately"
              value={proposal.billAudit
                ? `${rand(proposal.billAudit.averageMonthlySpendExVat)} · ${Math.round(proposal.billAudit.averageMonthlyKwh).toLocaleString("en-ZA")} kWh/month`
                : "Unavailable"}
            />
            <p className={styles.sectionCopy} style={{ marginTop: 12 }}>
              {proposal.calculationBasis.explanation}
            </p>
          </div>
        ) : null}

        {proposal.billAudit ? (
          <div className={`${styles.panel} ${styles.form} ${styles.reportSectionPanel}`} style={{ marginTop: 20 }}>
            <span className={styles.cardLabel}>Bill audit — source of truth</span>
            <h2 className={styles.cardTitle}>
              {proposal.billAudit.uniquePeriodCount} billing periods · {proposal.billAudit.coveredDays} covered days
            </h2>
            <Row label="Utility and tariff" value={`${proposal.billAudit.provider} · ${proposal.billAudit.tariffNames.join(", ")}`} />
            <Row
              label="Source period"
              value={`${proposal.billAudit.periodStart ?? "Unknown"} to ${proposal.billAudit.periodEnd ?? "Unknown"}`}
            />
            <Row label="Analysis confidence" value={proposal.billAudit.confidence} />
            <Row label="Actual meter-read share" value={pct(proposal.billAudit.actualReadShare)} />
            <Row label="Six-period average usage" value={`${Math.round(proposal.billAudit.averageMonthlyKwh).toLocaleString("en-ZA")} kWh/month`} />
            <Row label="Six-period historical average (ex VAT)" value={`${rand(proposal.billAudit.averageMonthlySpendExVat)}/month`} />
            {proposal.billAudit.averageMonthlySpendInclVat !== null ? (
              <Row label="Six-period historical average (incl VAT)" value={`${rand(proposal.billAudit.averageMonthlySpendInclVat)}/month`} />
            ) : null}
            <Row label="Blended tariff (ex VAT)" value={tariff(proposal.billAudit.blendedTariffExVat)} />
            {proposal.billAudit.currentTariff ? (
              <>
                <Row label="Approved-rate matching" value={`${proposal.billAudit.currentTariff.matchedPeriodCount} / ${proposal.billAudit.uniquePeriodCount} periods · ${proposal.billAudit.currentTariff.status}`} />
                {proposal.billAudit.currentTariff.averageMonthlySpendExVat !== null ? (
                  <Row label="Current approved tariff baseline (ex VAT)" value={`${rand(proposal.billAudit.currentTariff.averageMonthlySpendExVat)}/month`} />
                ) : null}
                <p className={styles.sectionCopy} style={{ marginTop: 12, fontSize: "0.8rem" }}>
                  Eskom direct-customer schedule effective {proposal.billAudit.currentTariff.effectiveFrom} to {proposal.billAudit.currentTariff.effectiveTo}.
                  Historical spend is retained separately and is not overwritten.
                </p>
              </>
            ) : null}
            {proposal.billAudit.warnings.length ? (
              <div className={styles.reportNotice}>
                <strong>Evidence notices</strong>
                <ul>
                  {proposal.billAudit.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {proposal.billAudit ? (
          <div className={`${styles.panel} ${styles.form}`} style={{ marginTop: 20 }}>
            <span className={styles.cardLabel}>What your utility bill contains</span>
            <h2 className={styles.cardTitle}>Actual charge split, not a flat residual assumption.</h2>
            <Row label="Volumetric charges addressable by imported-kWh reduction" value={rand(proposal.billAudit.addressableMonthlyExVat)} />
            <Row label="Fixed and capacity charges that remain" value={rand(proposal.billAudit.residualMonthlyExVat)} />
            <Row label="Demand/reactive charges pending engineering" value={rand(proposal.billAudit.conditionalMonthlyExVat)} />
            <Row label="Unclassified amount" value={rand(proposal.billAudit.unknownMonthlyExVat)} />
            <p className={styles.sectionCopy} style={{ marginTop: 12 }}>
              Arrears, deposits, payments, and account balances are excluded. Demand, capacity,
              reactive-energy and export savings are not assumed without engineering evidence.
            </p>
          </div>
        ) : null}

        <div id="solution" className={`${styles.panel} ${styles.form} ${styles.reportSectionPanel}`} style={{ marginTop: 20 }}>
          <span className={styles.cardLabel}>Option 1 — On-site solar + storage (UFMS)</span>
          <h2 className={styles.cardTitle}>
            {proposal.billAwareEconomics
              ? `${pct(proposal.billAwareEconomics.yearOne.savingPercentage)} P50 bill-audited result · zero capex`
              : `${pct(proposal.ufmsOption.yearOneSavingPct)} preliminary year-one saving · zero capex`}
          </h2>
          <Row
            label="System sizing"
            value={`${proposal.ufmsOption.sizing.pvKwp} kWp PV · ${proposal.ufmsOption.sizing.pcsKw} kW PCS · ${proposal.ufmsOption.sizing.bessKwh} kWh storage`}
          />
          <Row label="Fixed monthly charge" value={rand(proposal.ufmsOption.monthlyCharge)} />
          <Row label="Onsite energy supplied" value={`${proposal.ufmsOption.dispatch.onsiteCoveragePct.toFixed(1)}% of modelled load`} />
          <Row label="Direct solar to load" value={`${Math.round(proposal.ufmsOption.dispatch.directSolarToLoadKwh).toLocaleString("en-ZA")} kWh/month`} />
          <Row label="Battery to load" value={`${Math.round(proposal.ufmsOption.dispatch.batteryToLoadKwh).toLocaleString("en-ZA")} kWh/month`} />
          <Row label="Residual grid import" value={`${Math.round(proposal.ufmsOption.dispatch.residualGridKwh).toLocaleString("en-ZA")} kWh/month`} />
          {proposal.billAwareEconomics ? null : (
            <>
              <Row label="Solution tariff" value={tariff(proposal.ufmsOption.solutionTariff)} />
              <Row label="Monthly saving" value={rand(proposal.ufmsOption.monthlySaving)} />
              <Row label="10-year saving vs utility" value={rand(proposal.ufmsOption.tenYearSaving)} />
            </>
          )}
        </div>

        {proposal.solarYield ? (
          <div className={`${styles.panel} ${styles.form}`} style={{ marginTop: 20 }}>
            <span className={styles.cardLabel}>Site-aware solar resource — pre-engineering</span>
            <h2 className={styles.cardTitle}>
              {Math.round(proposal.solarYield.averageMonthlyGenerationKwh).toLocaleString("en-ZA")} kWh/month planning yield
            </h2>
            <Row
              label="Provincial reference"
              value={`${proposal.solarYield.referenceSite}, ${proposal.solarYield.province}`}
            />
            <Row
              label="Specific annual yield"
              value={`${Math.round(proposal.solarYield.annualKwhPerKwp).toLocaleString("en-ZA")} kWh/kWp/year`}
            />
            <Row
              label={`${proposal.ufmsOption.sizing.pvKwp} kWp planning output`}
              value={`${Math.round(proposal.solarYield.annualGenerationKwh).toLocaleString("en-ZA")} kWh/year`}
            />
            <Row
              label="Model basis"
              value={`${proposal.solarYield.radiationDatabase} · ${proposal.solarYield.systemLossInputPercentage}% system-loss input`}
            />
            <p className={styles.sectionCopy} style={{ marginTop: 12, fontSize: "0.8rem" }}>
              {proposal.solarYield.source}. {proposal.solarYield.limitation}
            </p>
          </div>
        ) : null}

        {proposal.billAwareEconomics ? (
          <div id="economics" className={`${styles.panel} ${styles.form} ${styles.reportSectionPanel}`} style={{ marginTop: 20 }}>
            <span className={styles.cardLabel}>Bill-supported economics — ex VAT</span>
            <h2 className={styles.cardTitle}>
              {pct(proposal.billAwareEconomics.yearOne.savingPercentage)} P50 modelled year-one saving
            </h2>
            <Row label="Highest-bill approved-current baseline" value={`${rand(proposal.billAwareEconomics.yearOne.currentUtilityCost)}/month`} />
            <Row label="UFMS monthly charge" value={`${rand(proposal.billAwareEconomics.yearOne.ufmsCharge)}/month`} />
            <Row label="Residual grid charges" value={`${rand(proposal.billAwareEconomics.yearOne.residualGridCost)}/month`} />
            <Row label="Total solution cost" value={`${rand(proposal.billAwareEconomics.yearOne.solutionCost)}/month`} />
            <Row label="Year-one monthly saving" value={rand(proposal.billAwareEconomics.yearOne.saving)} />
            <p className={styles.sectionCopy} style={{ marginTop: 12 }}>
              {proposal.billAwareEconomics.methodology}
            </p>
          </div>
        ) : null}

        {proposal.billAwareEconomics ? (
          <div className={`${styles.panel} ${styles.form} ${styles.reportSchedule}`} style={{ marginTop: 20, overflowX: "auto" }}>
            <span className={styles.cardLabel}>10-year cost and saving schedule</span>
            <table className={styles.reportScheduleTable} style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, minWidth: 680 }}>
              <thead>
                <tr style={{ textAlign: "right", opacity: 0.58, fontSize: "0.72rem" }}>
                  <th style={{ padding: "8px 6px", textAlign: "left" }}>Year</th>
                  <th style={{ padding: "8px 6px" }}>Utility</th>
                  <th style={{ padding: "8px 6px" }}>UFMS</th>
                  <th style={{ padding: "8px 6px" }}>Grid residual</th>
                  <th style={{ padding: "8px 6px" }}>Solution</th>
                  <th style={{ padding: "8px 6px" }}>Annual saving</th>
                  <th style={{ padding: "8px 6px" }}>Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {proposal.billAwareEconomics.tenYear.rows.map((row) => (
                  <tr key={row.year} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "right", fontSize: "0.78rem" }}>
                    <td style={{ padding: "10px 6px", textAlign: "left" }}>{row.year}</td>
                    <td style={{ padding: "10px 6px" }}>{rand(row.utilityCost)}</td>
                    <td style={{ padding: "10px 6px" }}>{rand(row.ufmsCharge)}</td>
                    <td style={{ padding: "10px 6px" }}>{rand(row.residualGridCost)}</td>
                    <td style={{ padding: "10px 6px" }}>{rand(row.solutionCost)}</td>
                    <td style={{ padding: "10px 6px" }}>{rand(row.annualSaving)}</td>
                    <td style={{ padding: "10px 6px" }}>{rand(row.cumulativeSaving)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.sectionCopy} style={{ marginTop: 14, fontSize: "0.8rem" }}>
              Year 1 is the already-current 2026/27 baseline, so the approved 8.76% increase is
              already embedded and is not applied twice. Year 2 applies the approved 2027/28
              8.83% increase; later years use the disclosed 6% planning assumption. Municipal
              outcomes require the municipality&apos;s approved tariff schedule.
            </p>
          </div>
        ) : null}

        {proposal.tariffComparison ? (
          <section id="tariffs" className={`${styles.panel} ${styles.form} ${styles.reportSectionPanel}`} style={{ marginTop: 20 }}>
            <ProposalTariffChart
              rows={proposal.tariffComparison.projectionRows}
              historicalContext={proposal.tariffComparison.historicalContext}
            />
            <div className={styles.keyIndicatorGrid}>
              <ReportMetric label="Approved-current tariff" value={tariff(proposal.profile.blendedTariff)} tag="Audited" />
              <ReportMetric label="UFMS escalation" value={`${Math.round((proposal.billAwareEconomics?.ufmsEscalation ?? 0.06) * 100)}% p.a.`} tag="Modelled" />
              <ReportMetric label="Asset-finance rate" value={`${(proposal.commercial.assetFinanceAnnualRate * 100).toFixed(2)}%`} note="Quoted-rate model · credit subject" tag="Planning" />
              <ReportMetric label="Proposed term" value="10 years" tag="Planning" />
            </div>
            <div className={styles.reportTableWrap}>
              <table className={styles.premiumTable}>
                <caption>Client-specific effective tariff comparison · R/kWh · ex VAT</caption>
                <thead>
                  <tr>
                    <th scope="col">Year</th>
                    <th scope="col">Utility</th>
                    <th scope="col">UFMS + grid</th>
                    <th scope="col">Asset instalment</th>
                    <th scope="col">Asset + grid</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.tariffComparison.projectionRows.map((row) => (
                    <tr key={row.year}>
                      <th scope="row">{row.year}</th>
                      <td>R{row.utilityEffectiveTariff.toFixed(2)}</td>
                      <td>R{row.ufmsEffectiveTariff.toFixed(2)}</td>
                      <td>R{row.assetFinanceInstalmentTariff.toFixed(2)}</td>
                      <td>R{row.assetFinanceCompleteTariff.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className={styles.reportDetails}>
              <summary>View the reproduced 2007–2033 national tariff context</summary>
              <p>{proposal.tariffComparison.historicalContextNote}</p>
              <div className={styles.reportTableWrap}>
                <table className={styles.premiumTable}>
                  <thead><tr><th scope="col">Year</th><th scope="col">Template R/kWh</th><th scope="col">Cumulative increase</th><th scope="col">Status</th></tr></thead>
                  <tbody>{proposal.tariffComparison.historicalContext.map((row) => (
                    <tr key={row.year}><th scope="row">{row.year}</th><td>R{row.utilityTariffRandPerKwh.toFixed(2)}</td><td>{row.cumulativeIncreasePct.toLocaleString("en-ZA")}%</td><td>{row.evidence === "historical-template" ? "Template history" : "Legacy projection"}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </details>
          </section>
        ) : null}

        <section id="funding" className={`${styles.panel} ${styles.form} ${styles.reportSectionPanel}`} style={{ marginTop: 20 }}>
          <div className={styles.reportSectionHeading}>
            <div><p className={styles.reportEyebrow}>Funding architecture</p><h2>Choose ownership, not hardware.</h2></div>
            <span className={styles.reportStateBadge}>Same engineered system</span>
          </div>
          <div className={styles.fundingGrid}>
            {proposal.commercial.structures.map((option) => (
              <article key={option.label} className={option.label === "Eden" ? styles.fundingCardFeatured : styles.fundingCard}>
                <p>{option.label}</p>
                <strong>{option.monthlyCharge === null ? rand(option.upfront ?? 0) : `${rand(option.monthlyCharge)}/mo`}</strong>
                <span>{option.escalation === null ? "Outright ownership" : option.escalation === 0 ? "No annual escalation" : `${Math.round(option.escalation * 100)}% annual escalation`}</span>
                <ul>
                  <li>{option.termMonths ? `${option.termMonths / 12}-year term` : "No financed term"}</li>
                  <li>{option.label === "Asset Finance" ? `${(proposal.commercial.assetFinanceAnnualRate * 100).toFixed(2)}% quoted-rate model` : option.ownership}</li>
                </ul>
                <p className={styles.fundingNote}>{option.comparisonNote}</p>
              </article>
            ))}
          </div>
        </section>

        {proposal.energyAndEsg ? (
          <div id="impact" className={`${styles.panel} ${styles.form} ${styles.reportSectionPanel}`} style={{ marginTop: 20 }}>
            <div className={styles.reportSectionHeading}>
              <div><p className={styles.reportEyebrow}>Environmental impact</p><h2>From energy reduction to operational impact.</h2></div>
              <span className={styles.reportStateBadge}>Planning ceiling</span>
            </div>
            <div className={styles.impactLeadMetrics}>
              <ReportMetric label="Planning clean energy" value={proposal.energyAndEsg.annualPlanningEnergyReductionGwh === null ? "Pending" : `${proposal.energyAndEsg.annualPlanningEnergyReductionGwh.toFixed(3)} GWh`} tag="Planning" />
              <ReportMetric label="Scope 2 baseline" value={proposal.energyAndEsg.annualScope2EmissionsTonnes === null ? "Pending" : tonnes(proposal.energyAndEsg.annualScope2EmissionsTonnes)} tag="Audited" />
              <ReportMetric label="ESG readiness" value={`${proposal.energyAndEsg.energyEsgReadinessScore}/100`} note={proposal.energyAndEsg.scoreLabel} tag="Modelled" />
            </div>
            <div className={styles.reportTableWrap}>
              <table className={styles.premiumTable}>
                <caption>Annual planning impact from modelled clean-energy output</caption>
                <thead><tr><th scope="col">Impact</th><th scope="col">Factor</th><th scope="col">Annual reduction</th><th scope="col">Evidence</th></tr></thead>
                <tbody>{proposal.energyAndEsg.impactRows.map((row) => (
                  <tr key={row.key}><th scope="row">{row.label}</th><td>{row.factor.toLocaleString("en-ZA")} {row.factorUnit}</td><td>{row.annualReduction.toLocaleString("en-ZA", { maximumFractionDigits: 2 })} {row.reductionUnit}</td><td>{row.evidence === "current-report-basis" ? "Current report basis" : "Legacy planning factor"}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className={styles.sectionCopy}>CO₂e uses the current 0.94 kgCO₂e/kWh report basis. Broader operational factors reproduce the observed partner proposal and are clearly marked as legacy planning factors pending authoritative current-source verification.</p>
          </div>
        ) : null}

        <div className={`${styles.panel} ${styles.form}`} style={{ marginTop: 20 }}>
          <span className={styles.cardLabel}>Option 2 — Wheeled utility-scale solar</span>
          <h2 className={styles.cardTitle}>
            {proposal.wheelingOption.monthlySaving >= 0
              ? `${pct(proposal.wheelingOption.savingPctOfBill)} standalone bill saving`
              : `${pct(Math.abs(proposal.wheelingOption.savingPctOfBill))} standalone year-one premium`}
          </h2>
          <Row label="Firm tariff" value={tariff(proposal.wheelingOption.firmTariff)} />
          <Row label="Energy screened" value={`${Math.round(proposal.wheelingOption.wheeledMonthlyKwh).toLocaleString("en-ZA")} kWh/month`} />
          <Row label="Monthly difference" value={rand(proposal.wheelingOption.monthlySaving)} />
          <Row label="Annual difference" value={rand(proposal.wheelingOption.annualSaving)} />
          <p className={styles.sectionCopy} style={{ marginTop: 10 }}>
            {proposal.wheelingOption.note}
          </p>
        </div>

        {proposal.lumenCombined ? (
          <div className={`${styles.panel} ${styles.form}`} style={{ marginTop: 20 }}>
            <span className={styles.cardLabel}>Combined migration — onsite then residual wheeling</span>
            <h2 className={styles.cardTitle}>
              {proposal.lumenCombined.monthlySaving >= 0
                ? `${pct(proposal.lumenCombined.combinedSavingPct)} combined saving`
                : `${pct(Math.abs(proposal.lumenCombined.combinedSavingPct))} combined year-one premium`}
            </h2>
            <Row label="Monthly difference" value={rand(proposal.lumenCombined.monthlySaving)} />
            <Row label="Annual difference" value={rand(proposal.lumenCombined.annualSaving)} />
            <Row label="10-year difference" value={rand(proposal.lumenCombined.tenYearSaving)} />
            <Row label="Onsite share" value={`${(proposal.lumenCombined.onsiteLoadShare * 100).toFixed(1)}%`} />
            <Row label="Residual grid import" value={`${Math.round(proposal.lumenCombined.residualGridKwh).toLocaleString("en-ZA")} kWh/month`} />
            <Row label="Residual energy wheeled" value={`${Math.round(proposal.lumenCombined.wheeledResidualKwh).toLocaleString("en-ZA")} kWh/month`} />
            <p className={styles.sectionCopy} style={{ marginTop: 10 }}>
              {proposal.lumenCombined.note}
            </p>
          </div>
        ) : null}

        <div className={`${styles.panel} ${styles.form} ${styles.reportSectionPanel}`} style={{ marginTop: 20 }}>
          <span className={styles.cardLabel}>Method and limitations</span>
          <h2 className={styles.cardTitle}>Every key number, explained.</h2>
          <ol style={{ margin: "14px 0 0", paddingLeft: 20 }}>
            {proposal.explainer.map((line) => (
              <li key={line} className={styles.sectionCopy} style={{ marginTop: 10, paddingLeft: 4 }}>
                {line}
              </li>
            ))}
          </ol>
          <p className={styles.sectionCopy} style={{ marginTop: 18 }}>{proposal.disclaimer}</p>
        </div>

        <div className={`${styles.panel} ${styles.form}`} style={{ marginTop: 20 }}>
          {mandateSigned ? (
            <>
              <span className={styles.cardLabel}>Mandate signed</span>
              <h2 className={styles.cardTitle}>Your file is being prepared for submission.</h2>
              <p className={styles.sectionCopy}>
                Foundation-1 is packaging your application for funder review. Track progress from
                your dashboard.
              </p>
              <div className={`${styles.buttonRow} ${styles.printHide}`}>
                <Link href="/migration/dashboard" className={styles.primaryButton}>
                  Return to Dashboard
                </Link>
              </div>
            </>
          ) : accepted ? (
            <>
              <span className={styles.cardLabel}>Proposal accepted</span>
              <h2 className={styles.cardTitle}>One step left: sign your mandate.</h2>
              <p className={styles.sectionCopy}>
                The mandate authorises Foundation-1 to submit your file to funding partners. It is
                not a purchase commitment and carries no cost.
              </p>
              <div className={`${styles.buttonRow} ${styles.printHide}`}>
                {mandateToken ? (
                  <Link href={`/mandate/${mandateToken}`} className={styles.primaryButton}>
                    Sign your Mandate
                  </Link>
                ) : (
                  <Link href="/migration/dashboard" className={styles.primaryButton}>
                    Return to Dashboard
                  </Link>
                )}
              </div>
            </>
          ) : needsPostAssessmentEoi ? (
            <>
              <span className={styles.cardLabel}>Assessment complete · next authorization</span>
              <h2 className={styles.cardTitle}>Review complete. The non-binding EOI is next.</h2>
              <p className={styles.sectionCopy}>
                The EOI records authority to continue from this completed assessment. It does not
                accept a proposal, create a purchase obligation, or request bank KYC.
              </p>
              <div className={`${styles.buttonRow} ${styles.printHide}`}>
                {response.eoiToken ? (
                  <Link href={`/eoi/${response.eoiToken}`} className={styles.primaryButton}>
                    Review &amp; sign non-binding EOI
                  </Link>
                ) : (
                  <Link href="/migration/dashboard" className={styles.primaryButton}>
                    Return to Dashboard
                  </Link>
                )}
              </div>
            </>
          ) : response.acceptanceReady === false ? (
            <>
              <span className={styles.cardLabel}>Post-EOI assessment state</span>
              <h2 className={styles.cardTitle}>Formal UFMS proposal pending engineering approval.</h2>
              <p className={styles.sectionCopy}>
                The Foundation-1 assessment and non-binding EOI are complete. Formal proposal
                acceptance unlocks only after Foundation-1 uploads the engineering-approved UFMS
                proposal with validated solar yield, battery dispatch and imported-energy displacement.
              </p>
              {response.acceptanceBlockers?.map((blocker) => (
                <p key={blocker} className={styles.sectionCopy} style={{ marginTop: 8 }}>
                  {blocker}
                </p>
              ))}
              <div className={`${styles.buttonRow} ${styles.printHide}`}>
                <Link href="/migration/dashboard" className={styles.primaryButton}>
                  Return to Dashboard
                </Link>
              </div>
            </>
          ) : (
            <>
              <span className={styles.cardLabel}>Your decision</span>
              <h2 className={styles.cardTitle}>Accept the engineering-approved proposal to begin migration.</h2>
              <p className={styles.sectionCopy}>
                Accepting tells Foundation-1 to prepare your funding application. Final terms are
                confirmed in the formal agreement — accepting here is not a purchase commitment.
              </p>
              <div className={`${styles.buttonRow} ${styles.printHide}`}>
                <button
                  type="button"
                  onClick={acceptProposal}
                  disabled={accepting}
                  className={styles.primaryButton}
                >
                  {accepting ? "Recording acceptance…" : "Accept Migration Proposal"}
                </button>
                <Link href="/migration/dashboard" className={styles.ghostButton}>
                  Return to Dashboard
                </Link>
              </div>
              {acceptError ? (
                <p className={styles.error} role="alert">
                  {acceptError}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
