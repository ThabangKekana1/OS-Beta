"use client";

import { useMemo, useSyncExternalStore } from "react";
import type {
  MigrationAssessmentInput,
  MigrationAssessmentResult,
} from "@/lib/calculateMigrationAssessment";
import type { RegistrationFormValues } from "@/components/registration/ClientRegistrationForm";

export type MigrationRegistration = {
  assessmentId: string;
  backend: "supabase" | "local";
  leadId?: string;
  clientProfileId?: string;
  businessName: string;
  industry?: string;
  contactFirstName?: string;
  contactSurname?: string;
  contactPosition?: string;
  contactName: string;
  email: string;
  phone: string;
  preferredContactMethod?: "email" | "whatsapp" | "phone" | string;
  companyRegistrationNumber: string;
  monthlyElectricitySpendEstimateZar?: number;
  isBusinessRegistered?: boolean;
  isBusinessOperational?: boolean;
  hasSixMonthUtilityBill?: boolean;
  physicalAddress?: string;
  city?: string;
  province?: string;
  source?: RegistrationFormValues["source"];
  ownerId?: string;
  businessDetails?: RegistrationFormValues;
  registeredAt: string;
};

export type MigrationDocumentType = "expression_of_interest" | "utility_bill";

export type MigrationDocumentRecord = {
  id: string;
  documentType: MigrationDocumentType;
  fileName: string;
  uploadedAt: string;
  status: string;
};

export type StoredMigrationAssessment = {
  input: MigrationAssessmentInput;
  result: MigrationAssessmentResult;
  registration?: MigrationRegistration;
  documents: MigrationDocumentRecord[];
  profileId?: string;   // generated when user continues to dashboard
  accessCode?: string;  // 4-digit PIN shown to user once
  status:
    | "draft_assessment"
    | "instant_report_generated"
    | "registered"
    | "utility_profile_uploaded"
    | "proposal_pending"
    | "proposal_ready"
    | "term_sheet_pending"
    | "approved"
    | "declined";
  updatedAt: string;
};

const STORAGE_KEY = "foundation1:migration-assessment";
const STORAGE_EVENT = "foundation1:migration-assessment:changed";
const DASHBOARD_UNLOCK_KEY = "foundation1:migration:unlocked";
const DASHBOARD_UNLOCK_EVENT = "foundation1:migration:unlock-changed";

function hasBrowserStorage() {
  return typeof window !== "undefined";
}

function sanitizedForRemote(value: StoredMigrationAssessment) {
  const assessment = { ...value };
  delete assessment.accessCode;
  return assessment;
}

async function syncStoredMigrationAssessment(value: StoredMigrationAssessment) {
  if (!hasBrowserStorage() || !value.profileId || !value.accessCode) return;

  try {
    await fetch("/api/migration/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: value.profileId,
        accessCode: value.accessCode,
        assessment: sanitizedForRemote(value),
      }),
      keepalive: true,
    });
  } catch {
    // Local storage remains the source of truth if the remote profile store is unavailable.
  }
}

export function readStoredMigrationAssessment(): StoredMigrationAssessment | null {
  if (typeof window === "undefined") return null;

  try {
    return parseStoredMigrationAssessment(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function readStoredMigrationAssessmentRaw() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function parseStoredMigrationAssessment(raw: string | null | undefined) {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredMigrationAssessment;
  } catch {
    return null;
  }
}

export function writeStoredMigrationAssessment(value: StoredMigrationAssessment) {
  if (typeof window === "undefined") return;
  const nextValue = { ...value, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(nextValue),
  );
  window.dispatchEvent(new Event(STORAGE_EVENT));
  void syncStoredMigrationAssessment(nextValue);
}

export function clearStoredMigrationAssessment() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function unlockMigrationDashboard(profileId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DASHBOARD_UNLOCK_KEY, profileId);
  window.dispatchEvent(new Event(DASHBOARD_UNLOCK_EVENT));
}

export type MigrationProfileCredentials = {
  profileId: string;
  accessCode: string;
};

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  return bytes.map(() => Math.floor(Math.random() * 256));
}

export function createMigrationProfileCredentials(): MigrationProfileCredentials {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const profileIdSuffix = Array.from(randomBytes(8))
    .map((byte) => chars[byte % chars.length])
    .join("");
  const [a, b, c, d] = randomBytes(4);
  const pinSeed = (((a << 24) >>> 0) + (b << 16) + (c << 8) + d) >>> 0;
  const accessCode = String(1000 + (pinSeed % 9000));
  return {
    profileId: `F1-${profileIdSuffix}`,
    accessCode,
  };
}

export function ensureMigrationProfileCredentials(
  value: StoredMigrationAssessment,
): { assessment: StoredMigrationAssessment; credentials: MigrationProfileCredentials } {
  if (value.profileId && value.accessCode) {
    return {
      assessment: value,
      credentials: {
        profileId: value.profileId,
        accessCode: value.accessCode,
      },
    };
  }

  const credentials = createMigrationProfileCredentials();
  return {
    assessment: { ...value, ...credentials },
    credentials,
  };
}

export function clearMigrationDashboardUnlock() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(DASHBOARD_UNLOCK_KEY);
  window.dispatchEvent(new Event(DASHBOARD_UNLOCK_EVENT));
}

export function readMigrationDashboardUnlockedProfile() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(DASHBOARD_UNLOCK_KEY);
}

function subscribeToStoredMigrationAssessment(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORAGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORAGE_EVENT, onStoreChange);
  };
}

function subscribeToMigrationDashboardUnlock(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(DASHBOARD_UNLOCK_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(DASHBOARD_UNLOCK_EVENT, onStoreChange);
  };
}

export function useStoredMigrationAssessment() {
  const raw = useSyncExternalStore(
    subscribeToStoredMigrationAssessment,
    readStoredMigrationAssessmentRaw,
    () => undefined,
  );

  return useMemo(() => {
    if (raw === undefined) return undefined;
    return parseStoredMigrationAssessment(raw);
  }, [raw]);
}

export function useMigrationDashboardUnlockedProfile() {
  return useSyncExternalStore(
    subscribeToMigrationDashboardUnlock,
    readMigrationDashboardUnlockedProfile,
    () => null,
  );
}
