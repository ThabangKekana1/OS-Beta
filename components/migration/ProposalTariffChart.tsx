"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProposalTariffProjectionRow } from "@/lib/proposal-impact-model";
import type { UtilityTariffHistoryRow } from "@/lib/proposal-impact-model";
import styles from "@/components/migration/migration.module.css";

function money(value: number) {
  return `R${value.toFixed(2)}`;
}

export function ProposalTariffChart({
  rows,
  historicalContext,
}: {
  rows: ProposalTariffProjectionRow[];
  historicalContext: readonly UtilityTariffHistoryRow[];
}) {
  const years = new Set([
    ...historicalContext.map((row) => row.year),
    ...rows.map((row) => row.year),
  ]);
  const chartRows = [...years].sort((left, right) => left - right).map((year) => {
    const historical = historicalContext.find((row) => row.year === year);
    const projection = rows.find((row) => row.year === year);
    return {
      year,
      nationalContext: historical?.utilityTariffRandPerKwh,
      utilityEffectiveTariff: projection?.utilityEffectiveTariff,
      ufmsEffectiveTariff: projection?.ufmsEffectiveTariff,
      assetFinanceInstalmentTariff: projection?.assetFinanceInstalmentTariff,
    };
  });

  return (
    <figure className={styles.reportChartFigure} aria-labelledby="tariff-chart-title">
      <div className={styles.reportChartHeader}>
        <div>
          <p className={styles.reportEyebrow}>Effective tariff trajectory</p>
          <h3 id="tariff-chart-title">The widening cost gap</h3>
        </div>
        <div className={styles.reportChartLegend} aria-label="Chart legend">
          <span><i className={styles.legendHistory} />National context</span>
          <span><i className={styles.legendUtility} />Utility</span>
          <span><i className={styles.legendUfms} />UFMS + grid</span>
          <span><i className={styles.legendAsset} />Asset instalment</span>
        </div>
      </div>
      <div className={styles.reportChartCanvas}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 20, right: 18, left: 2, bottom: 2 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis
              dataKey="year"
              stroke="rgba(255,255,255,0.44)"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              stroke="rgba(255,255,255,0.44)"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => `R${Number(value).toFixed(0)}`}
              width={40}
            />
            <Tooltip
              formatter={(value, name) => [money(Number(value)), String(name)]}
              labelFormatter={(year) => `Report year ${year}`}
              contentStyle={{
                background: "#0b110e",
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: 12,
                color: "#f4f7f4",
              }}
            />
            <Line
              type="monotone"
              dataKey="nationalContext"
              name="National template context"
              stroke="#4ec5e5"
              strokeWidth={2}
              strokeDasharray="3 5"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="utilityEffectiveTariff"
              name="Complete utility tariff"
              stroke="#ff8a78"
              strokeWidth={3}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ufmsEffectiveTariff"
              name="Complete UFMS + retained grid"
              stroke="#b9ff91"
              strokeWidth={3}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="assetFinanceInstalmentTariff"
              name="Asset-finance instalment only"
              stroke="#8fb7ff"
              strokeWidth={2}
              strokeDasharray="7 7"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption>
        The blue 2007–2033 line reproduces the observed Nedbank/Eqstra national template context;
        values after 2024 were legacy projections. Client lines start from the audited current
        baseline. UFMS includes retained grid charges. Asset finance is instalment-only.
      </figcaption>
    </figure>
  );
}
