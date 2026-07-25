import { createHmac, timingSafeEqual } from "node:crypto";

export const TELEMETRY_SCHEMA_VERSION = "2026-07-23.1";
export const TELEMETRY_EVENT_NAMES = [
  "consent_updated",
  "page_view",
  "interaction",
  "form_submit",
  "scroll_depth",
  "engagement",
  "client_error",
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENT_NAMES)[number];
export type TelemetryEnvironment =
  | "production"
  | "preview"
  | "development"
  | "test";
export type TelemetrySurface = "public_website" | "migration_workspace";
export type TelemetryConsentBasis = "analytics_consent" | "test";

export type RawTelemetryEvent = {
  id?: unknown;
  occurredAt?: unknown;
  environment?: unknown;
  surface?: unknown;
  eventName?: unknown;
  pageKey?: unknown;
  visitorId?: unknown;
  sessionId?: unknown;
  consentBasis?: unknown;
  properties?: unknown;
  schemaVersion?: unknown;
};

export type AcceptedTelemetryEvent = {
  id: string;
  occurredAt: string;
  environment: TelemetryEnvironment;
  surface: TelemetrySurface;
  eventName: TelemetryEventName;
  pageKey: string;
  visitorHash: string;
  sessionHash: string;
  consentBasis: TelemetryConsentBasis;
  properties: Record<string, string | number | boolean>;
  schemaVersion: string;
};

const allowedEventNames = new Set<string>(TELEMETRY_EVENT_NAMES);
const allowedEnvironments = new Set<string>([
  "production",
  "preview",
  "development",
  "test",
]);
const allowedSurfaces = new Set<string>([
  "public_website",
  "migration_workspace",
]);
const allowedConsentBases = new Set<string>(["analytics_consent", "test"]);
const tokenParentSegments = new Set([
  "case",
  "dealroom",
  "eoi",
  "mandate",
  "proposal",
  "register",
  "upload",
]);
const allowedPropertyKeys = new Set([
  "choice",
  "viewport",
  "element",
  "target_path",
  "interaction",
  "form_key",
  "depth",
  "seconds",
  "area",
  "code",
]);

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength)
    : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function sanitizeTelemetryPath(value: unknown) {
  const raw = cleanString(value, 500);
  if (!raw) return "/";
  let pathname = raw.split("?")[0]?.split("#")[0] ?? "/";
  try {
    pathname = new URL(raw, "https://foundation-1.invalid").pathname;
  } catch {
    pathname = "/";
  }
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment, index, all) => {
      const prior = all[index - 1] ?? "";
      if (all[0] === "estimate" && index > 0) {
        return index === 1 && segment === "a" ? "a" : "[token]";
      }
      if (prior === "case") return "[case]";
      if (tokenParentSegments.has(prior)) return "[token]";
      if (isUuid(segment)) return "[id]";
      if (/^[A-Za-z0-9_-]{24,}$/.test(segment)) return "[token]";
      return segment.replace(/[^A-Za-z0-9._~-]/g, "").slice(0, 60) || "_";
    });
  return `/${segments.join("/")}`.slice(0, 180) || "/";
}

function sanitizeProperties(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowedPropertyKeys.has(key)) continue;
    if (key === "target_path") {
      output[key] = sanitizeTelemetryPath(raw);
      continue;
    }
    if (typeof raw === "boolean") {
      output[key] = raw;
      continue;
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      output[key] = Math.max(-1_000_000, Math.min(1_000_000, raw));
      continue;
    }
    if (typeof raw === "string") {
      output[key] = cleanString(raw, 80);
    }
  }
  return output;
}

export function hashTelemetryIdentifier(value: string, secret: string) {
  if (secret.length < 16) {
    throw new Error("Telemetry hash secret must be at least 16 characters.");
  }
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function secureTelemetryKeyMatches(
  supplied: string | null,
  configured: string | undefined,
) {
  if (!supplied || !configured || configured.length < 16) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

function resolveOccurredAt(value: unknown, receivedAt: Date) {
  const parsed = new Date(typeof value === "string" ? value : "");
  if (Number.isNaN(parsed.getTime())) return receivedAt.toISOString();
  const lower = receivedAt.getTime() - 7 * 24 * 60 * 60 * 1000;
  const upper = receivedAt.getTime() + 10 * 60 * 1000;
  if (parsed.getTime() < lower || parsed.getTime() > upper) {
    return receivedAt.toISOString();
  }
  return parsed.toISOString();
}

export function sanitizeTelemetryBatch(input: {
  events: unknown;
  hashSecret: string;
  receivedAt?: Date;
}) {
  const receivedAt = input.receivedAt ?? new Date();
  if (!Array.isArray(input.events)) return [];
  const accepted: AcceptedTelemetryEvent[] = [];

  for (const item of input.events.slice(0, 20)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as RawTelemetryEvent;
    const id = cleanString(raw.id, 80);
    const visitorId = cleanString(raw.visitorId, 100);
    const sessionId = cleanString(raw.sessionId, 100);
    const eventName = cleanString(raw.eventName, 40);
    const environment = cleanString(raw.environment, 20);
    const surface = cleanString(raw.surface, 30);
    const consentBasis = cleanString(raw.consentBasis, 30);
    if (!isUuid(id) || !visitorId || !sessionId) continue;
    if (!allowedEventNames.has(eventName)) continue;
    if (!allowedEnvironments.has(environment)) continue;
    if (!allowedSurfaces.has(surface)) continue;
    if (!allowedConsentBases.has(consentBasis)) continue;
    if (environment !== "test" && consentBasis !== "analytics_consent") continue;

    accepted.push({
      id,
      occurredAt: resolveOccurredAt(raw.occurredAt, receivedAt),
      environment: environment as TelemetryEnvironment,
      surface: surface as TelemetrySurface,
      eventName: eventName as TelemetryEventName,
      pageKey: sanitizeTelemetryPath(raw.pageKey),
      visitorHash: hashTelemetryIdentifier(visitorId, input.hashSecret),
      sessionHash: hashTelemetryIdentifier(sessionId, input.hashSecret),
      consentBasis: consentBasis as TelemetryConsentBasis,
      properties: sanitizeProperties(raw.properties),
      schemaVersion:
        cleanString(raw.schemaVersion, 40) || TELEMETRY_SCHEMA_VERSION,
    });
  }
  return accepted;
}
