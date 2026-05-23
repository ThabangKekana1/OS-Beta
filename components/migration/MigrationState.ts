"use client";

import { useMemo, useSyncExternalStore } from "react";
import type {
  MigrationAssessmentInput,
  MigrationAssessmentResult,
} from "@/lib/calculateMigrationAssessment";

export type MigrationRegistration = {
  assessmentId: string;
  backend: "supabase" | "local";
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  companyRegistrationNumber: string;
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
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...value, updatedAt: new Date().toISOString() }),
  );
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function clearStoredMigrationAssessment() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(STORAGE_EVENT));
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
