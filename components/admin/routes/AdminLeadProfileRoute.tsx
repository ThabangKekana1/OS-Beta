"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import {
  buildEoiTemplateFilename,
  buildEoiTemplateText,
  EOI_TEMPLATE_TITLE,
} from "@/lib/eoi-template";
import type {
  AdminDocumentStatus,
  AdminLead,
  AdminLeadPriority,
  AdminLeadStage,
  AdminTaskOwner,
} from "@/lib/admin-types";
import {
  downloadBlobFile,
  downloadCsvFile,
  downloadTextFile,
  sanitizeFileSegment,
} from "@/lib/download-utils";

const priorities: AdminLeadPriority[] = ["Standard", "Priority", "Executive"];
const taskOwners: AdminTaskOwner[] = ["Agent", "Client", "Ops", "Legal"];

const documentCategoryOptions = [
  "EOI",
  "Utility Bills",
  "Proposal",
  "Company Registration",
  "FICA",
  "Audited Financials",
  "Management Accounts",
  "Bank Statements",
  "Tax Clearance",
  "Term Sheet",
] as const;
type DocumentCategoryOption = (typeof documentCategoryOptions)[number];

const documentCategoryStatusMap: Record<DocumentCategoryOption, AdminDocumentStatus> = {
  EOI: "signed",
  "Utility Bills": "received",
  Proposal: "issued",
  "Company Registration": "received",
  FICA: "received",
  "Audited Financials": "received",
  "Management Accounts": "received",
  "Bank Statements": "received",
  "Tax Clearance": "received",
  "Term Sheet": "issued",
};
type WorkflowFileKey =
  | "utilityBills"
  | "proposalIssue"
  | "signedProposal"
  | "termSheetIssue"
  | "signedTermSheet";

const emptyWorkflowFiles: Record<WorkflowFileKey, File | null> = {
  utilityBills: null,
  proposalIssue: null,
  signedProposal: null,
  termSheetIssue: null,
  signedTermSheet: null,
};

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function hasEoiGenerated(lead: AdminLead) {
  return lead.documents.some(
    (doc) =>
      /expression of interest/i.test(doc.title) && !/signed/i.test(doc.title),
  );
}

function hasEoiSigned(lead: AdminLead) {
  return lead.documents.some((doc) => /signed expression of interest|signed eoi/i.test(doc.title));
}

function hasUtilityBillPack(lead: AdminLead) {
  return lead.documents.some(
    (doc) =>
      /6-month utility bill pack|utility bills|utility history|interval data/i.test(doc.title),
  );
}

function hasProposalIssued(lead: AdminLead) {
  return lead.documents.some((doc) => /proposal \(admin issued\)/i.test(doc.title));
}

function hasProposalSubmitted(lead: AdminLead) {
  return lead.documents.some((doc) => /signed proposal/i.test(doc.title));
}

function hasTermSheetIssued(lead: AdminLead) {
  return lead.documents.some((doc) => /term sheet \(admin issued\)/i.test(doc.title));
}

function hasTermSheetSubmitted(lead: AdminLead) {
  return lead.documents.some((doc) => /signed term sheet/i.test(doc.title));
}

function documentDownloadFilename(lead: AdminLead, title: string) {
  const leadSlug = sanitizeFileSegment(lead.company) || "client";
  const docSlug = sanitizeFileSegment(title) || "document";
  return `${leadSlug}-${docSlug}.txt`;
}

function buildDocumentText(lead: AdminLead, documentId: string) {
  const doc = lead.documents.find((entry) => entry.id === documentId);
  if (!doc) {
    return "";
  }

  return [
    `1OS Super Admin Documentation Export`,
    "",
    `Client: ${lead.company}`,
    `Client Profile: ${lead.clientProfileId}`,
    `Document Title: ${doc.title}`,
    `Category: ${doc.category}`,
    `File Type: ${doc.fileType}`,
    `Status: ${doc.status}`,
    `Uploaded At: ${doc.uploadedAt}`,
    `Uploaded By: ${doc.uploadedBy}`,
    `Uploader Type: ${doc.uploadedByType}`,
    `Source Account: ${doc.sourceAccount}`,
    `Source Workspace: ${doc.sourceWorkspace}`,
  ].join("\n");
}

function filenameFromDisposition(
  disposition: string | null,
  fallback: string,
) {
  if (!disposition) {
    return fallback;
  }

  const utf8Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return fallback;
    }
  }

  const basicMatch = disposition.match(/filename\s*=\s*"([^"]+)"/i)
    ?? disposition.match(/filename\s*=\s*([^;]+)/i);
  if (!basicMatch?.[1]) {
    return fallback;
  }

  return basicMatch[1].trim();
}

export function AdminLeadProfileRoute({
  leadId,
  backHref = "/admin/clients",
  backLabel = "Back to Clients",
  actorRole = "admin",
}: {
  leadId: string;
  backHref?: string;
  backLabel?: string;
  actorRole?: "admin" | "sales";
}) {
  const {
    leads,
    agents,
    leadStages,
    setActiveLeadId,
    updateLeadOwner,
    updateLeadPriority,
    updateLeadStage,
    updateLeadNextAction,
    addLeadNote,
    createLeadTask,
    toggleLeadTask,
    disqualifyLead,
    generateLeadEoi,
    recordLeadEoiSignature,
    uploadLeadUtilityBills,
    issueLeadProposal,
    submitLeadProposal,
    issueLeadTermSheet,
    submitLeadTermSheet,
    recordLeadDocumentDownload,
    uploadLeadDocument,
    completeLeadOnboarding,
  } = useAdminPortal();

  const lead = useMemo(
    () =>
      leads.find(
        (entry) => entry.id === leadId || entry.clientProfileId === leadId,
      ) ?? null,
    [leadId, leads],
  );

  const [nextActionDraft, setNextActionDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [taskTitleDraft, setTaskTitleDraft] = useState("");
  const [taskDueDraft, setTaskDueDraft] = useState("Tomorrow");
  const [taskOwnerDraft, setTaskOwnerDraft] = useState<AdminTaskOwner>("Agent");
  const [disqualifyReason, setDisqualifyReason] = useState("");
  const [copiedSigningLink, setCopiedSigningLink] = useState(false);
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategoryOption>("EOI");
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isWorkflowUploading, setIsWorkflowUploading] = useState(false);
  const [workflowFiles, setWorkflowFiles] =
    useState<Record<WorkflowFileKey, File | null>>(emptyWorkflowFiles);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [appOrigin, setAppOrigin] = useState("");
  const eoiSigningPath = lead?.eoiSigningToken ? `/eoi/${lead.eoiSigningToken}` : null;
  const eoiSigningUrl = eoiSigningPath ? `${appOrigin}${eoiSigningPath}` : null;
  const isAdminActor = actorRole === "admin";
  const isSalesActor = actorRole === "sales";

  const handleDownloadSingleDocument = async (documentId: string) => {
    if (!lead) {
      return;
    }

    const selected = lead.documents.find((entry) => entry.id === documentId);
    if (!selected) {
      return;
    }

    recordLeadDocumentDownload(
      lead.id,
      selected.title,
      isAdminActor ? "Admin Team" : "Sales Team",
    );

    try {
      const response = await fetch(
        `/api/admin/leads/${lead.id}/documents?documentId=${encodeURIComponent(documentId)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        let errorMessage = `Unable to download ${selected.title}.`;
        try {
          const payload = (await response.json()) as { error?: string };
          if (typeof payload.error === "string" && payload.error.trim().length > 0) {
            errorMessage = payload.error;
          }
        } catch {
          // Keep default message when server does not return JSON.
        }

        setWorkflowNotice(errorMessage);
        return;
      }

      const blob = await response.blob();
      const fallbackFilename =
        selected.fileName?.trim() || documentDownloadFilename(lead, selected.title);
      const filename = filenameFromDisposition(
        response.headers.get("content-disposition"),
        fallbackFilename,
      );
      downloadBlobFile(filename, blob);
    } catch {
      setWorkflowNotice(`Unable to download ${selected.title}.`);
    }
  };

  const handleDownloadAllDocuments = () => {
    if (!lead) {
      return;
    }

    const bundle = lead.documents
      .map((doc, index) => {
        return [
          `Document ${index + 1}: ${doc.title}`,
          buildDocumentText(lead, doc.id),
        ].join("\n");
      })
      .join("\n\n------------------------------\n\n");

    downloadTextFile(
      `${sanitizeFileSegment(lead.company) || "client"}-documentation-bundle.txt`,
      bundle || "No documentation is attached to this client profile.",
    );
  };

  const handleDownloadDocumentManifest = () => {
    if (!lead) {
      return;
    }

    downloadCsvFile(
      `${sanitizeFileSegment(lead.company) || "client"}-document-manifest.csv`,
      [
        [
          "title",
          "category",
          "fileType",
          "status",
          "uploadedAt",
          "uploadedBy",
          "uploadedByType",
          "sourceAccount",
          "sourceWorkspace",
        ],
        ...lead.documents.map((doc) => [
          doc.title,
          doc.category,
          doc.fileType,
          doc.status,
          doc.uploadedAt,
          doc.uploadedBy,
          doc.uploadedByType,
          doc.sourceAccount,
          doc.sourceWorkspace,
        ]),
      ],
    );
  };

  const addUploadFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) {
      return;
    }
    const incomingArray = Array.from(incoming);
    if (incomingArray.length === 0) {
      return;
    }
    setUploadError(null);
    setUploadFiles((current) => {
      const next = [...current];
      for (const file of incomingArray) {
        if (!next.some((existing) => existing.name === file.name && existing.size === file.size)) {
          next.push(file);
        }
      }
      return next;
    });
  };

  const removeUploadFile = (index: number) => {
    setUploadFiles((current) => current.filter((_, i) => i !== index));
  };

  const handleUploadDocument = async () => {
    if (!lead || uploadFiles.length === 0) {
      setUploadError("Drop or select at least one file before uploading.");
      return;
    }

    setUploadError(null);
    setIsUploadingDocument(true);
    const status = documentCategoryStatusMap[uploadCategory];
    const labelPlural = uploadFiles.length === 1 ? "file" : "files";
    let failed = 0;

    for (const file of uploadFiles) {
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const title = `${uploadCategory} — ${baseName}`;
      const uploaded = await uploadLeadDocument(lead.id, {
        file,
        title,
        category: uploadCategory,
        status,
      });
      if (!uploaded) {
        failed += 1;
      }
    }

    setIsUploadingDocument(false);

    if (failed > 0) {
      setUploadError(`Unable to upload ${failed} of ${uploadFiles.length} ${labelPlural}.`);
      return;
    }

    setWorkflowNotice(
      `${uploadFiles.length} ${labelPlural} uploaded under ${uploadCategory}.`,
    );
    setUploadFiles([]);
  };

  const setWorkflowFile = (key: WorkflowFileKey, file: File | null) => {
    setWorkflowFiles((current) => ({
      ...current,
      [key]: file,
    }));
  };

  const uploadGeneratedEoiDocument = async () => {
    if (!lead) {
      return false;
    }

    setIsWorkflowUploading(true);
    const file = new File(
      [buildEoiTemplateText(lead)],
      buildEoiTemplateFilename(lead.company),
      { type: "text/plain" },
    );
    const uploaded = await uploadLeadDocument(lead.id, {
      file,
      title: EOI_TEMPLATE_TITLE,
      category: "Onboarding",
      status: "issued",
    });
    setIsWorkflowUploading(false);

    if (!uploaded) {
      setWorkflowNotice("Unable to generate the EOI file. Check storage configuration and try again.");
      return false;
    }

    generateLeadEoi(lead.id);
    return true;
  };

  const handleGenerateEoi = async () => {
    const uploaded = await uploadGeneratedEoiDocument();
    if (uploaded) {
      setWorkflowNotice("EOI generated from the template and signing link is active.");
    }
  };

  const handleSubmitSalesEoi = async () => {
    if (!lead) {
      return;
    }

    if (!hasEoiGenerated(lead)) {
      const uploaded = await uploadGeneratedEoiDocument();
      if (!uploaded) {
        return;
      }
    }

    recordLeadEoiSignature(lead.id);
    setWorkflowNotice("EOI submitted for this client.");
  };

  const uploadWorkflowDocument = async ({
    key,
    title,
    category,
    status,
    missingMessage,
    successMessage,
    afterUpload,
  }: {
    key: WorkflowFileKey;
    title: string;
    category: string;
    status: AdminDocumentStatus;
    missingMessage: string;
    successMessage: string;
    afterUpload: () => void;
  }) => {
    if (!lead) {
      return;
    }

    const file = workflowFiles[key];
    if (!file) {
      setWorkflowNotice(missingMessage);
      return;
    }

    setIsWorkflowUploading(true);
    const uploaded = await uploadLeadDocument(lead.id, {
      file,
      title,
      category,
      status,
    });
    setIsWorkflowUploading(false);

    if (!uploaded) {
      setWorkflowNotice(`Unable to upload ${title}. Check the file and try again.`);
      return;
    }

    afterUpload();
    setWorkflowFile(key, null);
    setWorkflowNotice(successMessage);
  };

  const handleCopySigningLink = async () => {
    if (!eoiSigningUrl || typeof window === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(eoiSigningUrl);
      setCopiedSigningLink(true);
      window.setTimeout(() => setCopiedSigningLink(false), 2000);
    } catch {
      setCopiedSigningLink(false);
    }
  };

  useEffect(() => {
    setAppOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!lead) {
      return;
    }

    setActiveLeadId(lead.id);
    setNextActionDraft(lead.nextAction);
    setNoteDraft("");
    setTaskTitleDraft("");
    setTaskDueDraft("Tomorrow");
    setTaskOwnerDraft("Agent");
    setDisqualifyReason(lead.disqualification?.reason ?? "");
    setWorkflowNotice(null);
    setUploadError(null);
    setWorkflowFiles(emptyWorkflowFiles);
    // This reset is intentionally scoped to navigation between lead profiles.
    // Document uploads update the same lead object and must not clear the success notice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id, setActiveLeadId]);

  if (!lead) {
    return (
      <div className="flex flex-col gap-4">
        <section className="app-surface rounded-[1.6rem] px-5 py-5 lg:px-6 lg:py-6">
          <AdminHeader
            eyebrow="Client Profile"
            title="Profile not found."
            description="The selected client profile does not exist or was removed."
            actions={
              <Link
                href={backHref}
                className="rounded-[0.8rem] border border-white/16 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/78 transition hover:border-white/26 hover:text-white"
              >
                {backLabel}
              </Link>
            }
          />
        </section>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 lg:gap-5">
      <section className="app-surface rounded-[1.6rem] px-5 py-5 lg:px-6 lg:py-6">
        <AdminHeader
          eyebrow="Client Profile"
          title={`${lead.company} • ${lead.clientProfileId}`}
          description="Dedicated onboarding profile with stage control, file vault, and sales actions."
          actions={
            <Link
              href={backHref}
              className="rounded-[0.8rem] border border-white/16 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/78 transition hover:border-white/26 hover:text-white"
            >
              {backLabel}
            </Link>
          }
        />
      </section>

      <section className="app-surface rounded-[1.4rem] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="line-label">Profile Overview</p>
            <h2 className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white">{lead.company}</h2>
            <p className="mt-1 text-sm text-white/52">
              {lead.userProfile.fullName} • Profile No: {lead.clientProfileId} • {lead.userProfile.phone}
            </p>
            <p className="mt-1 text-xs text-white/42">
              Position: {lead.contactPosition ?? lead.userProfile.role}
            </p>
            {lead.registrationSource ? (
              <p className="mt-1 text-xs text-white/42">
                Registered via {lead.registrationSource.profileName}&apos;s unique {lead.registrationSource.profileRole} link
                {" "}({lead.registrationSource.channel === "public_link" ? "client-submitted" : "dashboard"})
              </p>
            ) : null}
            <p className="mt-1 text-xs text-white/42">Reg No: {lead.businessRegistrationNumber}</p>
            <p className="mt-1 text-xs text-white/42">{lead.physicalAddress}, {lead.city}, {lead.province}</p>
            <p className="mt-1 text-xs text-white/42">Industry: {lead.industry}</p>
            <p className="mt-1 text-xs text-white/42">
              Monthly Electricity Spend: {toCurrency(lead.monthlyElectricitySpendEstimateZar)}
            </p>
            <p className="mt-1 text-xs text-white/42">
              Registered: {lead.isBusinessRegistered ? "Yes" : "No"} • Operational: {lead.isBusinessOperational ? "Yes" : "No"} • 6-Month Utility Bill: {lead.hasSixMonthUtilityBill ? "Yes" : "No"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdminBadge label={lead.stage} />
            <AdminBadge label={lead.priority} tone={lead.priority === "Standard" ? "muted" : "neutral"} />
            {lead.disqualification ? <AdminBadge label="Disqualified" tone="bright" /> : null}
            {lead.userProfile.email ? (
              <Link
                href={`/${actorRole}/inbox?lead=${encodeURIComponent(lead.id)}&to=${encodeURIComponent(lead.userProfile.email)}&subject=${encodeURIComponent(`Foundation-1 — ${lead.company}`)}`}
                className="rounded-[0.7rem] border border-white/16 px-2.5 py-1.5 text-[0.64rem] uppercase tracking-[0.2em] text-white/82 transition hover:border-white/30 hover:text-white"
              >
                Email client
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="app-surface rounded-[1.4rem] p-4">
        <p className="line-label">Onboarding Workflow</p>
        <p className="mt-2 text-sm text-white/60">
          Sequence: Client signs EOI via signing link → Admin uploads proposal → Admin uploads term sheet → Mark onboarding complete.
        </p>
        {workflowNotice ? (
          <p className="mt-2 text-sm text-white/72">{workflowNotice}</p>
        ) : null}
        <div className="mt-3 rounded-[0.9rem] border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-white/45">
            Client EOI Signing Link
          </p>
          <p className="mt-2 text-sm text-white/70">
            {eoiSigningUrl ?? "Generate EOI to create the digital signing link."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {eoiSigningUrl ? (
              <Link
                href={eoiSigningUrl}
                target="_blank"
                className="rounded-[0.7rem] border border-white/14 px-2.5 py-1.5 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white"
              >
                Open Client Signing Page
              </Link>
            ) : null}
            <button
              type="button"
              onClick={handleCopySigningLink}
              disabled={!eoiSigningPath}
              className="rounded-[0.7rem] border border-white/14 px-2.5 py-1.5 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {copiedSigningLink ? "Copied" : "Copy Link"}
            </button>
          </div>
          <p className="mt-2 text-xs text-white/48">
            {lead.eoiSignedAt
              ? `Signed by ${lead.eoiSignedBy ?? "Client"} • Terms accepted • ${new Date(lead.eoiSignedAt).toLocaleString("en-ZA")}`
              : "Awaiting client digital signature and terms acceptance."}
          </p>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {isSalesActor ? (
            <div className="md:col-span-2 rounded-[0.9rem] border border-white/10 bg-black/30 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                Document Vault
              </p>
              <p className="mt-1 text-xs text-white/52">
                Files uploaded by admin for this client. Download anytime.
              </p>
              {(() => {
                const adminDocs = lead.documents.filter(
                  (doc) => doc.uploadedByType === "Admin Team",
                );
                if (adminDocs.length === 0) {
                  return (
                    <p className="mt-3 text-sm text-white/56">
                      No documents uploaded yet by admin.
                    </p>
                  );
                }
                return (
                  <ul className="mt-3 flex flex-col gap-2">
                    {adminDocs.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[0.7rem] border border-white/8 bg-white/[0.03] px-3 py-2"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm text-white/82">{doc.title}</span>
                          <span className="text-[0.62rem] uppercase tracking-[0.18em] text-white/42">
                            {doc.category} • {doc.fileType} • {doc.uploadedAt}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadSingleDocument(doc.id)}
                          className="rounded-[0.65rem] border border-white/14 px-2.5 py-1.5 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white"
                        >
                          Download
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
          ) : null}

          {isAdminActor ? (
            <>
              <button
                type="button"
                onClick={handleGenerateEoi}
                disabled={isWorkflowUploading || lead.stage === "Disqualified" || lead.stage === "Onboarding Complete"}
                className="rounded-[0.8rem] border border-white/12 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/72 transition hover:border-white/24 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isWorkflowUploading ? "Working" : "Generate EOI"}
              </button>
              <div className="rounded-[0.8rem] border border-white/10 bg-black/20 p-2">
                <input
                  aria-label="Proposal file"
                  type="file"
                  onChange={(event) => setWorkflowFile("proposalIssue", event.target.files?.[0] ?? null)}
                  className="mb-2 max-w-full text-xs text-white/56 file:mr-2 file:rounded-[0.65rem] file:border-0 file:bg-white file:px-2 file:py-1.5 file:text-xs file:text-black"
                />
                <button
                  type="button"
                  onClick={() =>
                    uploadWorkflowDocument({
                      key: "proposalIssue",
                      title: "Proposal (Admin Issued)",
                      category: "Commercial",
                      status: "issued",
                      missingMessage: "Choose the proposal file before uploading.",
                      successMessage: "Proposal uploaded for sales download.",
                      afterUpload: () => issueLeadProposal(lead.id),
                    })
                  }
                  disabled={!workflowFiles.proposalIssue || isWorkflowUploading || lead.stage === "Disqualified" || lead.stage === "Onboarding Complete"}
                  className="w-full rounded-[0.8rem] border border-white/12 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/72 transition hover:border-white/24 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Upload Proposal
                </button>
              </div>
              <div className="rounded-[0.8rem] border border-white/10 bg-black/20 p-2">
                <input
                  aria-label="Term sheet file"
                  type="file"
                  onChange={(event) => setWorkflowFile("termSheetIssue", event.target.files?.[0] ?? null)}
                  className="mb-2 max-w-full text-xs text-white/56 file:mr-2 file:rounded-[0.65rem] file:border-0 file:bg-white file:px-2 file:py-1.5 file:text-xs file:text-black"
                />
                <button
                  type="button"
                  onClick={() =>
                    uploadWorkflowDocument({
                      key: "termSheetIssue",
                      title: "Term Sheet (Admin Issued)",
                      category: "Legal",
                      status: "issued",
                      missingMessage: "Choose the term sheet file before uploading.",
                      successMessage: "Term sheet uploaded for sales download.",
                      afterUpload: () => issueLeadTermSheet(lead.id),
                    })
                  }
                  disabled={!workflowFiles.termSheetIssue || isWorkflowUploading || !hasProposalIssued(lead) || lead.stage === "Disqualified" || lead.stage === "Onboarding Complete"}
                  className="w-full rounded-[0.8rem] border border-white/12 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/72 transition hover:border-white/24 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Upload Term Sheet
                </button>
              </div>
            </>
          ) : null}
        </div>
        {!hasEoiSigned(lead) && isSalesActor ? (
          <p className="mt-2 text-xs text-white/48">
            Utility bill submission is unlocked once EOI is submitted.
          </p>
        ) : null}
        {isAdminActor ? (
          <button
            type="button"
            onClick={() => completeLeadOnboarding(lead.id)}
            disabled={!hasEoiSigned(lead) || !hasProposalIssued(lead) || !hasTermSheetIssued(lead) || lead.stage === "Disqualified" || lead.stage === "Onboarding Complete"}
            className="mt-3 rounded-[0.8rem] border border-white/16 bg-white/[0.08] px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/84 transition hover:border-white/28 hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Mark Onboarding Complete
          </button>
        ) : (
          <p className="mt-3 text-xs text-white/48">
            Deal closure is completed by admin once all signed documents are submitted.
          </p>
        )}
      </section>

      {isAdminActor ? (
        <section className="grid gap-4 xl:grid-cols-2">
        <div className="app-surface rounded-[1.4rem] p-4">
          <p className="line-label">Assignment + Stage</p>
          <div className="mt-3 grid gap-2">
            <select
              value={lead.ownerId}
              onChange={(event) => updateLeadOwner(lead.id, event.target.value)}
              className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <select
              value={lead.stage}
              onChange={(event) => updateLeadStage(lead.id, event.target.value as AdminLeadStage)}
              className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
            >
              {leadStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
            <select
              value={lead.priority}
              onChange={(event) => updateLeadPriority(lead.id, event.target.value as AdminLeadPriority)}
              className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
            >
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="app-surface rounded-[1.4rem] p-4">
          <p className="line-label">Disqualify Lead</p>
          <textarea
            rows={3}
            value={disqualifyReason}
            onChange={(event) => setDisqualifyReason(event.target.value)}
            placeholder="Reason for disqualification"
            className="admin-input mt-3 w-full rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => disqualifyLead(lead.id, disqualifyReason, "Admin User")}
            disabled={disqualifyReason.trim().length === 0}
            className="mt-2 rounded-[0.8rem] border border-white/16 bg-white/[0.06] px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/82 transition hover:border-white/26 hover:bg-white/[0.12]"
          >
            Disqualify Lead
          </button>
        </div>
        </section>
      ) : null}

      <section className="app-surface rounded-[1.4rem] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="line-label">Client File Vault (Dedicated)</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadAllDocuments}
              className="rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/72 transition hover:border-white/26 hover:text-white"
            >
              Download All Documentation
            </button>
            <button
              type="button"
              onClick={handleDownloadDocumentManifest}
              className="rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/72 transition hover:border-white/26 hover:text-white"
            >
              Download Manifest
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm text-white/60">
          All files below are attached only to client profile {lead.clientProfileId}.
        </p>
        <div className="mt-4 rounded-[0.9rem] border border-white/10 bg-black/30 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-white/45">
            Upload Document
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <label className="flex flex-col gap-1">
              <span className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Document type
              </span>
              <select
                value={uploadCategory}
                onChange={(event) =>
                  setUploadCategory(event.target.value as DocumentCategoryOption)
                }
                className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
              >
                {documentCategoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragOver(false);
              addUploadFiles(event.dataTransfer.files);
            }}
            className={`mt-3 flex flex-col items-center justify-center gap-2 rounded-[0.9rem] border-2 border-dashed px-4 py-6 text-center transition ${
              isDragOver
                ? "border-white/45 bg-white/[0.06]"
                : "border-white/15 bg-black/30"
            }`}
          >
            <p className="text-sm text-white/72">
              Drag &amp; drop {uploadCategory.toLowerCase()} file(s) here
            </p>
            <p className="text-xs text-white/44">or use the upload button below</p>
            <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-[0.7rem] border border-white/16 bg-white/[0.08] px-3 py-1.5 text-[0.64rem] uppercase tracking-[0.16em] text-white/82 hover:border-white/28 hover:text-white">
              <input
                type="file"
                multiple
                onChange={(event) => {
                  addUploadFiles(event.target.files);
                  event.target.value = "";
                }}
                className="hidden"
              />
              Choose files
            </label>
          </div>

          {uploadFiles.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {uploadFiles.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-[0.7rem] border border-white/10 bg-black/35 px-3 py-1.5 text-sm text-white/78"
                >
                  <span className="truncate">
                    {file.name}{" "}
                    <span className="text-xs text-white/44">
                      ({Math.max(1, Math.round(file.size / 1024))} KB)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeUploadFile(index)}
                    className="text-[0.62rem] uppercase tracking-[0.16em] text-white/52 hover:text-rose-200"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-white/44">
              {uploadFiles.length === 0
                ? "Multiple files can be queued at once."
                : `${uploadFiles.length} file${uploadFiles.length === 1 ? "" : "s"} queued under "${uploadCategory}".`}
            </p>
            <button
              type="button"
              onClick={handleUploadDocument}
              disabled={uploadFiles.length === 0 || isUploadingDocument}
              className="rounded-[0.75rem] border border-white/14 bg-white/[0.08] px-4 py-2 text-[0.64rem] uppercase tracking-[0.16em] text-white/86 transition hover:border-white/26 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isUploadingDocument
                ? "Uploading…"
                : `Upload${uploadFiles.length > 0 ? ` ${uploadFiles.length}` : ""}`}
            </button>
          </div>

          {uploadError ? <p className="mt-2 text-xs text-rose-200">{uploadError}</p> : null}
        </div>
        <div className="mt-3 overflow-auto rounded-[0.8rem] border border-white/10">
          <table className="min-w-[900px] w-full text-left">
            <thead className="bg-black/70">
              <tr className="text-[0.64rem] uppercase tracking-[0.18em] text-white/50">
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Uploaded By</th>
                <th className="px-3 py-2">Uploader Type</th>
                <th className="px-3 py-2">Source Account</th>
                <th className="px-3 py-2">Workspace</th>
                <th className="px-3 py-2">Download</th>
              </tr>
            </thead>
            <tbody>
              {lead.documents.map((doc) => (
                <tr key={doc.id} className="border-t border-white/8 bg-black/35 text-sm">
                  <td className="px-3 py-2 text-white/74">
                    {doc.title} <span className="text-xs text-white/42">({doc.fileType})</span>
                  </td>
                  <td className="px-3 py-2 text-white/64">{doc.status}</td>
                  <td className="px-3 py-2 text-white/64">{doc.uploadedBy}</td>
                  <td className="px-3 py-2 text-white/64">{doc.uploadedByType}</td>
                  <td className="px-3 py-2 text-white/64">{doc.sourceAccount}</td>
                  <td className="px-3 py-2 text-white/64">{doc.sourceWorkspace}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadSingleDocument(doc.id)}
                      className="rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/72 transition hover:border-white/26 hover:text-white"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="app-surface rounded-[1.4rem] p-4">
          <p className="line-label">Next Action + Notes</p>
          <textarea
            rows={2}
            value={nextActionDraft}
            onChange={(event) => setNextActionDraft(event.target.value)}
            className="admin-input mt-3 w-full rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => updateLeadNextAction(lead.id, nextActionDraft)}
            className="mt-2 rounded-[0.8rem] border border-white/12 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/66 transition hover:border-white/24 hover:text-white"
          >
            Save Next Action
          </button>
          <textarea
            rows={2}
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="Internal note"
            className="admin-input mt-3 w-full rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              addLeadNote(lead.id, noteDraft, "Admin User");
              setNoteDraft("");
            }}
            className="mt-2 rounded-[0.8rem] border border-white/12 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/66 transition hover:border-white/24 hover:text-white"
          >
            Add Note
          </button>
        </div>

        <div className="app-surface rounded-[1.4rem] p-4">
          <p className="line-label">Tasks</p>
          <input
            value={taskTitleDraft}
            onChange={(event) => setTaskTitleDraft(event.target.value)}
            placeholder="Task title"
            className="admin-input mt-3 w-full rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select
              value={taskOwnerDraft}
              onChange={(event) => setTaskOwnerDraft(event.target.value as AdminTaskOwner)}
              className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
            >
              {taskOwners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
            <input
              value={taskDueDraft}
              onChange={(event) => setTaskDueDraft(event.target.value)}
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              createLeadTask(lead.id, {
                title: taskTitleDraft,
                owner: taskOwnerDraft,
                dueLabel: taskDueDraft,
              });
              setTaskTitleDraft("");
            }}
            className="mt-2 rounded-[0.8rem] border border-white/12 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/66 transition hover:border-white/24 hover:text-white"
          >
            Add Task
          </button>
          <div className="mt-3 flex max-h-44 flex-col gap-2 overflow-y-auto pr-1">
            {lead.tasks.map((task) => (
              <label
                key={task.id}
                className="flex items-center gap-3 rounded-[0.8rem] border border-white/10 bg-black/35 px-3 py-2 text-sm text-white/72"
              >
                <input
                  type="checkbox"
                  checked={task.status === "done"}
                  onChange={() => toggleLeadTask(lead.id, task.id)}
                />
                <span className={task.status === "done" ? "line-through text-white/38" : ""}>
                  {task.title}
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
