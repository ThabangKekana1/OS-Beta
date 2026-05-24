"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Download, ArrowRight, Copy, Check } from "lucide-react";
import type { MigrationAssessmentResult } from "@/lib/calculateMigrationAssessment";
import {
  ensureMigrationProfileCredentials,
  readStoredMigrationAssessment,
  writeStoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import { QualificationBadge } from "@/components/migration/QualificationBadge";
import { SavingsCard } from "@/components/migration/SavingsCard";
import styles from "@/components/migration/migration.module.css";

function zar(value: number) {
  const rounded = Math.round(value);
  return `R\u00a0${rounded.toLocaleString("en-ZA").replace(/,/g, "\u00a0")}`;
}

function percent(value: number) {
  return `${value.toFixed(2)}%`;
}

function kwh(value: number) {
  return `${Math.round(value).toLocaleString("en-ZA").replace(/,/g, " ")} kilowatt-hours`;
}

function tariff(value: number) {
  return `R${value.toFixed(2)}/kWh`;
}

function emailReport(result: MigrationAssessmentResult) {
  const subject = encodeURIComponent("Foundation-1 Energy Migration Estimate");
  const { currentUtilityProjection, ufmsSolar, wheeling, combinedScenarios } = result;
  const body = encodeURIComponent(
    [
      `Current monthly electricity spend: ${zar(currentUtilityProjection.currentMonthlySpend)}`,
      `Current annual electricity spend: ${zar(currentUtilityProjection.currentAnnualSpend)}`,
      `Estimated ten-year current-utility spend: ${zar(currentUtilityProjection.tenYearSpend)}`,
      ``,
      `UFMS Solar Range:`,
      ...ufmsSolar.scenarios.map(
        (scenario) =>
          `${scenario.label}: ${zar(scenario.monthlySaving)} monthly saving, ${percent(
            scenario.savingPercentage,
          )}, ${zar(scenario.tenYearSavingAgainstEskom)} ten-year saving`,
      ),
      ``,
      `Wheeling:`,
      `Conservative ${tariff(wheeling.conservative.tariff)}: ${zar(
        wheeling.conservative.monthlySaving,
      )} monthly saving, ${percent(wheeling.conservative.savingPercentage)}`,
      `PV-only reference ${tariff(wheeling.photovoltaicOnlyReference.tariff)}: ${zar(
        wheeling.photovoltaicOnlyReference.monthlySaving,
      )} monthly saving, ${percent(wheeling.photovoltaicOnlyReference.savingPercentage)}`,
      ``,
      `Illustrative Combined Solar + Wheeling Scenarios:`,
      ...combinedScenarios.map(
        (scenario) =>
          `${scenario.label}: ${zar(scenario.combinedMonthlySaving)} monthly saving, ${percent(
            scenario.combinedSavingPercentage,
          )}, ${zar(scenario.combinedTenYearSavingAgainstEskom)} ten-year saving`,
      ),
      ``,
      result.disclaimer,
    ].join("\n"),
  );

  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

async function downloadReportPDF(result: MigrationAssessmentResult): Promise<void> {
  const { currentUtilityProjection, ufmsSolar, wheeling, combinedScenarios } = result;
  const date = new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });

  function r(v: number) { return `R\u00a0${Math.round(v).toLocaleString("en-ZA").replace(/,/g, "\u00a0")}`; }
  function p(v: number) { return `${v.toFixed(2)}%`; }

  const eskomMonthly = currentUtilityProjection.currentMonthlySpend;
  const eskomAnnual = currentUtilityProjection.currentAnnualSpend;
  const eskomTenYear = currentUtilityProjection.tenYearSpend;
  const base = ufmsSolar.scenarios[1];
  const wh = wheeling.conservative;
  const bestCombined = [...combinedScenarios].sort(
    (a, b) => b.combinedTenYearSavingAgainstEskom - a.combinedTenYearSavingAgainstEskom,
  )[0];

  const vsRows = [
    { label: "Eskom (current path)", monthly: r(eskomMonthly), annual: r(eskomAnnual), tenYear: r(eskomTenYear), saving: "-" },
    { label: "UFMS Solar (base estimate)", monthly: r(eskomMonthly - base.monthlySaving), annual: r(eskomAnnual - base.annualSaving), tenYear: r(eskomTenYear - base.tenYearSavingAgainstEskom), saving: r(base.tenYearSavingAgainstEskom) },
    { label: "Wheeling (conservative)", monthly: r(eskomMonthly - wh.monthlySaving), annual: r(eskomAnnual - wh.annualSaving), tenYear: r(eskomTenYear - wh.tenYearSavingAgainstEskom), saving: r(wh.tenYearSavingAgainstEskom) },
    { label: `Best combined (${bestCombined.label})`, monthly: r(eskomMonthly - bestCombined.combinedMonthlySaving), annual: r(eskomAnnual - bestCombined.combinedAnnualSaving), tenYear: r(eskomTenYear - bestCombined.combinedTenYearSavingAgainstEskom), saving: r(bestCombined.combinedTenYearSavingAgainstEskom) },
  ];

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  function ensureSpace(height: number) {
    if (y + height <= pageHeight - margin) return;
    pdf.addPage();
    y = margin;
  }

  function text(
    value: string,
    options: { size?: number; style?: "normal" | "bold"; color?: [number, number, number]; lineGap?: number } = {},
  ) {
    const size = options.size ?? 10;
    const lineGap = options.lineGap ?? 4.8;
    pdf.setFont("helvetica", options.style ?? "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...(options.color ?? [17, 17, 17]));
    const lines = pdf.splitTextToSize(value, contentWidth) as string[];
    ensureSpace(lines.length * lineGap);
    pdf.text(lines, margin, y);
    y += lines.length * lineGap;
  }

  function heading(value: string) {
    ensureSpace(12);
    y += y === margin ? 0 : 5;
    text(value, { size: 13, style: "bold", lineGap: 5.8 });
    pdf.setDrawColor(225, 225, 225);
    pdf.line(margin, y - 2, pageWidth - margin, y - 2);
  }

  function table(headers: string[], rows: string[][], widths: number[]) {
    const rowHeight = 8;
    ensureSpace(rowHeight * (rows.length + 2));
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    let x = margin;
    pdf.setFillColor(245, 245, 245);
    pdf.rect(margin, y - 5, contentWidth, rowHeight, "F");
    headers.forEach((header, index) => {
      pdf.setTextColor(65, 65, 65);
      pdf.text(header, x + 2, y, { maxWidth: widths[index] - 4 });
      x += widths[index];
    });
    y += rowHeight;

    pdf.setFont("helvetica", "normal");
    rows.forEach((row) => {
      ensureSpace(rowHeight);
      x = margin;
      row.forEach((cell, index) => {
        pdf.setDrawColor(225, 225, 225);
        pdf.rect(x, y - 5, widths[index], rowHeight);
        pdf.setTextColor(index === row.length - 1 && cell !== "-" ? 31 : 35, index === row.length - 1 && cell !== "-" ? 122 : 35, index === row.length - 1 && cell !== "-" ? 58 : 35);
        pdf.text(cell, x + 2, y, { maxWidth: widths[index] - 4 });
        x += widths[index];
      });
      y += rowHeight;
    });
    y += 2;
  }

  pdf.setProperties({
    title: "Foundation-1 Energy Migration Report",
    subject: "Indicative energy migration assessment",
    creator: "Foundation-1",
  });

  text("Foundation-1 Energy Migration Report", { size: 18, style: "bold", lineGap: 8 });
  text(`Generated ${date} | Indicative estimates only | foundation-1.co.za`, {
    size: 9,
    color: [100, 100, 100],
    lineGap: 5,
  });

  heading("Current Utility Ten-Year Projection");
  table(
    ["Monthly spend", "Annual spend", "Ten-year path with Eskom"],
    [[r(currentUtilityProjection.currentMonthlySpend), r(currentUtilityProjection.currentAnnualSpend), r(currentUtilityProjection.tenYearSpend)]],
    [contentWidth / 3, contentWidth / 3, contentWidth / 3],
  );

  heading("Eskom vs Foundation-1");
  table(
    ["Scenario", "Monthly", "Annual", "10-year", "Saving"],
    vsRows.map((row) => [row.label, row.monthly, row.annual, row.tenYear, row.saving]),
    [52, 32, 32, 32, contentWidth - 148],
  );

  heading("UFMS Solar Detail");
  table(
    ["Metric", ...ufmsSolar.scenarios.map((scenario) => scenario.label)],
    [
      ["Saving %", ...ufmsSolar.scenarios.map((scenario) => p(scenario.savingPercentage))],
      ["Monthly saving", ...ufmsSolar.scenarios.map((scenario) => r(scenario.monthlySaving))],
      ["Annual saving", ...ufmsSolar.scenarios.map((scenario) => r(scenario.annualSaving))],
      ["10-year saving", ...ufmsSolar.scenarios.map((scenario) => r(scenario.tenYearSavingAgainstEskom))],
    ],
    [44, 44, 44, contentWidth - 132],
  );

  heading("Wheeling Detail");
  table(
    ["Metric", `Conservative R${wheeling.conservative.tariff.toFixed(2)}/kWh`, `PV-only R${wheeling.photovoltaicOnlyReference.tariff.toFixed(2)}/kWh`],
    [
      ["Saving %", p(wheeling.conservative.savingPercentage), p(wheeling.photovoltaicOnlyReference.savingPercentage)],
      ["Monthly saving", r(wheeling.conservative.monthlySaving), r(wheeling.photovoltaicOnlyReference.monthlySaving)],
      ["Annual saving", r(wheeling.conservative.annualSaving), r(wheeling.photovoltaicOnlyReference.annualSaving)],
      ["10-year saving", r(wheeling.conservative.tenYearSavingAgainstEskom), r(wheeling.photovoltaicOnlyReference.tenYearSavingAgainstEskom)],
    ],
    [44, 66, contentWidth - 110],
  );

  heading("Important");
  text(result.disclaimer, { size: 9, color: [85, 85, 85] });
  y += 4;
  text("Foundation-1 (Pty) Ltd | Indicative only - not a formal proposal or financial advice.", {
    size: 8,
    color: [140, 140, 140],
  });

  pdf.save(`Foundation1-Migration-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function MigrationReport({ result }: { result: MigrationAssessmentResult }) {
  const { currentUtilityProjection, ufmsSolar, wheeling, combinedScenarios } = result;
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState<{ profileId: string; accessCode: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const dashboardPath = credentials ? `/migration/dashboard?p=${credentials.profileId}` : "/migration/dashboard";
  const registrationPath = credentials ? `/migration/register?p=${credentials.profileId}` : "/migration/register";
  const dashboardUrl = credentials
    ? `${typeof window === "undefined" ? "https://1os.foundation-1.co.za" : window.location.origin}${dashboardPath}`
    : "https://1os.foundation-1.co.za/migration/dashboard";
  const bestIllustrativeSaving = Math.max(
    ...ufmsSolar.scenarios.map((scenario) => scenario.tenYearSavingAgainstEskom),
    wheeling.conservative.tenYearSavingAgainstEskom,
    wheeling.photovoltaicOnlyReference.tenYearSavingAgainstEskom,
    ...combinedScenarios.map((scenario) => scenario.combinedTenYearSavingAgainstEskom),
  );

  return (
    <section className={styles.section}>
      <div className={styles.shell}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Current Utility Ten-Year Projection</h2>
            <p className={styles.sectionCopy}>
              If you stay on your current utility path, your electricity spend could reach
              approximately <strong>{zar(currentUtilityProjection.tenYearSpend)}</strong> over the
              next 10 years. This is an estimate based on proposal-style escalation modelling, not
              an actual bill.
            </p>
          </div>
          <QualificationBadge status={result.qualificationStatus} />
        </div>

        <div className={`${styles.exposureGrid} ${styles.exposureGridThree}`}>
          <div className={styles.exposure}>
            <p>Monthly spend</p>
            <strong>{zar(currentUtilityProjection.currentMonthlySpend)}</strong>
          </div>
          <div className={styles.exposure}>
            <p>Annual spend</p>
            <strong>{zar(currentUtilityProjection.currentAnnualSpend)}</strong>
          </div>
          <div className={styles.exposure}>
            <p>Ten-year path with Eskom</p>
            <strong>{zar(currentUtilityProjection.tenYearSpend)}</strong>
          </div>
        </div>

        <div className={`${styles.sectionHeader} ${styles.reportSection}`}>
          <div>
            <h2 className={styles.sectionTitle}>Indicative UFMS Solar Estimate</h2>
            <p className={styles.sectionCopy}>
              UFMS solar is shown as a range because every customer has a different tariff,
              consumption profile, site economics, and formal partner proposal.
            </p>
          </div>
        </div>

        <div className={`${styles.cardsGrid} ${styles.cardsGridThree}`}>
          {ufmsSolar.scenarios.map((scenario) => (
            <SavingsCard
              key={scenario.label}
              title={scenario.label}
              rows={[
                { label: "Saving", value: percent(scenario.savingPercentage) },
                { label: "Monthly saving", value: zar(scenario.monthlySaving) },
                { label: "Annual saving", value: zar(scenario.annualSaving) },
                { label: "10-year saving", value: zar(scenario.tenYearSavingAgainstEskom) },
              ]}
            />
          ))}
        </div>

        <p className={styles.disclaimerAccent}>
          UFMS savings vary because every customer has a different tariff, consumption profile, site
          economics, and formal partner proposal. Your actual UFMS saving can only be confirmed
          after six months of utility bills are reviewed and a formal proposal is issued.
        </p>

        <div className={`${styles.sectionHeader} ${styles.reportSection}`}>
          <div>
            <h2 className={styles.sectionTitle}>Wheeling Estimate</h2>
            <p className={styles.sectionCopy}>
              Estimated monthly usage for wheeling comparison:{" "}
              <strong>{kwh(wheeling.estimatedMonthlyKilowattHours)}</strong>
            </p>
          </div>
        </div>

        <div className={`${styles.cardsGrid} ${styles.cardsGridTwo}`}>
          <SavingsCard
            title="Conservative estimate"
            rows={[
              { label: "Tariff", value: tariff(wheeling.conservative.tariff) },
              { label: "Saving", value: percent(wheeling.conservative.savingPercentage) },
              { label: "Monthly saving", value: zar(wheeling.conservative.monthlySaving) },
              { label: "Annual saving", value: zar(wheeling.conservative.annualSaving) },
              { label: "10-year saving", value: zar(wheeling.conservative.tenYearSavingAgainstEskom) },
            ]}
          />
          <SavingsCard
            title="PV-only reference"
            rows={[
              { label: "Tariff", value: tariff(wheeling.photovoltaicOnlyReference.tariff) },
              { label: "Saving", value: percent(wheeling.photovoltaicOnlyReference.savingPercentage) },
              { label: "Monthly saving", value: zar(wheeling.photovoltaicOnlyReference.monthlySaving) },
              { label: "Annual saving", value: zar(wheeling.photovoltaicOnlyReference.annualSaving) },
              { label: "10-year saving", value: zar(wheeling.photovoltaicOnlyReference.tenYearSavingAgainstEskom) },
            ]}
          />
        </div>

        <p className={styles.disclaimerAccent}>
          The R0.98/kWh figure is a photovoltaic-only reference. Final delivered wheeling pricing
          depends on the formal wheeling proposal, network conditions, metering, tariff
          structure, and partner approval.
        </p>

        <div className={`${styles.sectionHeader} ${styles.reportSection}`}>
          <div>
            <h2 className={styles.sectionTitle}>Eskom vs Foundation-1</h2>
            <p className={styles.sectionCopy}>
              What you pay today with Eskom compared to what you could pay with each Foundation-1 solution — and the combined best case.
            </p>
          </div>
        </div>

        {(() => {
          const eskomMonthly = currentUtilityProjection.currentMonthlySpend;
          const eskomAnnual = currentUtilityProjection.currentAnnualSpend;
          const eskomTenYear = currentUtilityProjection.tenYearSpend;
          const base = ufmsSolar.scenarios[1];
          const wh = wheeling.conservative;
          // Best combined = highest combined saving scenario
          const best = [...combinedScenarios].sort(
            (a, b) => b.combinedTenYearSavingAgainstEskom - a.combinedTenYearSavingAgainstEskom,
          )[0];

          const rows = [
            {
              label: "Eskom (current path)",
              monthly: zar(eskomMonthly),
              annual: zar(eskomAnnual),
              tenYear: zar(eskomTenYear),
              saving: null,
              isEskom: true,
              isBest: false,
            },
            {
              label: "UFMS Solar (base estimate)",
              monthly: zar(eskomMonthly - base.monthlySaving),
              annual: zar(eskomAnnual - base.annualSaving),
              tenYear: zar(eskomTenYear - base.tenYearSavingAgainstEskom),
              saving: zar(base.tenYearSavingAgainstEskom),
              isEskom: false,
              isBest: false,
            },
            {
              label: "Wheeling (conservative)",
              monthly: zar(eskomMonthly - wh.monthlySaving),
              annual: zar(eskomAnnual - wh.annualSaving),
              tenYear: zar(eskomTenYear - wh.tenYearSavingAgainstEskom),
              saving: zar(wh.tenYearSavingAgainstEskom),
              isEskom: false,
              isBest: false,
            },
            {
              label: `Best combined (${best.label})`,
              monthly: zar(eskomMonthly - best.combinedMonthlySaving),
              annual: zar(eskomAnnual - best.combinedAnnualSaving),
              tenYear: zar(eskomTenYear - best.combinedTenYearSavingAgainstEskom),
              saving: zar(best.combinedTenYearSavingAgainstEskom),
              isEskom: false,
              isBest: true,
            },
          ];

          return (
            <table className={styles.vsTable}>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Monthly cost</th>
                  <th>Annual cost</th>
                  <th>10-year cost</th>
                  <th>10-year saving vs Eskom</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.label}
                    className={row.isEskom ? styles.vsRowEskom : row.isBest ? styles.vsRowBest : undefined}
                  >
                    <td>{row.label}</td>
                    <td>{row.monthly}</td>
                    <td>{row.annual}</td>
                    <td>{row.tenYear}</td>
                    <td className={row.saving ? styles.vsSavingCell : styles.vsDash}>
                      {row.saving ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}

        <p className={styles.disclaimerAccent}>
          All figures are indicative. The combined scenario uses the highest-saving portfolio split from the model. Actual costs and savings are confirmed after partner review.
        </p>

        <p className={styles.sectionCopy} style={{ marginTop: 28, maxWidth: "100%" }}>
          This preliminary model shows potential ten-year savings as high as{" "}
          <strong style={{ color: "#fff" }}>{zar(bestIllustrativeSaving)}</strong>. Continue to your dashboard to complete the next steps.
        </p>

        <section className={styles.ctaPanel}>
          <h2 className={styles.cardTitle}>Ready to qualify your business?</h2>
          <p className={styles.sectionCopy}>
            Complete the company registration form first. Once the qualifying details are submitted, your dashboard will open so you can download the EOI template and upload your utility bills.
          </p>
          <div className={styles.buttonRow} style={{ marginTop: 16 }}>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => {
                const stored = readStoredMigrationAssessment();
                if (!stored) return;
                const { assessment, credentials } = ensureMigrationProfileCredentials(stored);
                writeStoredMigrationAssessment(assessment);
                setCredentials(credentials);
                setShowCredentials(true);
              }}
            >
              <ArrowRight size={14} strokeWidth={2.5} />
              Complete Business Details
            </button>
            <button
              className={styles.ghostButton}
              type="button"
              disabled={pdfLoading}
              onClick={async () => {
                setPdfLoading(true);
                try { await downloadReportPDF(result); }
                finally { setPdfLoading(false); }
              }}
            >
              <Download size={14} strokeWidth={2.5} />
              {pdfLoading ? "Generating…" : "Download Report PDF"}
            </button>
            <button className={styles.ghostButton} type="button" onClick={() => emailReport(result)}>
              <Mail size={14} strokeWidth={2.5} />
              Email This Report
            </button>
          </div>
        </section>

        <div className={styles.warningBox}>
          <p className={styles.warningLabel}>Indicative estimates only</p>
          <p className={styles.warningText}>{result.disclaimer}</p>
        </div>
      </div>

      {/* Credential reveal overlay */}
      {showCredentials && credentials && (
        <div className={styles.credentialOverlay}>
          <div className={styles.credentialCard}>
            <h2 className={styles.credentialTitle}>Save your access details</h2>
            <p className={styles.credentialCopy}>
              These are your unique profile credentials. Save them — after the business details form is complete, you&apos;ll need this access code to return to your dashboard from another device.
            </p>
            <div className={styles.credentialFields}>
              <div className={styles.credentialField}>
                <span className={styles.credentialLabel}>Profile ID</span>
                <span className={styles.credentialValue}>{credentials.profileId}</span>
              </div>
              <div className={styles.credentialField}>
                <span className={styles.credentialLabel}>Access code</span>
                <span className={styles.credentialValue} style={{ letterSpacing: "0.2em" }}>
                  {credentials.accessCode}
                </span>
              </div>
            </div>
            <div className={styles.credentialDashboardUrl}>
              <span className={styles.credentialLabel}>Dashboard URL after qualification</span>
              <span className={styles.credentialUrlText}>
                {dashboardUrl}
              </span>
            </div>
            <div className={styles.buttonRow} style={{ marginTop: 20 }}>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={() => {
                  router.push(registrationPath);
                }}
              >
                <ArrowRight size={14} strokeWidth={2.5} />
                I&apos;ve saved my details — Complete Business Details
              </button>
              <button
                className={styles.ghostButton}
                type="button"
                onClick={() => {
                  const text = `Profile ID: ${credentials.profileId}\nAccess code: ${credentials.accessCode}\nDashboard: ${dashboardUrl}`;
                  void navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} strokeWidth={2.5} />}
                {copied ? "Copied!" : "Copy details"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
