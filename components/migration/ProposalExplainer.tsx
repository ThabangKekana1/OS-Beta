"use client";

import { useState } from "react";
import type { EngineResult } from "@/lib/pricing-engine";

/**
 * Plain-language proposal explainer.
 *
 * Renders the verified engine's numbers the way a client actually thinks:
 * what we looked at, what we're proposing, what it costs, what it saves,
 * what stays on the municipal bill, and how the three contracting routes
 * compare — with every number traceable to the engine snapshot.
 */

function zar(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

type ProposalExplainerProps = {
  result: EngineResult;
  businessName?: string;
  preliminarySnapshot?: boolean;
};

export function ProposalExplainer({ result, businessName, preliminarySnapshot = false }: ProposalExplainerProps) {
  const [showWorkings, setShowWorkings] = useState(false);
  const { input, ufms, qualification } = result;

  const headline =
    ufms.yearOneSavingPct > 0.05
      ? `${pct(ufms.yearOneSavingPct)} lower cost from month one, rising every year after`
      : ufms.yearOneSavingPct >= 0
        ? "Costs held roughly level now — with escalation protection doing the saving"
        : "At your current tariff a zero-capex system does not yet beat your bill";

  const stats = [
    {
      label: "System",
      value: `${ufms.sizing.pvKwp}kWp solar + ${ufms.sizing.bessKwh}kWh battery`,
      hint: `${ufms.sizing.pcsKw}kW inverter capacity`,
    },
    {
      label: "Monthly charge (zero capex)",
      value: `${zar(ufms.ufmsMonthly)} excl VAT`,
      hint: "Fixed for 12 months at a time · goes up 6% once a year · 120 months",
    },
    {
      label: "Your bill today",
      value: `${zar(input.monthlySpend)} / month`,
      hint: `≈ ${Math.round(input.monthlyKwh).toLocaleString("en-ZA")} kWh at R${input.blendedTariff.toFixed(2)}/kWh blended`,
    },
    ufms.tenYearSaving >= 0
      ? {
          label: "Projected 10-year saving",
          value: zar(ufms.tenYearSaving),
          hint: `${zar(ufms.tenYearClientCostCurrent)} current path vs ${zar(ufms.tenYearClientCostSolution)} with the solution`,
        }
      : {
          label: "Projected 10-year cost difference",
          value: zar(Math.abs(ufms.tenYearSaving)),
          hint: "At your current tariff the solution costs more over ten years — escalation protection is the main benefit here.",
        },
  ];

  return (
    <section className="rounded-[8px] border border-white/[0.12] bg-[#080808] p-5 shadow-[0_30px_100px_rgba(0,0,0,.24)] md:p-7">
      <p className="font-mono text-[0.58rem] uppercase tracking-[0.19em] text-violet-200/65">
        {preliminarySnapshot ? "Initial no-bill model · retained snapshot" : "Your assessment, explained"}
      </p>
      <h2 className="mt-3 max-w-4xl text-2xl font-medium leading-tight tracking-[-0.045em] text-white">
        {businessName ? `${businessName}: ` : ""}
        {headline}
      </h2>
      <p className="mt-3 max-w-4xl text-xs leading-6 text-white/48">
        {preliminarySnapshot
          ? "This is the original spend-only screen retained for comparison. It is not the completed bill-audited assessment or formal UFMS proposal; released case documents and current status take precedence."
          : input.tariffSource === "assumed"
            ? "This is a spend-only range using assumed kWh and tariff. Six uploaded bills make it bill-audited and materially more accurate; engineering confirms the final design."
          : "These figures use your uploaded bill data and remain subject to engineering validation."}
      </p>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="min-h-28 rounded-[6px] border border-white/[0.09] bg-white/[0.025] px-4 py-4"
          >
            <dt className="text-[0.66rem] uppercase tracking-[0.16em] text-white/60">
              {stat.label}
            </dt>
            <dd className="mt-1 text-base font-semibold text-white/90">{stat.value}</dd>
            <dd className="mt-0.5 text-xs text-white/60">{stat.hint}</dd>
          </div>
        ))}
      </dl>

      {/* Contracting options */}
      <h3 className="mt-6 text-[0.66rem] uppercase tracking-[0.18em] text-white/60">
        Three ways to contract the same system
      </h3>

      {/* Mobile: stacked cards (the decision columns must not hide off-screen) */}
      <div className="mt-2 space-y-2 sm:hidden">
        {ufms.options.map((option) => (
          <div key={option.label} className="rounded-[6px] border border-white/[0.09] bg-white/[0.025] px-4 py-3">
            <p className="text-sm font-semibold text-white/90">{option.label}</p>
            <dl className="mt-2 space-y-1 text-xs text-white/70">
              <div className="flex justify-between gap-3">
                <dt>Monthly</dt>
                <dd>{option.monthlyCharge === null ? "—" : zar(option.monthlyCharge)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Escalation</dt>
                <dd>
                  {option.escalation === null
                    ? "—"
                    : option.escalation === 0
                      ? "None"
                      : `Goes up ${(option.escalation * 100).toFixed(0)}% once a year`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Upfront</dt>
                <dd>{option.upfront ? zar(option.upfront) : "R0"}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs leading-5 text-white/60">{option.ownership}</p>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="mt-2 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[540px] text-left text-sm">
          <thead>
            <tr className="text-[0.66rem] uppercase tracking-[0.16em] text-white/60">
              <th scope="col" className="py-2 pr-4 font-medium">Option</th>
              <th scope="col" className="py-2 pr-4 font-medium">Monthly</th>
              <th scope="col" className="py-2 pr-4 font-medium">Escalation</th>
              <th scope="col" className="py-2 pr-4 font-medium">Upfront</th>
              <th scope="col" className="py-2 font-medium">Ownership & cover</th>
            </tr>
          </thead>
          <tbody>
            {ufms.options.map((option) => (
              <tr key={option.label} className="border-t border-white/[0.09] align-top">
                <td className="py-2.5 pr-4 font-medium text-white/90">{option.label}</td>
                <td className="py-2.5 pr-4 text-white/70">
                  {option.monthlyCharge === null ? "—" : `${zar(option.monthlyCharge)}`}
                </td>
                <td className="py-2.5 pr-4 text-white/70">
                  {option.escalation === null
                    ? "—"
                    : option.escalation === 0
                      ? "None"
                      : `Goes up ${(option.escalation * 100).toFixed(0)}% once a year`}
                </td>
                <td className="py-2.5 pr-4 text-white/70">
                  {option.upfront ? zar(option.upfront) : "R0"}
                </td>
                <td className="py-2.5 text-xs leading-5 text-white/60">{option.ownership}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Qualification verdict */}
      <div
        className={`mt-5 rounded-[6px] border px-4 py-3 text-sm ${
          qualification.band === "strong"
            ? "border-lime-300/30 bg-lime-400/10 text-lime-100"
            : qualification.band === "marginal"
              ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
              : "border-white/15 bg-white/[0.04] text-white/60"
        }`}
      >
        <p className="text-[0.62rem] uppercase tracking-[0.18em] opacity-70">Qualification</p>
        <ul className="mt-1 space-y-1 text-xs leading-5">
          {qualification.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      {/* The full walk-through */}
      <button
        type="button"
        onClick={() => setShowWorkings((open) => !open)}
        aria-expanded={showWorkings}
        aria-controls="proposal-workings"
        className="mt-5 inline-flex items-center gap-2 rounded-[6px] border border-white/18 px-4 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-white/70 transition hover:border-violet-200/45 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
      >
        {showWorkings ? "Hide the full walk-through" : "Walk me through every number"}
        <span aria-hidden="true">{showWorkings ? "−" : "+"}</span>
      </button>
      {showWorkings ? (
        <ol id="proposal-workings" className="mt-4 space-y-3">
          {result.explainer.map((paragraph, index) => (
            <li key={index} className="flex gap-3 text-sm leading-6 text-white/70">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-white/20 text-[0.6rem] text-white/60">
                {index + 1}
              </span>
              {paragraph}
            </li>
          ))}
        </ol>
      ) : null}

      <p className="mt-5 text-xs leading-5 text-white/60">
        Indicative figures pending site assessment and final engineering design. The funder&apos;s
        formal proposal and credit approval follow your completed document pack. Assumed utility
        escalation {(result.input.utilityEscalation * 100).toFixed(1)}% a year (recent NERSA-approved
        increases); the solution goes up 6% once a year, fixed.
      </p>
    </section>
  );
}
