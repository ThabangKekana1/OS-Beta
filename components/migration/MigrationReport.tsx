"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Download, ArrowRight, ChevronDown } from "lucide-react";
import type { MigrationAssessmentResult } from "@/lib/calculateMigrationAssessment";
import {
  ensureMigrationProfileCredentials,
  readStoredMigrationAssessment,
  unlockMigrationDashboard,
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

function eskomEscalationPercentage(result: MigrationAssessmentResult) {
  return result.currentUtilityProjection.annualTariffEscalationPercentage ?? 12;
}

type IntakeApiResponse = {
  ok?: boolean;
  error?: string;
  backend?: "supabase" | "local";
  assessmentBackend?: "supabase" | "local";
  assessmentId?: string;
  leadId?: string;
  clientProfileId?: string;
};

type PreferredContactMethod = "email" | "whatsapp" | "phone";
type PreferredContactSelection = PreferredContactMethod | "";

const contactMethodLabels: Record<PreferredContactMethod, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  phone: "Phone call",
};

function sourceCampaignFromLocation() {
  if (typeof window === "undefined") {
    return { sourceCampaign: null, referrer: null };
  }

  const params = new URLSearchParams(window.location.search);
  const campaign = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
    .map((key) => {
      const value = params.get(key)?.trim();
      return value ? `${key}=${value}` : null;
    })
    .filter(Boolean)
    .join("&");

  return {
    sourceCampaign: campaign || null,
    referrer: document.referrer || null,
  };
}

export function emailMigrationReport(result: MigrationAssessmentResult) {
  const subject = encodeURIComponent("Foundation-1 Energy Migration Estimate");
  const { currentUtilityProjection, ufmsSolar, wheeling, combinedScenarios } = result;
  const body = encodeURIComponent(
    [
      `Current monthly electricity spend: ${zar(currentUtilityProjection.currentMonthlySpend)}`,
      `Current annual electricity spend: ${zar(currentUtilityProjection.currentAnnualSpend)}`,
      `Estimated ten-year current-utility spend: ${zar(currentUtilityProjection.tenYearSpend)}`,
      `Eskom current path assumption: tariffs increase by ${eskomEscalationPercentage(result)}% every year.`,
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

export async function downloadMigrationReportPDF(result: MigrationAssessmentResult): Promise<void> {
  const { currentUtilityProjection, ufmsSolar, wheeling, combinedScenarios } = result;
  const annualEskomEscalation = eskomEscalationPercentage(result);
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
    { label: "Generocity UFMS Solar (base estimate)", monthly: r(eskomMonthly - base.monthlySaving), annual: r(eskomAnnual - base.annualSaving), tenYear: r(eskomTenYear - base.tenYearSavingAgainstEskom), saving: r(base.tenYearSavingAgainstEskom) },
    { label: "Lumen Wheeling (conservative)", monthly: r(eskomMonthly - wh.monthlySaving), annual: r(eskomAnnual - wh.annualSaving), tenYear: r(eskomTenYear - wh.tenYearSavingAgainstEskom), saving: r(wh.tenYearSavingAgainstEskom) },
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
  text(
    `The Eskom current path assumes tariffs increase by ${annualEskomEscalation}% every year. The ten-year figure is calculated from that compounding annual escalation.`,
    { size: 9, color: [85, 85, 85] },
  );
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
  const annualEskomEscalation = eskomEscalationPercentage(result);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeError, setIntakeError] = useState("");
  const [intakeValues, setIntakeValues] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    preferredContactMethod: "" as PreferredContactSelection,
  });
  const router = useRouter();
  const bestIllustrativeSaving = Math.max(
    ...ufmsSolar.scenarios.map((scenario) => scenario.tenYearSavingAgainstEskom),
    wheeling.conservative.tenYearSavingAgainstEskom,
    wheeling.photovoltaicOnlyReference.tenYearSavingAgainstEskom,
    ...combinedScenarios.map((scenario) => scenario.combinedTenYearSavingAgainstEskom),
  );

  async function submitIntake(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIntakeError("");

    const stored = readStoredMigrationAssessment();
    if (!stored) {
      setIntakeError("Generate the assessment again before opening a client profile.");
      return;
    }

    const businessName = intakeValues.businessName.trim();
    const contactName = intakeValues.contactName.trim();
    const email = intakeValues.email.trim().toLowerCase();
    const phone = intakeValues.phone.trim();
    const preferredContactMethod = intakeValues.preferredContactMethod;
    if (!businessName || !contactName || !email || !phone) {
      setIntakeError("Enter business name, contact name, email, and WhatsApp number.");
      return;
    }
    if (!preferredContactMethod) {
      setIntakeError("Choose how you want Foundation-1 to contact you.");
      return;
    }

    setIntakeLoading(true);
    try {
      const { assessment, credentials } = ensureMigrationProfileCredentials({
        ...stored,
        result,
      });
      writeStoredMigrationAssessment(assessment);
      const campaign = sourceCampaignFromLocation();
      const response = await fetch("/api/migration/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          input: assessment.input,
          profileId: credentials.profileId,
          businessName,
          contactName,
          email,
          phone,
          preferredContactMethod,
          ...campaign,
        }),
      });
      const payload = (await response.json().catch(() => null)) as IntakeApiResponse | null;

      if (!response.ok || !payload?.ok || !payload.assessmentId || !payload.clientProfileId) {
        setIntakeError(payload?.error ?? "Unable to open the client profile. Try again.");
        return;
      }

      const next = {
        ...assessment,
        registration: {
          assessmentId: payload.assessmentId,
          backend: payload.assessmentBackend ?? payload.backend ?? "local",
          leadId: payload.leadId,
          clientProfileId: payload.clientProfileId,
          businessName,
          contactName,
          email,
          phone,
          preferredContactMethod,
          companyRegistrationNumber: "",
          monthlyElectricitySpendEstimateZar: result.currentUtilityProjection.currentMonthlySpend,
          source: "Migrate Portal" as const,
          ownerId: "public-link",
          registeredAt: new Date().toISOString(),
        },
        status: "registered" as const,
      };

      writeStoredMigrationAssessment(next);
      unlockMigrationDashboard(credentials.profileId);
      router.push(`/migration/success?p=${credentials.profileId}`);
    } catch {
      setIntakeError("Unable to reach the migration service. Try again.");
    } finally {
      setIntakeLoading(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.shell}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Current Utility Ten-Year Projection</h2>
            <p className={styles.sectionCopy}>
              If you stay on your current utility path, your electricity spend could reach
              approximately <strong>{zar(currentUtilityProjection.tenYearSpend)}</strong> over the
              next 10 years. This model assumes Eskom tariffs increase by{" "}
              <strong>{annualEskomEscalation}% every year</strong>, and compounds that increase
              across the full period. It is not an actual bill.
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
            <h2 className={styles.sectionTitle}>Generocity Utility Full Maintenance System (UFMS)</h2>
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
            <h2 className={styles.sectionTitle}>Lumen Wheeling Estimates</h2>
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
              What you pay today with Eskom compared to what you could pay with each Foundation-1 solution — and the combined best case. The Eskom current path is calculated with tariffs increasing by {annualEskomEscalation}% every year.
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
              label: `Eskom (current path, ${annualEskomEscalation}% annual tariff increase)`,
              monthly: zar(eskomMonthly),
              annual: zar(eskomAnnual),
              tenYear: zar(eskomTenYear),
              saving: null,
              isEskom: true,
              isBest: false,
            },
            {
              label: "Generocity UFMS Solar (base estimate)",
              monthly: zar(eskomMonthly - base.monthlySaving),
              annual: zar(eskomAnnual - base.annualSaving),
              tenYear: zar(eskomTenYear - base.tenYearSavingAgainstEskom),
              saving: zar(base.tenYearSavingAgainstEskom),
              isEskom: false,
              isBest: false,
            },
            {
              label: "Lumen Wheeling (conservative)",
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
          <strong style={{ color: "#fff" }}>{zar(bestIllustrativeSaving)}</strong>. Continue to open your profile, then upload the documents needed for formal proposal review.
        </p>

        <section className={styles.ctaPanel}>
          <h2 className={styles.cardTitle}>Register your interest</h2>
          <p className={styles.sectionCopy}>
            Your estimate is ready. Add your contact details and preferred contact method. A Foundation-1 representative will contact you using your selected channel.
          </p>
          <form className={styles.fieldStack} style={{ marginTop: 18 }} onSubmit={submitIntake}>
            <label className={styles.label}>
              Business name
              <input
                className={styles.input}
                type="text"
                autoComplete="organization"
                value={intakeValues.businessName}
                onChange={(event) => setIntakeValues((current) => ({ ...current, businessName: event.target.value }))}
              />
            </label>
            <label className={styles.label}>
              Contact name
              <input
                className={styles.input}
                type="text"
                autoComplete="name"
                value={intakeValues.contactName}
                onChange={(event) => setIntakeValues((current) => ({ ...current, contactName: event.target.value }))}
              />
            </label>
            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                type="email"
                autoComplete="email"
                value={intakeValues.email}
                onChange={(event) => setIntakeValues((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label className={styles.label}>
              WhatsApp / phone
              <input
                className={styles.input}
                type="tel"
                autoComplete="tel"
                value={intakeValues.phone}
                onChange={(event) => setIntakeValues((current) => ({ ...current, phone: event.target.value }))}
              />
            </label>
            <label className={styles.label}>
              Preferred mode of contact
              <span className={styles.contactSelectWrap}>
                <select
                  className={`${styles.select} ${styles.contactSelect}`}
                  value={intakeValues.preferredContactMethod}
                  onChange={(event) => setIntakeValues((current) => ({
                    ...current,
                    preferredContactMethod: event.target.value as PreferredContactSelection,
                  }))}
                >
                  <option value="" disabled>Choose email, WhatsApp, or phone</option>
                  {Object.entries(contactMethodLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <ChevronDown className={styles.contactSelectIcon} size={16} strokeWidth={2.5} aria-hidden="true" />
              </span>
            </label>
            {intakeError ? <p className={styles.error}>{intakeError}</p> : null}
            <div className={styles.buttonRow} style={{ marginTop: 4 }}>
              <button className={styles.primaryButton} type="submit" disabled={intakeLoading}>
                <ArrowRight size={14} strokeWidth={2.5} />
                {intakeLoading ? "Submitting…" : "Submit Registration"}
              </button>
              <button
                className={styles.ghostButton}
                type="button"
                disabled={pdfLoading}
                onClick={async () => {
                  setPdfLoading(true);
                  try { await downloadMigrationReportPDF(result); }
                  finally { setPdfLoading(false); }
                }}
              >
                <Download size={14} strokeWidth={2.5} />
                {pdfLoading ? "Generating…" : "Download Report PDF"}
              </button>
              <button className={styles.ghostButton} type="button" onClick={() => emailMigrationReport(result)}>
                <Mail size={14} strokeWidth={2.5} />
                Email This Report
              </button>
            </div>
          </form>
        </section>

        <div className={styles.warningBox}>
          <p className={styles.warningLabel}>Indicative estimates only</p>
          <p className={styles.warningText}>{result.disclaimer}</p>
        </div>
      </div>

    </section>
  );
}
