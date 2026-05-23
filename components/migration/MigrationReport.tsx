"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Download, ArrowRight } from "lucide-react";
import type { MigrationAssessmentResult } from "@/lib/calculateMigrationAssessment";
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

  const scenarioRows = (rows: { label: string; values: string[] }[]) =>
    rows.map(row => `<tr><td class="lbl">${row.label}</td>${row.values.map(v => `<td>${v}</td>`).join("")}</tr>`).join("");

  const eskomMonthly = currentUtilityProjection.currentMonthlySpend;
  const eskomAnnual = currentUtilityProjection.currentAnnualSpend;
  const eskomTenYear = currentUtilityProjection.tenYearSpend;
  const base = ufmsSolar.scenarios[1];
  const wh = wheeling.conservative;
  const bestCombined = [...combinedScenarios].sort(
    (a, b) => b.combinedTenYearSavingAgainstEskom - a.combinedTenYearSavingAgainstEskom,
  )[0];

  const vsRows = [
    { label: "Eskom (current path)", monthly: r(eskomMonthly), annual: r(eskomAnnual), tenYear: r(eskomTenYear), saving: "—", cls: "eskom" },
    { label: "UFMS Solar (base estimate)", monthly: r(eskomMonthly - base.monthlySaving), annual: r(eskomAnnual - base.annualSaving), tenYear: r(eskomTenYear - base.tenYearSavingAgainstEskom), saving: r(base.tenYearSavingAgainstEskom), cls: "" },
    { label: "Wheeling (conservative)", monthly: r(eskomMonthly - wh.monthlySaving), annual: r(eskomAnnual - wh.annualSaving), tenYear: r(eskomTenYear - wh.tenYearSavingAgainstEskom), saving: r(wh.tenYearSavingAgainstEskom), cls: "" },
    { label: `Best combined (${bestCombined.label})`, monthly: r(eskomMonthly - bestCombined.combinedMonthlySaving), annual: r(eskomAnnual - bestCombined.combinedAnnualSaving), tenYear: r(eskomTenYear - bestCombined.combinedTenYearSavingAgainstEskom), saving: r(bestCombined.combinedTenYearSavingAgainstEskom), cls: "best" },
  ];

  const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#111;background:#fff;padding:40px 48px;font-size:12px;line-height:1.5;width:794px}
  h1{font-size:20px;font-weight:700;margin-bottom:2px;color:#0a0a0a}
  .sub{color:#666;font-size:11px;margin-bottom:28px}
  h2{font-size:13px;font-weight:600;margin:24px 0 8px;color:#0a0a0a;border-bottom:1px solid #e5e5e5;padding-bottom:5px}
  table{width:100%;border-collapse:collapse;margin-bottom:6px}
  th{text-align:right;font-size:10px;font-weight:600;color:#555;padding:5px 10px;background:#f5f5f5;border:1px solid #e5e5e5}
  th:first-child{text-align:left}
  td{padding:6px 10px;border:1px solid #e5e5e5;font-size:11px;vertical-align:middle;text-align:right}
  td.lbl,td:first-child{text-align:left;font-weight:600;color:#333;background:#fafafa}
  .exposure{display:flex;gap:10px;margin-bottom:6px}
  .exp-cell{flex:1;border:1px solid #e5e5e5;border-radius:5px;padding:10px 14px}
  .exp-cell p{font-size:10px;color:#888;margin-bottom:2px}
  .exp-cell strong{font-size:14px;font-weight:700;color:#0a0a0a}
  .eskom td{color:#c0392b}
  .best td{color:#27ae60;font-weight:600}
  .saving{font-weight:700 !important;color:#27ae60 !important}
  .disclaimer{margin-top:28px;padding:12px 14px;border-left:3px solid #d4a017;background:#fffdf0;font-size:10px;color:#555;line-height:1.6}
  .footer{margin-top:20px;font-size:9px;color:#aaa;text-align:center;border-top:1px solid #e5e5e5;padding-top:10px}
</style></head><body>
  <h1>Foundation-1 Energy Migration Report</h1>
  <p class="sub">Generated ${date} &nbsp;&middot;&nbsp; Indicative estimates only &nbsp;&middot;&nbsp; foundation-1.co.za</p>

  <h2>Current Utility Ten-Year Projection</h2>
  <div class="exposure">
    <div class="exp-cell"><p>Monthly spend</p><strong>${r(currentUtilityProjection.currentMonthlySpend)}</strong></div>
    <div class="exp-cell"><p>Annual spend</p><strong>${r(currentUtilityProjection.currentAnnualSpend)}</strong></div>
    <div class="exp-cell"><p>Ten-year path with Eskom</p><strong>${r(currentUtilityProjection.tenYearSpend)}</strong></div>
  </div>

  <h2>Eskom vs Foundation-1</h2>
  <table>
    <thead><tr><th>Scenario</th><th>Monthly cost</th><th>Annual cost</th><th>10-year cost</th><th>10-year saving vs Eskom</th></tr></thead>
    <tbody>${vsRows.map(row => `<tr class="${row.cls}"><td>${row.label}</td><td>${row.monthly}</td><td>${row.annual}</td><td>${row.tenYear}</td><td class="${row.saving !== "—" ? "saving" : ""}">${row.saving}</td></tr>`).join("")}</tbody>
  </table>

  <h2>UFMS Solar Detail</h2>
  <table>
    <thead><tr><th></th>${ufmsSolar.scenarios.map(s => `<th>${s.label}</th>`).join("")}</tr></thead>
    <tbody>${scenarioRows([
      { label: "Saving %", values: ufmsSolar.scenarios.map(s => p(s.savingPercentage)) },
      { label: "Monthly saving", values: ufmsSolar.scenarios.map(s => r(s.monthlySaving)) },
      { label: "Annual saving", values: ufmsSolar.scenarios.map(s => r(s.annualSaving)) },
      { label: "10-year saving vs Eskom", values: ufmsSolar.scenarios.map(s => r(s.tenYearSavingAgainstEskom)) },
    ])}</tbody>
  </table>

  <h2>Wheeling Detail</h2>
  <table>
    <thead><tr><th></th><th>Conservative (R${wheeling.conservative.tariff.toFixed(2)}/kWh)</th><th>PV-only reference (R${wheeling.photovoltaicOnlyReference.tariff.toFixed(2)}/kWh)</th></tr></thead>
    <tbody>${scenarioRows([
      { label: "Saving %", values: [p(wheeling.conservative.savingPercentage), p(wheeling.photovoltaicOnlyReference.savingPercentage)] },
      { label: "Monthly saving", values: [r(wheeling.conservative.monthlySaving), r(wheeling.photovoltaicOnlyReference.monthlySaving)] },
      { label: "Annual saving", values: [r(wheeling.conservative.annualSaving), r(wheeling.photovoltaicOnlyReference.annualSaving)] },
      { label: "10-year saving vs Eskom", values: [r(wheeling.conservative.tenYearSavingAgainstEskom), r(wheeling.photovoltaicOnlyReference.tenYearSavingAgainstEskom)] },
    ])}</tbody>
  </table>

  <div class="disclaimer"><strong>Important:</strong> ${result.disclaimer}</div>
  <p class="footer">Foundation-1 (Pty) Ltd &nbsp;&middot;&nbsp; Indicative only &mdash; not a formal proposal or financial advice.</p>
</body></html>`;

  const { jsPDF } = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-9999px;top:0;z-index:-1;";
  container.innerHTML = htmlContent;
  document.body.appendChild(container);

  try {
    const body = container.querySelector("body") as HTMLElement;
    const canvas = await html2canvas(body, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    const imgH = pageW / ratio;
    let y = 0;
    let remaining = imgH;
    while (remaining > 0) {
      pdf.addImage(imgData, "PNG", 0, y === 0 ? 0 : -y, pageW, imgH);
      remaining -= pageH;
      if (remaining > 0) { pdf.addPage(); y += pageH; }
    }
    pdf.save(`Foundation1-Migration-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

export function MigrationReport({ result }: { result: MigrationAssessmentResult }) {
  const { currentUtilityProjection, ufmsSolar, wheeling, combinedScenarios } = result;
  const [pdfLoading, setPdfLoading] = useState(false);
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
          <h2 className={styles.cardTitle}>Ready to get your actual proposal?</h2>
          <p className={styles.sectionCopy}>
            Continue to your dashboard to capture your business details, download the EOI template, and upload your utility bills. Foundation-1 will then prepare your formal proposal.
          </p>
          <div className={styles.buttonRow} style={{ marginTop: 16 }}>
            <Link href="/migration/dashboard" className={styles.primaryButton}>
              <ArrowRight size={14} strokeWidth={2.5} />
              Continue to Dashboard
            </Link>
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
    </section>
  );
}