"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, FileText, Upload, X } from "lucide-react";
import {
  useStoredMigrationAssessment,
  writeStoredMigrationAssessment,
  type MigrationDocumentRecord,
  type MigrationDocumentType,
  type StoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import { MigrationProgressTracker } from "@/components/migration/MigrationProgressTracker";
import { downloadTextFile } from "@/lib/download-utils";
import {
  buildEoiTemplateFilename,
  buildEoiTemplateText,
} from "@/lib/eoi-template";
import { documentUploadLinkIdForLead } from "@/lib/registration-links";
import styles from "@/components/migration/migration.module.css";

const documentTypes: Array<{
  id: MigrationDocumentType;
  eyebrow: string;
  label: string;
  description: string;
}> = [
  {
    id: "expression_of_interest",
    eyebrow: "Step 1",
    label: "Signed Expression of Interest",
    description: "Upload the signed EOI after placing the template on company letterhead.",
  },
  {
    id: "utility_bill",
    eyebrow: "Step 2",
    label: "Six months of utility bills",
    description: "Upload all monthly statements, invoices, or meter/account documents for review.",
  },
];

const acceptedFileTypes = ".pdf,.png,.jpg,.jpeg,.xlsx,.csv,application/pdf,image/png,image/jpeg,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const emptySelectedFiles: Record<MigrationDocumentType, File[]> = {
  expression_of_interest: [],
  utility_bill: [],
};

type UploadResponse = {
  ok?: boolean;
  error?: string;
  document?: MigrationDocumentRecord;
};

type AdminUploadResponse = {
  ok?: boolean;
  error?: string;
};

function adminDocumentType(documentType: MigrationDocumentType) {
  return documentType === "expression_of_interest" ? "signed_eoi" : "utility_bills";
}

function eoiLeadFromStoredProfile(stored: StoredMigrationAssessment, registrationNumber: string) {
  const registration = stored.registration;
  if (!registration) return null;

  return {
    clientProfileId: registration.clientProfileId ?? stored.profileId ?? registration.assessmentId,
    company: registration.businessName,
    businessRegistrationNumber: registrationNumber,
    contactName: registration.contactName,
    physicalAddress: registration.physicalAddress ?? "",
    monthlyElectricitySpendEstimateZar: registration.monthlyElectricitySpendEstimateZar,
    userProfile: {
      phone: registration.phone,
      role: registration.contactPosition || "Authorised representative",
    },
  };
}

async function syncFileToAdminProfile(
  stored: StoredMigrationAssessment,
  queuedFile: { documentType: MigrationDocumentType; file: File },
) {
  const registration = stored.registration;
  if (!registration?.leadId || !registration.clientProfileId) {
    throw new Error("This migration profile is not linked to an admin client profile yet.");
  }

  const token = documentUploadLinkIdForLead({
    leadId: registration.leadId,
    clientProfileId: registration.clientProfileId,
    email: registration.email,
  });
  const formData = new FormData();
  formData.append("documentType", adminDocumentType(queuedFile.documentType));
  formData.append("files", queuedFile.file);

  const response = await fetch(`/api/upload/${encodeURIComponent(token)}`, {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json().catch(() => null)) as AdminUploadResponse | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "Unable to attach this file to the admin client profile.");
  }

  return payload;
}

export function UtilityUpload() {
  const externalStored = useStoredMigrationAssessment();
  const [localStored, setLocalStored] = useState<StoredMigrationAssessment | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<MigrationDocumentType, File[]>>(emptySelectedFiles);
  const [dragOverType, setDragOverType] = useState<MigrationDocumentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [eoiRegistrationNumber, setEoiRegistrationNumber] = useState("");

  const stored = localStored ?? externalStored;

  const uploadedTypes = useMemo(() => {
    return new Set(stored?.documents.map((document) => document.documentType) ?? []);
  }, [stored]);
  const isUtilityProfileComplete =
    uploadedTypes.has("expression_of_interest") && uploadedTypes.has("utility_bill");

  const queuedFiles = useMemo(() => {
    return documentTypes.flatMap((type) =>
      selectedFiles[type.id].map((file) => ({ documentType: type.id, file })),
    );
  }, [selectedFiles]);

  function addFiles(documentType: MigrationDocumentType, files: FileList | File[]) {
    const nextFiles = Array.from(files);
    if (nextFiles.length === 0) return;

    setError(null);
    setSuccess(null);
    setSelectedFiles((current) => ({
      ...current,
      [documentType]: [...current[documentType], ...nextFiles],
    }));
  }

  function removeQueuedFile(documentType: MigrationDocumentType, fileIndex: number) {
    setSelectedFiles((current) => ({
      ...current,
      [documentType]: current[documentType].filter((_, index) => index !== fileIndex),
    }));
  }

  function downloadEoiTemplate() {
    if (!stored) return;
    const registrationNumber = stored.registration?.companyRegistrationNumber?.trim() || eoiRegistrationNumber.trim();
    if (!registrationNumber) {
      setError("Enter the company registration number to generate the prefilled EOI. You can still upload utility bills now.");
      return;
    }

    let templateStored = stored;
    if (stored.registration && !stored.registration.companyRegistrationNumber?.trim()) {
      templateStored = {
        ...stored,
        registration: {
          ...stored.registration,
          companyRegistrationNumber: registrationNumber,
        },
      };
      writeStoredMigrationAssessment(templateStored);
      setLocalStored(templateStored);
    }

    const eoiLead = eoiLeadFromStoredProfile(templateStored, registrationNumber);
    if (!eoiLead) return;
    setError(null);
    downloadTextFile(
      buildEoiTemplateFilename(eoiLead.company),
      buildEoiTemplateText(eoiLead),
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stored?.registration) return;
    if (queuedFiles.length === 0) {
      setError("Add at least one signed EOI or utility bill file before uploading.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const uploadedDocuments: MigrationDocumentRecord[] = [];
      const adminSyncErrors: string[] = [];

      for (const queuedFile of queuedFiles) {
        const formData = new FormData();
        formData.append("assessmentId", stored.registration.assessmentId);
        if (stored.profileId) formData.append("profileId", stored.profileId);
        if (stored.registration.leadId) formData.append("leadId", stored.registration.leadId);
        if (stored.registration.clientProfileId) {
          formData.append("clientProfileId", stored.registration.clientProfileId);
        }
        formData.append("documentType", queuedFile.documentType);
        formData.append("file", queuedFile.file);

        const response = await fetch("/api/migration/documents", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as UploadResponse;

        if (!response.ok || !payload.ok || !payload.document) {
          setError(payload.error ?? `Unable to receive ${queuedFile.file.name}.`);
          return;
        }

        uploadedDocuments.push(payload.document);

        try {
          await syncFileToAdminProfile(stored, queuedFile);
        } catch (syncError) {
          adminSyncErrors.push(
            syncError instanceof Error
              ? syncError.message
              : "Unable to attach a file to the admin client profile.",
          );
        }
      }

      const existing = stored.documents.filter(
        (document) => !uploadedDocuments.some((uploaded) => uploaded.id === document.id),
      );
      const nextDocuments = [...uploadedDocuments, ...existing];
      const next: StoredMigrationAssessment = {
        ...stored,
        documents: nextDocuments,
        status:
          nextDocuments.some((document) => document.documentType === "expression_of_interest") &&
          nextDocuments.some((document) => document.documentType === "utility_bill")
            ? "utility_profile_uploaded"
            : "registered",
      };
      writeStoredMigrationAssessment(next);
      setLocalStored(next);
      setSelectedFiles(emptySelectedFiles);
      if (adminSyncErrors.length > 0) {
        setError(
          `${uploadedDocuments.length} file${uploadedDocuments.length === 1 ? "" : "s"} received in the migration dashboard, but ${adminSyncErrors.length} could not be attached to the admin profile. ${adminSyncErrors[0]}`,
        );
        return;
      }
      setSuccess(
        `${uploadedDocuments.length} file${uploadedDocuments.length === 1 ? "" : "s"} uploaded. ${
          next.status === "utility_profile_uploaded"
            ? "Utility Profile complete — proposal review can continue."
            : "Upload both the signed EOI and utility bills to continue."
        }`,
      );
    } catch {
      setError("Unable to reach the migration service. Try again.");
    } finally {
      setIsUploading(false);
    }
  };

  if (stored === undefined) return null;

  if (!stored?.registration) {
    return (
      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={`${styles.panel} ${styles.form}`}>
            <h1 className={styles.sectionTitle}>Open your client profile first.</h1>
            <p className={styles.sectionCopy}>
              Your report needs to be connected to a lightweight Foundation-1 client file before documents can be attached.
            </p>
            <div className={styles.buttonRow}>
              <Link href="/migration/report" className={styles.primaryButton}>
                Open Profile From Report
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.shell}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.sectionTitle}>
              {isUtilityProfileComplete ? "Utility Profile Received" : "Upload Utility Profile"}
            </h1>
            <p className={styles.sectionCopy}>
              Download your prefilled EOI template, place it on your company letterhead, sign it, then
              upload the signed EOI together with your six months of utility bills. If the EOI is not ready yet, upload the bills now and return to the EOI later.
            </p>
          </div>
        </div>

        <div className={`${styles.panel} ${styles.split}`}>
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.uploadZone}>
              <div className={styles.eoiTemplateCard}>
                <div>
                  <span className={styles.cardLabel}>EOI template</span>
                  <h2 className={styles.cardTitle}>Download the prefilled EOI, sign, then upload.</h2>
                  <p className={styles.sectionCopy}>
                    The template uses the business details already captured for this client profile. Add the registration number only when you generate the EOI.
                  </p>
                </div>
                {!stored.registration.companyRegistrationNumber?.trim() ? (
                  <label className={styles.label}>
                    Company registration number for EOI
                    <input
                      className={styles.input}
                      type="text"
                      placeholder="e.g. 2024/123456/07"
                      value={eoiRegistrationNumber}
                      onChange={(event) => setEoiRegistrationNumber(event.target.value)}
                    />
                  </label>
                ) : null}
                <button className={styles.secondaryButton} type="button" onClick={downloadEoiTemplate}>
                  <Download size={14} strokeWidth={2.4} />
                  Download EOI Template
                </button>
              </div>

              {documentTypes.map((type) => {
                const queuedForType = selectedFiles[type.id];
                return (
                  <div className={styles.uploadGroup} key={type.id}>
                    <div>
                      <span className={styles.cardLabel}>{type.eyebrow}</span>
                      <h2 className={styles.cardTitle}>{type.label}</h2>
                      <p className={styles.sectionCopy}>{type.description}</p>
                    </div>
                    <label
                      className={`${styles.dropBox} ${dragOverType === type.id ? styles.dropBoxActive : ""}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverType(type.id);
                      }}
                      onDragLeave={() => setDragOverType(null)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragOverType(null);
                        addFiles(type.id, event.dataTransfer.files);
                      }}
                    >
                      <input
                        className={styles.fileInput}
                        type="file"
                        multiple
                        accept={acceptedFileTypes}
                        onChange={(event) => {
                          if (event.target.files) addFiles(type.id, event.target.files);
                          event.target.value = "";
                        }}
                      />
                      <span className={styles.dropIcon}>
                        <Upload size={16} strokeWidth={2.4} />
                      </span>
                      <span className={styles.dropTitle}>Drag files here or click to browse</span>
                      <span className={styles.dropMeta}>PDF, PNG, JPG, XLSX, CSV · multiple files allowed</span>
                    </label>
                    {queuedForType.length > 0 ? (
                      <div className={styles.queuedFiles}>
                        {queuedForType.map((queuedFile, index) => (
                          <div className={styles.queuedFile} key={`${queuedFile.name}-${queuedFile.size}-${index}`}>
                            <FileText size={14} strokeWidth={2.3} />
                            <span>{queuedFile.name}</span>
                            <button
                              type="button"
                              aria-label={`Remove ${queuedFile.name}`}
                              onClick={() => removeQueuedFile(type.id, index)}
                            >
                              <X size={13} strokeWidth={2.4} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {error ? <p className={styles.error}>{error}</p> : null}
              {success ? <p className={styles.success}>{success}</p> : null}
              <button className={styles.primaryButton} type="submit" disabled={isUploading || queuedFiles.length === 0}>
                {isUploading
                  ? "Uploading files"
                  : queuedFiles.length > 0
                    ? `Upload ${queuedFiles.length} selected file${queuedFiles.length === 1 ? "" : "s"}`
                    : "Upload Utility Profile"}
              </button>
              {isUtilityProfileComplete ? (
                <Link href="/migration/dashboard" className={styles.secondaryButton}>
                  View Migration Dashboard
                </Link>
              ) : null}
            </div>
          </form>

          <aside className={styles.reportPreview}>
            <span className={styles.cardLabel}>Required documents</span>
            <div className={styles.documentList}>
              {documentTypes.map((option) => {
                const documents = stored.documents.filter((item) => item.documentType === option.id);
                return (
                  <div className={styles.documentRow} key={option.id}>
                    <span>{option.label}</span>
                    <strong>
                      {documents.length > 0
                        ? `${documents.length} file${documents.length === 1 ? "" : "s"} on file`
                        : "Pending"}
                    </strong>
                  </div>
                );
              })}
            </div>
            <div className={styles.trackerBlock}>
              <MigrationProgressTracker activeIndex={isUtilityProfileComplete ? 2 : 1} />
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
