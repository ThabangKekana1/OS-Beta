/**
 * Shared formatting and ID-generation utilities used across both
 * the workspace and admin portals.
 */

export function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowLabel() {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export function timelineLabel() {
  return `Today, ${nowLabel()}`;
}

export function todayLabel() {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
}
