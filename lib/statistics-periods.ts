export type StatisticsPeriodId = "24h" | "days" | "weeks" | "months";

export type StatisticsPeriod = {
  id: StatisticsPeriodId;
  label: string;
  caption: string;
  start: Date;
  end: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDate(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function getStatisticsPeriods(now = new Date()): StatisticsPeriod[] {
  return [
    {
      id: "24h",
      label: "24 Hours",
      caption: "Last 24 hours",
      start: new Date(now.getTime() - DAY_MS),
      end: now,
    },
    {
      id: "days",
      label: "Days",
      caption: "Last 7 days",
      start: shiftDate(now, -7),
      end: now,
    },
    {
      id: "weeks",
      label: "Weeks",
      caption: "Last 4 weeks",
      start: shiftDate(now, -28),
      end: now,
    },
    {
      id: "months",
      label: "Months",
      caption: "Last 12 months",
      start: shiftDate(now, -365),
      end: now,
    },
  ];
}

function applyTimeLabel(date: Date, label: string) {
  const match = label.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return date;
  }

  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function parseStatisticDate(value: string | null | undefined, now = new Date()) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("today")) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return applyTimeLabel(date, value);
  }

  if (normalized.startsWith("yesterday")) {
    const date = shiftDate(now, -1);
    date.setHours(0, 0, 0, 0);
    return applyTimeLabel(date, value);
  }

  return null;
}

export function isWithinStatisticsPeriod(
  value: string | null | undefined,
  period: StatisticsPeriod,
  now = new Date(),
) {
  const parsed = parseStatisticDate(value, now);
  return Boolean(parsed && parsed >= period.start && parsed <= period.end);
}
