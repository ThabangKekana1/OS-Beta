"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useStoredMigrationAssessment,
  writeStoredMigrationAssessment,
  type MigrationDocumentRecord,
  type MigrationDocumentType,
  type StoredMigrationAssessment,
} from "@/components/migration/MigrationState";
import { MigrationProgressTracker } from "@/components/migration/MigrationProgressTracker";
import styles from "@/components/migration/migration.module.css";

const documentTypes: Array<{ id: MigrationDocumentType; label: string }> = [
  { id: "expression_of_interest", label: "Expression of Interest" },
  { id: "utility_bill", label: "Six-month utility bill" },
];

type UploadResponse = {
  ok?: boolean;
  error?: string;
  document?: MigrationDocumentRecord;
};

export function UtilityUpload() {
  const externalStored = useStoredMigrationAssessment();
  const [localStored, setLocalStored] = useState<StoredMigrationAssessment | null>(null);
  const [documentType, setDocumentType] = useState<MigrationDocumentType>("utility_bill");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const stored = localStored ?? externalStored;

  const uploadedTypes = useMemo(() => {
    return new Set(stored?.documents.map((document) => document.documentType) ?? []);
  }, [stored]);
  const isUtilityProfileComplete =
    uploadedTypes.has("expression_of_interest") && uploadedTypes.has("utility_bill");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stored?.registration) return;
    if (!file) {
      setError("Choose a file for the Utility Profile.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("assessmentId", stored.registration.assessmentId);
      formData.append("documentType", documentType);
      formData.append("file", file);

      const response = await fetch("/api/migration/documents", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as UploadResponse;

      if (!response.ok || !payload.ok || !payload.document) {
        setError(payload.error ?? "Unable to receive this Utility Profile file.");
        return;
      }

      const existing = stored.documents.filter(
        (document) => document.documentType !== payload.document?.documentType,
      );
      const nextDocuments = [payload.document, ...existing];
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
      setFile(null);
      setSuccess("Utility Profile Received");
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
            <h1 className={styles.sectionTitle}>Complete business details first.</h1>
            <p className={styles.sectionCopy}>
              Your report needs to be connected to a business profile before files can be received.
            </p>
            <div className={styles.buttonRow}>
              <Link href="/migration/register" className={styles.primaryButton}>
                Register
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
              Upload your signed Expression of Interest and six months of utility bills so
              Foundation-1 can prepare the formal Migration Proposal.
            </p>
          </div>
        </div>

        <div className={`${styles.panel} ${styles.split}`}>
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.uploadZone}>
              <label className={styles.label}>
                Profile file type
                <select
                  className={styles.select}
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value as MigrationDocumentType)}
                >
                  {documentTypes.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.dropBox}>
                <input
                  className={styles.fileInput}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,application/pdf,image/png,image/jpeg,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <p className={styles.sectionCopy}>Accepted file types: PDF, PNG, JPG, XLSX, CSV.</p>
              {error ? <p className={styles.error}>{error}</p> : null}
              {success ? <p className={styles.success}>{success}</p> : null}
              <button className={styles.primaryButton} type="submit" disabled={isUploading}>
                {isUploading ? "Receiving" : "Upload Utility Profile"}
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
                const document = stored.documents.find((item) => item.documentType === option.id);
                return (
                  <div className={styles.documentRow} key={option.id}>
                    <span>{option.label}</span>
                    <strong>{document ? document.fileName : "Pending"}</strong>
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
