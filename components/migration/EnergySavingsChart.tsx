"use client";

import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ESKOM_ESCALATION_RATE = 0.125;
const FOUNDATION_ONE_ESCALATION_RATE = 0.06;
const FOUNDATION_ONE_STANDARD_COST_FACTOR = 0.65;
const FOUNDATION_ONE_BLENDER_COST_FACTOR = 0.4;
const PROJECTION_YEARS = 10;

export type EnergySavingsChartProps = {
  monthlySpend: number;
};

export type EnergySavingsProjectionPoint = {
  year: number;
  yearLabel: string;
  eskomAnnual: number;
  eskomCumulative: number;
  foundationOne35Annual: number;
  foundationOne35Cumulative: number;
  foundationOne60Annual: number;
  foundationOne60Cumulative: number;
};

export type EnergySavingsProjection = {
  points: EnergySavingsProjectionPoint[];
  totals: {
    eskom: number;
    foundationOne35: number;
    foundationOne60: number;
  };
  yearTenAnnualRates: {
    eskom: number;
    foundationOne35: number;
    foundationOne60: number;
  };
  savings: {
    foundationOne35: number;
    foundationOne60: number;
  };
};

function roundCurrency(value: number) {
  return Math.round(value);
}

export function buildEnergySavingsProjection(monthlySpend: number): EnergySavingsProjection {
  const annualStart = monthlySpend * 12;
  let eskomCumulative = 0;
  let foundationOne35Cumulative = 0;
  let foundationOne60Cumulative = 0;

  const points = Array.from({ length: PROJECTION_YEARS }, (_, index) => {
    const eskomAnnual = annualStart * (1 + ESKOM_ESCALATION_RATE) ** index;
    const foundationOne35Annual =
      annualStart *
      FOUNDATION_ONE_STANDARD_COST_FACTOR *
      (1 + FOUNDATION_ONE_ESCALATION_RATE) ** index;
    const foundationOne60Annual =
      annualStart *
      FOUNDATION_ONE_BLENDER_COST_FACTOR *
      (1 + FOUNDATION_ONE_ESCALATION_RATE) ** index;

    eskomCumulative += eskomAnnual;
    foundationOne35Cumulative += foundationOne35Annual;
    foundationOne60Cumulative += foundationOne60Annual;

    return {
      year: index + 1,
      yearLabel: `Yr ${index + 1}`,
      eskomAnnual: roundCurrency(eskomAnnual),
      eskomCumulative: roundCurrency(eskomCumulative),
      foundationOne35Annual: roundCurrency(foundationOne35Annual),
      foundationOne35Cumulative: roundCurrency(foundationOne35Cumulative),
      foundationOne60Annual: roundCurrency(foundationOne60Annual),
      foundationOne60Cumulative: roundCurrency(foundationOne60Cumulative),
    };
  });

  const yearTen = points[points.length - 1];

  return {
    points,
    totals: {
      eskom: yearTen.eskomCumulative,
      foundationOne35: yearTen.foundationOne35Cumulative,
      foundationOne60: yearTen.foundationOne60Cumulative,
    },
    yearTenAnnualRates: {
      eskom: yearTen.eskomAnnual,
      foundationOne35: yearTen.foundationOne35Annual,
      foundationOne60: yearTen.foundationOne60Annual,
    },
    savings: {
      foundationOne35: yearTen.eskomCumulative - yearTen.foundationOne35Cumulative,
      foundationOne60: yearTen.eskomCumulative - yearTen.foundationOne60Cumulative,
    },
  };
}

export function formatCompactRand(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `R${(value / 1_000_000).toFixed(2)}M`;
  }

  return `R${(value / 1_000).toFixed(0)}k`;
}

function formatFullRand(value: number) {
  return `R ${Math.round(value).toLocaleString("en-ZA").replace(/,/g, " ")}`;
}

function formatMillions(value: number) {
  return `R${(value / 1_000_000).toFixed(2)}M`;
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  label?: string;
  payload?: Array<{
    color?: string;
    name?: string;
    value?: number;
  }>;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-white/12 bg-[#080808]/95 px-3 py-2 shadow-[0_18px_60px_rgba(0,0,0,0.42)]">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/48">
        {label}
      </p>
      <div className="mt-2 grid gap-1.5">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-5 text-xs">
            <span className="inline-flex items-center gap-2 text-white/64">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <strong className="font-semibold text-white">{formatFullRand(entry.value ?? 0)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EnergySavingsChart({ monthlySpend }: EnergySavingsChartProps) {
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const projection = buildEnergySavingsProjection(monthlySpend);
  const chartData = projection.points.map((point) => ({
    year: point.yearLabel,
    "Eskom": point.eskomCumulative,
    "Foundation-1 35%": point.foundationOne35Cumulative,
    "Foundation-1 Blender 60%": point.foundationOne60Cumulative,
  }));

  useEffect(() => {
    const element = chartWrapRef.current;
    if (!element) return;

    function updateWidth(target: HTMLDivElement) {
      setChartWidth(Math.max(0, Math.floor(target.getBoundingClientRect().width)));
    }

    updateWidth(element);
    const observer = new ResizeObserver(() => updateWidth(element));
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <section className="mt-8 rounded-[10px] border border-white/10 bg-[#0a0a0a] p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-white/36">
            10-year cumulative comparison
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-tight tracking-normal text-white sm:text-2xl">
            Eskom vs Foundation-1
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-white/48">
          Cumulative cost projection from your entered monthly electricity spend.
        </p>
      </div>

      <div ref={chartWrapRef} className="mt-6 h-[300px] min-h-[300px] min-w-0 w-full">
        {chartWidth > 0 ? (
          <LineChart
            width={chartWidth}
            height={300}
            data={chartData}
            margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis
              dataKey="year"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.44)", fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.44)", fontSize: 11 }}
              tickFormatter={formatMillions}
              width={64}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.16)" }} />
            <Line
              type="monotone"
              dataKey="Eskom"
              stroke="#E24B4A"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Foundation-1 35%"
              stroke="#EF9F27"
              strokeWidth={2.5}
              strokeDasharray="8 5"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Foundation-1 Blender 60%"
              stroke="#3B6D11"
              strokeWidth={2.5}
              strokeDasharray="2 5"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <article className="border-l-4 border-[#E24B4A] bg-white/[0.035] px-4 py-3">
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-white/36">
            Eskom total
          </p>
          <strong className="mt-2 block text-2xl font-semibold text-white">
            {formatCompactRand(projection.totals.eskom)}
          </strong>
          <span className="mt-1 block text-sm text-white/46">
            Year 10 annual rate: {formatCompactRand(projection.yearTenAnnualRates.eskom)}
          </span>
        </article>

        <article className="border-l-4 border-[#EF9F27] bg-white/[0.035] px-4 py-3">
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-white/36">
            Foundation-1 35%
          </p>
          <strong className="mt-2 block text-2xl font-semibold text-white">
            {formatCompactRand(projection.totals.foundationOne35)}
          </strong>
          <span className="mt-1 block text-sm font-semibold text-[#EF9F27]">
            You keep: {formatCompactRand(projection.savings.foundationOne35)}
          </span>
        </article>

        <article className="border-l-4 border-[#3B6D11] bg-white/[0.035] px-4 py-3">
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-white/36">
            Foundation-1 Blender 60%
          </p>
          <strong className="mt-2 block text-2xl font-semibold text-white">
            {formatCompactRand(projection.totals.foundationOne60)}
          </strong>
          <span className="mt-1 block text-sm font-semibold text-[#87B05A]">
            You keep: {formatCompactRand(projection.savings.foundationOne60)}
          </span>
        </article>
      </div>

      <p className="mt-4 text-xs leading-5 text-white/38">
        Eskom at 12.5%/yr · Foundation-1 PPA at
        6%/yr CPI-linked · Zero capex
      </p>
    </section>
  );
}
