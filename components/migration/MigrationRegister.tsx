"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateMigrationAssessment } from "@/lib/calculateMigrationAssessment";
import {
  ClientRegistrationForm,
  type RegistrationFormValues,
} from "@/components/registration/ClientRegistrationForm";
import {
  ensureMigrationProfileCredentials,
  unlockMigrationDashboard,
  useStoredMigrationAssessment,
  writeStoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import styles from "@/components/migration/migration.module.css";

type ApiResponse = {
  ok?: boolean;
  error?: string;
  assessmentId?: string;
  backend?: "supabase" | "local";
};

type RegistrationApiResponse = {
  ok?: boolean;
  error?: string;
  backend?: "supabase" | "local";
  leadId?: string;
  clientProfileId?: string;
};

function contactName(values: RegistrationFormValues) {
  return `${values.contactFirstName} ${values.contactSurname}`.trim();
}

function splitName(value = "") {
  const [firstName = "", ...surnameParts] = value.trim().split(/\s+/).filter(Boolean);
  return {
    firstName,
    surname: surnameParts.join(" "),
  };
}

export function MigrationRegister() {
  const router = useRouter();
  const stored = useStoredMigrationAssessment();

  const initialValues = useMemo<Partial<RegistrationFormValues>>(() => {
    if (!stored) return {};

    const existingDetails = stored.registration?.businessDetails;
    if (existingDetails) return existingDetails;

    const existingName = splitName(stored.registration?.contactName);
    return {
      businessName: stored.registration?.businessName ?? "",
      businessRegistrationNumber: stored.registration?.companyRegistrationNumber ?? "",
      industry: stored.registration?.industry ?? "",
      contactFirstName: stored.registration?.contactFirstName ?? existingName.firstName,
      contactSurname: stored.registration?.contactSurname ?? existingName.surname,
      contactPosition: stored.registration?.contactPosition ?? "",
      contactEmail: stored.registration?.email ?? "",
      contactNumber: stored.registration?.phone ?? "",
      monthlyElectricitySpendEstimateZar:
        stored.registration?.monthlyElectricitySpendEstimateZar ??
        stored.input.monthlyElectricitySpend ??
        stored.input.monthlySpend,
      isBusinessRegistered: stored.registration?.isBusinessRegistered ?? true,
      isBusinessOperational: stored.registration?.isBusinessOperational ?? true,
      hasSixMonthUtilityBill: stored.registration?.hasSixMonthUtilityBill ?? false,
      physicalAddress: stored.registration?.physicalAddress ?? "",
      city: stored.registration?.city ?? "",
      province: stored.registration?.province ?? "",
      source: stored.registration?.source ?? "Migrate Portal",
      ownerId: stored.registration?.ownerId ?? "public-link",
    };
  }, [stored]);

  const submitBusinessDetails = async (values: RegistrationFormValues) => {
    if (!stored) return false;

    const monthlyElectricitySpend = values.monthlyElectricitySpendEstimateZar;
    const input = {
      ...stored.input,
      monthlyElectricitySpend,
      monthlySpend: monthlyElectricitySpend,
    };
    const result = calculateMigrationAssessment(input);
    const { assessment: credentialAssessment, credentials } = ensureMigrationProfileCredentials({
      ...stored,
      input,
      result,
    });

    try {
      const registrationResponse = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(values),
      });
      const registrationPayload = (await registrationResponse.json().catch(() => null)) as RegistrationApiResponse | null;

      if (
        !registrationResponse.ok ||
        !registrationPayload?.ok ||
        !registrationPayload.clientProfileId
      ) {
        return false;
      }

      const persistedAdminLink = registrationPayload.backend === "supabase";

      const assessmentResponse = await fetch("/api/migration/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          profileId: credentials.profileId,
          leadId: persistedAdminLink ? registrationPayload.leadId : undefined,
          clientProfileId: persistedAdminLink ? registrationPayload.clientProfileId : undefined,
          businessName: values.businessName,
          contactName: contactName(values),
          email: values.contactEmail,
          phone: values.contactNumber,
          companyRegistrationNumber: values.businessRegistrationNumber,
        }),
      });
      const assessmentPayload = (await assessmentResponse.json().catch(() => null)) as ApiResponse | null;

      if (
        !assessmentResponse.ok ||
        !assessmentPayload?.ok ||
        !assessmentPayload.assessmentId ||
        !assessmentPayload.backend
      ) {
        return false;
      }

      const next = {
        ...credentialAssessment,
        input,
        result,
        registration: {
          assessmentId: assessmentPayload.assessmentId,
          backend: assessmentPayload.backend,
          leadId: registrationPayload.leadId,
          clientProfileId: registrationPayload.clientProfileId,
          businessName: values.businessName,
          industry: values.industry,
          contactFirstName: values.contactFirstName,
          contactSurname: values.contactSurname,
          contactPosition: values.contactPosition,
          contactName: contactName(values),
          email: values.contactEmail,
          phone: values.contactNumber,
          companyRegistrationNumber: values.businessRegistrationNumber,
          monthlyElectricitySpendEstimateZar: values.monthlyElectricitySpendEstimateZar,
          isBusinessRegistered: values.isBusinessRegistered,
          isBusinessOperational: values.isBusinessOperational,
          hasSixMonthUtilityBill: values.hasSixMonthUtilityBill,
          physicalAddress: values.physicalAddress,
          city: values.city,
          province: values.province,
          source: values.source,
          ownerId: values.ownerId,
          businessDetails: values,
          registeredAt: new Date().toISOString(),
        },
        status: "registered" as const,
      };

      writeStoredMigrationAssessment(next);
      unlockMigrationDashboard(credentials.profileId);
      router.push(`/migration/dashboard?p=${credentials.profileId}`);
      return true;
    } catch {
      return false;
    }
  };

  if (stored === undefined) return null;

  if (!stored) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`}>
            <h1 className={styles.sectionTitle}>Generate the report first.</h1>
            <p className={styles.sectionCopy}>
              Registration starts after the instant report so the Business sees value before creating a profile.
            </p>
            <div className={styles.buttonRow}>
              <Link href="/migration/start" className={styles.primaryButton}>
                Start Migration Assessment
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (stored.registration) {
    const dashboardHref = stored.profileId ? `/migration/dashboard?p=${stored.profileId}` : "/migration/dashboard";
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`}>
            <h1 className={styles.sectionTitle}>Business details complete.</h1>
            <p className={styles.sectionCopy}>
              Your business registration is connected to this migration profile. Continue in the dashboard to upload the remaining utility profile documents.
            </p>
            <div className={styles.buttonRow}>
              <Link href={dashboardHref} className={styles.primaryButton}>
                Continue to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <ClientRegistrationForm
      key={`migration-${stored.profileId ?? "draft"}`}
      defaultOwnerId="public-link"
      lockOwner
      initialValues={initialValues}
      storageKey={`oneos:registration:migration:${stored.profileId ?? "draft"}`}
      eyebrow="Foundation-1 Migration Qualification"
      title="Complete business details to unlock your dashboard."
      description="This is the same secure company registration used by Foundation-1. Complete it once so the team can qualify your business before dashboard upload and proposal steps open."
      submitLabel="Complete Business Details"
      onSubmit={submitBusinessDetails}
    />
  );
}
