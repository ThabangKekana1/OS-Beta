"use client";

/* eslint-disable @next/next/no-img-element -- Email previews use raw image markup that mirrors sent email HTML. */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmailSignaturePreviewText } from "@/components/admin/EmailSignaturePreviewText";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { getAdminSenderOptions } from "@/lib/admin-mailboxes";
import {
  buildEoiTemplateFilename,
  buildEoiTemplateText,
  EOI_TEMPLATE_TITLE,
} from "@/lib/eoi-template";
import { isValidSouthAfricanCompanyRegistration } from "@/lib/company-registration";
import {
  buildEmailHtmlWithFoundationBanner,
  buildFoundationOutreachBody,
  FOUNDATION_BROCHURE_FILENAME,
  FOUNDATION_BROCHURE_PATH,
  FOUNDATION_EMAIL_BANNER_PATH,
  FOUNDATION_OUTREACH_SUBJECT,
} from "@/lib/outreach-email-template";
import {
  splitSignatureForBanner,
  systemSignatureTextForSender,
} from "@/lib/email-signature-copy";
import type { EmailMessage, EmailThread } from "@/lib/email-threads";
import type {
  AdminDocumentStatus,
  AdminLead,
  AdminLeadContactStatus,
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
import {
  documentUploadLinkIdForLead,
  documentUploadLinkPath,
  migrationLinkIdForLead,
  migrationLinkPath,
  publicMigrationLinkOrigin,
  proposalDownloadLinkIdForLead,
  proposalDownloadLinkPath,
  registrationLinkIdForLead,
  registrationLinkPath,
} from "@/lib/registration-links";

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

type ComposeAttachment = {
  filename: string;
  content: string;
  contentType: string;
  size: number;
  contentId?: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function hasEoiSigned(lead: AdminLead) {
  return lead.documents.some((doc) => /signed expression of interest|signed eoi/i.test(doc.title));
}

function hasProposalIssued(lead: AdminLead) {
  return lead.documents.some((doc) => /proposal \(admin issued\)/i.test(doc.title));
}

function hasTermSheetIssued(lead: AdminLead) {
  return lead.documents.some((doc) => /term sheet \(admin issued\)/i.test(doc.title));
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

function buildOutreachSubject() {
  return FOUNDATION_OUTREACH_SUBJECT;
}

function buildOutreachBody(lead: AdminLead, migrationEstimateUrl?: string | null) {
  return buildFoundationOutreachBody({
    contactName: lead.contactName || lead.contactFirstName,
    company: lead.company,
    migrationEstimateUrl,
  });
}

async function assetToComposeAttachment(
  path: string,
  filename: string,
  contentType: string,
  contentId?: string,
): Promise<ComposeAttachment> {
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Could not load ${filename}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(index, index + chunkSize)));
  }
  return {
    filename,
    content: btoa(binary),
    contentType,
    size: bytes.byteLength,
    contentId,
  };
}

async function buildFoundationOutreachAttachments(): Promise<ComposeAttachment[]> {
  const brochureAttachment = await assetToComposeAttachment(
    FOUNDATION_BROCHURE_PATH,
    FOUNDATION_BROCHURE_FILENAME,
    "application/pdf",
  );
  return [brochureAttachment];
}

function withoutFoundationOutreachAttachments(attachments: ComposeAttachment[]) {
  return attachments.filter(
    (attachment) => attachment.filename !== FOUNDATION_BROCHURE_FILENAME,
  );
}

function buildProposalSubject(lead: AdminLead) {
  return `Proposal - ${lead.company}`;
}

function buildProposalBody(lead: AdminLead) {
  return [
    `Hi ${lead.contactFirstName || lead.contactName},`,
    "",
    "Please find the proposal attached for your review.",
    "",
    "Once reviewed, reply to this email with any questions or confirmation on the next step.",
    "",
    "Kind regards,",
  ].join("\n");
}

function registrationMissingFields(lead: AdminLead) {
  const missing: string[] = [];
  if (!lead.company.trim()) missing.push("company name");
  if (!isValidSouthAfricanCompanyRegistration(lead.businessRegistrationNumber)) {
    missing.push("valid company registration number");
  }
  if (!lead.industry.trim()) missing.push("industry");
  if (!(lead.contactFirstName ?? "").trim()) missing.push("contact first name");
  if (!(lead.contactSurname ?? "").trim()) missing.push("contact surname");
  if (!(lead.contactPosition ?? lead.userProfile.role).trim()) missing.push("contact position");
  if (!lead.userProfile.email.trim()) missing.push("contact email");
  if (!lead.userProfile.phone.trim()) missing.push("contact phone");
  if (!lead.physicalAddress.trim()) missing.push("physical address");
  if (!lead.city.trim()) missing.push("city");
  if (!lead.province.trim()) missing.push("province");
  if (lead.monthlyElectricitySpendEstimateZar < 10_000) {
    missing.push("monthly electricity spend");
  }
  if (!lead.isBusinessRegistered) missing.push("CIPC registered");
  if (!lead.isBusinessOperational) missing.push("operational business");
  return missing;
}

function fileToComposeAttachment(file: File): Promise<ComposeAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve({
        filename: file.name,
        content: result.includes(",") ? result.split(",").pop() ?? "" : result,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
  backHref = "/admin/leads",
  backLabel = "Back to Leads",
  actorRole = "admin",
}: {
  leadId: string;
  backHref?: string;
  backLabel?: string;
  actorRole?: "admin" | "sales" | "partner";
}) {
  const {
    leads,
    agents,
    leadStages,
    contactStatuses,
    setActiveLeadId,
    updateLeadOwner,
    updateLeadPriority,
    updateLeadContactStatus,
    updateLeadStage,
    updateLeadNextAction,
    updateLeadProfile,
    addLeadNote,
    createLeadTask,
    toggleLeadTask,
    disqualifyLead,
    generateLeadEoi,
    issueLeadProposal,
    issueLeadTermSheet,
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
  const activeLeadId = lead?.id ?? null;

  const [nextActionDraft, setNextActionDraft] = useState("");
  const [profileDraft, setProfileDraft] = useState({
    company: "",
    businessRegistrationNumber: "",
    industry: "",
    contactFirstName: "",
    contactSurname: "",
    contactPosition: "",
    contactEmail: "",
    contactNumber: "",
    monthlyElectricitySpendEstimateZar: "",
    isBusinessRegistered: false,
    isBusinessOperational: false,
    hasSixMonthUtilityBill: false,
    physicalAddress: "",
    city: "",
    province: "",
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [taskTitleDraft, setTaskTitleDraft] = useState("");
  const [taskDueDraft, setTaskDueDraft] = useState("Tomorrow");
  const [taskOwnerDraft, setTaskOwnerDraft] = useState<AdminTaskOwner>("Agent");
  const [disqualifyReason, setDisqualifyReason] = useState("");
  const [copiedSigningLink, setCopiedSigningLink] = useState(false);
  const [copiedRegistrationLink, setCopiedRegistrationLink] = useState(false);
  const [copiedMigrationLink, setCopiedMigrationLink] = useState(false);
  const [copiedDocumentUploadLink, setCopiedDocumentUploadLink] = useState(false);
  const [copiedProposalDownloadLink, setCopiedProposalDownloadLink] = useState(false);
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
  const senderOptions = useMemo(() => getAdminSenderOptions(), []);
  const [emailThreads, setEmailThreads] = useState<EmailThread[]>([]);
  const [selectedEmailThreadId, setSelectedEmailThreadId] = useState<string | null>(null);
  const [emailMessages, setEmailMessages] = useState<EmailMessage[]>([]);
  const [emailFrom, setEmailFrom] = useState(senderOptions[0]?.value ?? "");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailAttachments, setEmailAttachments] = useState<ComposeAttachment[]>([]);
  const [emailOutreachActive, setEmailOutreachActive] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const selectedEmailSenderOption = useMemo(
    () => senderOptions.find((option) => option.value === emailFrom) ?? senderOptions[0] ?? null,
    [emailFrom, senderOptions],
  );
  const systemSignaturePreview = useMemo(() => {
    const signatureText = systemSignatureTextForSender({
      ownerEmail: selectedEmailSenderOption?.email,
      ownerRole: actorRole,
    });
    return signatureText ? splitSignatureForBanner(signatureText) : null;
  }, [actorRole, selectedEmailSenderOption?.email]);
  const eoiSigningPath = lead?.eoiSigningToken ? `/eoi/${lead.eoiSigningToken}` : null;
  const eoiSigningUrl = eoiSigningPath ? `${appOrigin}${eoiSigningPath}` : null;
  const registrationLinkPathForLead = lead
    ? registrationLinkPath(registrationLinkIdForLead({
        leadId: lead.id,
        clientProfileId: lead.clientProfileId,
        email: lead.userProfile.email,
      }))
    : null;
  const registrationLinkUrl = registrationLinkPathForLead ? `${appOrigin}${registrationLinkPathForLead}` : null;
  const migrationLinkPathForLead = lead
    ? migrationLinkPath(
        migrationLinkIdForLead({
          leadId: lead.id,
          clientProfileId: lead.clientProfileId,
          email: lead.userProfile.email,
        }),
        lead.company,
      )
    : null;
  const migrationLinkOrigin = publicMigrationLinkOrigin(appOrigin);
  const migrationLinkUrl = migrationLinkPathForLead ? `${migrationLinkOrigin}${migrationLinkPathForLead}` : null;
  const documentUploadPathForLead = lead
    ? documentUploadLinkPath(documentUploadLinkIdForLead({
        leadId: lead.id,
        clientProfileId: lead.clientProfileId,
        email: lead.userProfile.email,
      }))
    : null;
  const documentUploadUrl = documentUploadPathForLead ? `${appOrigin}${documentUploadPathForLead}` : null;
  const proposalDownloadPathForLead = lead
    ? proposalDownloadLinkPath(proposalDownloadLinkIdForLead({
        leadId: lead.id,
        clientProfileId: lead.clientProfileId,
        email: lead.userProfile.email,
      }))
    : null;
  const proposalDownloadUrl = proposalDownloadPathForLead ? `${appOrigin}${proposalDownloadPathForLead}` : null;
  const isAdminActor = actorRole === "admin";
  const isSalesActor = actorRole === "sales";
  const isPartnerActor = actorRole === "partner";
  const isSalesLikeActor = isSalesActor || isPartnerActor;
  const selectedEmailThread = emailThreads.find((thread) => thread.id === selectedEmailThreadId) ?? null;
  const missingRegistrationFields = useMemo(
    () => (lead ? registrationMissingFields(lead) : []),
    [lead],
  );
  const canGenerateEoi = missingRegistrationFields.length === 0;

  const refreshLeadThreads = useCallback(async () => {
    if (!activeLeadId) {
      setEmailThreads([]);
      setSelectedEmailThreadId(null);
      return;
    }

    setEmailLoading(true);
    setEmailNotice(null);
    try {
      const response = await fetch(
        `/api/email/threads?leadId=${encodeURIComponent(activeLeadId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as { threads?: EmailThread[]; error?: string };
      if (!response.ok) {
        setEmailNotice(payload.error ?? "Unable to load lead emails.");
        setEmailThreads([]);
        setSelectedEmailThreadId(null);
        return;
      }

      const nextThreads = payload.threads ?? [];
      setEmailThreads(nextThreads);
      setSelectedEmailThreadId((current) => {
        if (current && nextThreads.some((thread) => thread.id === current)) {
          return current;
        }
        return nextThreads[0]?.id ?? null;
      });
    } catch {
      setEmailNotice("Unable to load lead emails.");
      setEmailThreads([]);
      setSelectedEmailThreadId(null);
    } finally {
      setEmailLoading(false);
    }
  }, [activeLeadId]);

  const prepareEmail = useCallback(async (mode: "outreach" | "proposal") => {
    if (!lead) return;
    setEmailNotice(null);

    if (mode === "proposal") {
      setEmailOutreachActive(false);
      setEmailSubject(buildProposalSubject(lead));
      setEmailBody(buildProposalBody(lead));
      setEmailAttachments((current) => withoutFoundationOutreachAttachments(current));
    } else {
      setEmailOutreachActive(true);
      setEmailSubject(buildOutreachSubject());
      setEmailBody(buildOutreachBody(lead, migrationLinkUrl));
      try {
        const outreachAttachments = await buildFoundationOutreachAttachments();
        setEmailAttachments((current) => [
          ...withoutFoundationOutreachAttachments(current),
          ...outreachAttachments,
        ]);
      } catch {
        setEmailNotice("Unable to load the outreach brochure.");
      }
    }

    window.requestAnimationFrame(() => {
      document.getElementById("lead-communication")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [lead, migrationLinkUrl]);

  const addEmailAttachments = async (incoming: FileList | null) => {
    if (!incoming) return;
    const files = Array.from(incoming);
    if (files.length === 0) return;

    try {
      const attachments = await Promise.all(files.map((file) => fileToComposeAttachment(file)));
      setEmailAttachments((current) => {
        const next = [...current];
        for (const attachment of attachments) {
          if (!next.some((existing) => existing.filename === attachment.filename && existing.size === attachment.size)) {
            next.push(attachment);
          }
        }
        return next;
      });
      setEmailNotice(null);
    } catch {
      setEmailNotice("Unable to read the selected attachment.");
    }
  };

  const removeEmailAttachment = (index: number) => {
    setEmailAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const sendLeadEmail = async () => {
    if (!lead) return;
    if (!lead.userProfile.email.trim()) {
      setEmailNotice("This lead needs an email address before outreach can be sent.");
      return;
    }
    if (!emailSubject.trim() || !emailBody.trim()) {
      setEmailNotice("Subject and body are required.");
      return;
    }

    setEmailSending(true);
    setEmailNotice(null);
    try {
      let attachmentsToSend = emailAttachments;
      if (emailOutreachActive) {
        try {
          const hasBrochure = attachmentsToSend.some(
            (attachment) => attachment.filename === FOUNDATION_BROCHURE_FILENAME,
          );
          if (!hasBrochure) {
            const outreachAttachments = await buildFoundationOutreachAttachments();
            attachmentsToSend = [
              ...withoutFoundationOutreachAttachments(attachmentsToSend),
              ...outreachAttachments,
            ];
          }
        } catch {
          setEmailNotice("Unable to load the outreach brochure.");
          return;
        }
      }

      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: isAdminActor ? emailFrom : null,
          to: lead.userProfile.email,
          subject: emailSubject,
          body: emailBody,
          html: emailOutreachActive
            ? buildEmailHtmlWithFoundationBanner({ bodyText: emailBody })
            : undefined,
          leadId: lead.id,
          clientProfileId: lead.clientProfileId,
          threadId: selectedEmailThreadId,
          attachments: attachmentsToSend,
        }),
      });
      const payload = (await response.json()) as { error?: string; thread?: EmailThread };
      if (!response.ok) {
        setEmailNotice(payload.error ?? "Unable to send email.");
        return;
      }

      setEmailNotice("Email sent and saved to this lead profile.");
      setEmailAttachments([]);
      setEmailOutreachActive(false);
      if (payload.thread?.id) {
        setSelectedEmailThreadId(payload.thread.id);
      }
      await refreshLeadThreads();
    } catch {
      setEmailNotice("Unable to send email.");
    } finally {
      setEmailSending(false);
    }
  };

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
    if (!canGenerateEoi) {
      setWorkflowNotice(
        `Complete registration before generating the EOI: ${missingRegistrationFields.slice(0, 5).join(", ")}${missingRegistrationFields.length > 5 ? "…" : ""}.`,
      );
      return;
    }

    const uploaded = await uploadGeneratedEoiDocument();
    if (uploaded) {
      setWorkflowNotice("EOI generated from the template and client copy link is active.");
    }
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

  const handleCopyRegistrationLink = async () => {
    if (!registrationLinkUrl || typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(registrationLinkUrl);
      setCopiedRegistrationLink(true);
      window.setTimeout(() => setCopiedRegistrationLink(false), 2000);
    } catch {
      setCopiedRegistrationLink(false);
    }
  };

  const handleCopyMigrationLink = async () => {
    if (!migrationLinkUrl || typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(migrationLinkUrl);
      setCopiedMigrationLink(true);
      window.setTimeout(() => setCopiedMigrationLink(false), 2000);
    } catch {
      setCopiedMigrationLink(false);
    }
  };

  const handleCopyDocumentUploadLink = async () => {
    if (!documentUploadUrl || typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(documentUploadUrl);
      setCopiedDocumentUploadLink(true);
      window.setTimeout(() => setCopiedDocumentUploadLink(false), 2000);
    } catch {
      setCopiedDocumentUploadLink(false);
    }
  };

  const handleCopyProposalDownloadLink = async () => {
    if (!proposalDownloadUrl || typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(proposalDownloadUrl);
      setCopiedProposalDownloadLink(true);
      window.setTimeout(() => setCopiedProposalDownloadLink(false), 2000);
    } catch {
      setCopiedProposalDownloadLink(false);
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
    setProfileDraft({
      company: lead.company,
      businessRegistrationNumber: lead.businessRegistrationNumber,
      industry: lead.industry,
      contactFirstName: lead.contactFirstName ?? "",
      contactSurname: lead.contactSurname ?? "",
      contactPosition: lead.contactPosition ?? lead.userProfile.role,
      contactEmail: lead.userProfile.email,
      contactNumber: lead.userProfile.phone,
      monthlyElectricitySpendEstimateZar:
        lead.monthlyElectricitySpendEstimateZar > 0
          ? String(lead.monthlyElectricitySpendEstimateZar)
          : "",
      isBusinessRegistered: lead.isBusinessRegistered,
      isBusinessOperational: lead.isBusinessOperational,
      hasSixMonthUtilityBill: lead.hasSixMonthUtilityBill,
      physicalAddress: lead.physicalAddress,
      city: lead.city,
      province: lead.province,
    });
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

  useEffect(() => {
    if (!lead) {
      setEmailSubject("");
      setEmailBody("");
      setEmailThreads([]);
      setSelectedEmailThreadId(null);
      setEmailMessages([]);
      setEmailAttachments([]);
      setEmailOutreachActive(false);
      return;
    }

    setEmailSubject(buildOutreachSubject());
  setEmailBody(buildOutreachBody(lead, migrationLinkUrl));
    setEmailOutreachActive(true);
    setEmailAttachments([]);
    setEmailNotice(null);
    setEmailMessages([]);
    buildFoundationOutreachAttachments()
      .then((outreachAttachments) => setEmailAttachments(outreachAttachments))
      .catch(() => setEmailNotice("Unable to load the outreach brochure."));
    void refreshLeadThreads();
    // Composer defaults should reset only when navigating to another lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeadId, migrationLinkUrl, refreshLeadThreads]);

  useEffect(() => {
    if (!selectedEmailThreadId) {
      setEmailMessages([]);
      return;
    }

    let cancelled = false;
    const threadId = selectedEmailThreadId;
    async function loadMessages() {
      setEmailLoading(true);
      try {
        const response = await fetch(`/api/email/threads/${encodeURIComponent(threadId)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as { messages?: EmailMessage[]; error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setEmailNotice(payload.error ?? "Unable to load email thread.");
          setEmailMessages([]);
          return;
        }
        setEmailMessages(payload.messages ?? []);
      } catch {
        if (!cancelled) {
          setEmailNotice("Unable to load email thread.");
          setEmailMessages([]);
        }
      } finally {
        if (!cancelled) {
          setEmailLoading(false);
        }
      }
    }

    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [selectedEmailThreadId]);

  const handleSaveProfile = () => {
    if (!lead) return;
    updateLeadProfile(lead.id, {
      company: profileDraft.company,
      businessRegistrationNumber: profileDraft.businessRegistrationNumber,
      industry: profileDraft.industry,
      contactFirstName: profileDraft.contactFirstName,
      contactSurname: profileDraft.contactSurname,
      contactPosition: profileDraft.contactPosition,
      contactEmail: profileDraft.contactEmail,
      contactNumber: profileDraft.contactNumber,
      monthlyElectricitySpendEstimateZar:
        Number.parseFloat(
          profileDraft.monthlyElectricitySpendEstimateZar.replace(/[^0-9.]/g, ""),
        ) || 0,
      isBusinessRegistered: profileDraft.isBusinessRegistered,
      isBusinessOperational: profileDraft.isBusinessOperational,
      hasSixMonthUtilityBill: profileDraft.hasSixMonthUtilityBill,
      physicalAddress: profileDraft.physicalAddress,
      city: profileDraft.city,
      province: profileDraft.province,
      source: lead.source,
    });
  };

  if (!lead) {
    return (
      <div className="flex flex-col gap-4">
        <section className="app-surface rounded-[1.6rem] px-5 py-5 lg:px-6 lg:py-6">
          <AdminHeader
            eyebrow="Profile"
            title="Profile not found."
            description="The selected lead profile does not exist or was removed."
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
          eyebrow="Profile"
          title={`${lead.company} • ${lead.clientProfileId}`}
          description="One profile for outreach history, onboarding stage control, file vault, and sales actions."
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
            <p className="mt-1 text-xs text-white/42">
              Profile created: {formatDateTime(lead.createdAt) || "—"}
            </p>
            {lead.registeredAt ? (
              <p className="mt-1 text-xs text-white/42">
                Registration submitted: {formatDateTime(lead.registeredAt)}
              </p>
            ) : null}
            {lead.manuallyAddedAt ? (
              <p className="mt-1 text-xs text-white/42">
                Manually added by admin: {formatDateTime(lead.manuallyAddedAt)}
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
              <button
                type="button"
                onClick={() => void prepareEmail("outreach")}
                className="rounded-[0.7rem] border border-white/16 px-2.5 py-1.5 text-[0.64rem] uppercase tracking-[0.2em] text-white/82 transition hover:border-white/30 hover:text-white"
              >
                Email client
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="app-surface rounded-[1.4rem] p-4">
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.15rem] border border-emerald-300/18 bg-emerald-500/[0.055] p-4">
            <p className="line-label">Unique Migration Estimate Link</p>
            <p className="mt-2 text-sm leading-6 text-white/56">
              Use this in outreach. The estimate form updates this exact lead profile instead of creating a duplicate.
            </p>
            <p className="mt-3 break-all rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white/72">
              {migrationLinkUrl ?? "Loading migration link..."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {migrationLinkUrl ? (
                <Link
                  href={migrationLinkUrl}
                  target="_blank"
                  className="rounded-[0.75rem] border border-white/14 px-3 py-2 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white"
                >
                  Open
                </Link>
              ) : null}
              <button
                type="button"
                onClick={handleCopyMigrationLink}
                disabled={!migrationLinkUrl}
                className="rounded-[0.75rem] border border-white/14 px-3 py-2 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {copiedMigrationLink ? "Copied" : "Copy Link"}
              </button>
            </div>
          </div>

          <div className="rounded-[1.15rem] border border-white/10 bg-black/30 p-4">
            <p className="line-label">Unique Registration Link</p>
            <p className="mt-2 text-sm leading-6 text-white/56">
              Send this to the lead to complete the missing profile blocks. Submissions update this exact profile.
            </p>
            <p className="mt-3 break-all rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white/72">
              {registrationLinkUrl ?? "Loading registration link..."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {registrationLinkUrl ? (
                <Link
                  href={registrationLinkUrl}
                  target="_blank"
                  className="rounded-[0.75rem] border border-white/14 px-3 py-2 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white"
                >
                  Open
                </Link>
              ) : null}
              <button
                type="button"
                onClick={handleCopyRegistrationLink}
                disabled={!registrationLinkUrl}
                className="rounded-[0.75rem] border border-white/14 px-3 py-2 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {copiedRegistrationLink ? "Copied" : "Copy Link"}
              </button>
            </div>
          </div>

          <div className="rounded-[1.15rem] border border-white/10 bg-black/30 p-4">
            <p className="line-label">Document Upload Link</p>
            <p className="mt-2 text-sm leading-6 text-white/56">
              Send this for EOI files, signed EOI, 6-month utility bills, and signed proposal uploads.
            </p>
            <p className="mt-3 break-all rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white/72">
              {documentUploadUrl ?? "Loading document upload link..."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {documentUploadUrl ? (
                <Link
                  href={documentUploadUrl}
                  target="_blank"
                  className="rounded-[0.75rem] border border-white/14 px-3 py-2 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white"
                >
                  Open
                </Link>
              ) : null}
              <button
                type="button"
                onClick={handleCopyDocumentUploadLink}
                disabled={!documentUploadUrl}
                className="rounded-[0.75rem] border border-white/14 px-3 py-2 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {copiedDocumentUploadLink ? "Copied" : "Copy Link"}
              </button>
            </div>
          </div>

          <div className="rounded-[1.15rem] border border-lime-300/18 bg-lime-300/[0.045] p-4">
            <p className="line-label">Proposal Download Link</p>
            <p className="mt-2 text-sm leading-6 text-white/56">
              Upload proposal files in the workflow below, then share this unique NDA-gated download link.
            </p>
            <p className="mt-3 break-all rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white/72">
              {proposalDownloadUrl ?? "Loading proposal download link..."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {proposalDownloadUrl ? (
                <Link
                  href={proposalDownloadUrl}
                  target="_blank"
                  className="rounded-[0.75rem] border border-white/14 px-3 py-2 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white"
                >
                  Open
                </Link>
              ) : null}
              <button
                type="button"
                onClick={handleCopyProposalDownloadLink}
                disabled={!proposalDownloadUrl}
                className="rounded-[0.75rem] border border-white/14 px-3 py-2 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {copiedProposalDownloadLink ? "Copied" : "Copy Link"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {isAdminActor ? (
        <section className="app-surface rounded-[1.4rem] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="line-label">Lead Details</p>
              <p className="mt-2 text-sm text-white/56">
                {canGenerateEoi
                  ? "Registration profile complete. EOI generation is unlocked."
                  : `Complete registration before EOI: ${missingRegistrationFields.slice(0, 4).join(", ")}${missingRegistrationFields.length > 4 ? "…" : ""}.`}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveProfile}
              className="rounded-[0.8rem] border border-white/16 bg-white/[0.08] px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/84 transition hover:border-white/28 hover:bg-white/[0.14]"
            >
              Save Details
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input
              value={profileDraft.company}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, company: event.target.value }))}
              placeholder="Company"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
            <input
              value={profileDraft.businessRegistrationNumber}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, businessRegistrationNumber: event.target.value }))}
              placeholder="Registration number"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
            <input
              value={profileDraft.industry}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, industry: event.target.value }))}
              placeholder="Industry"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
            <input
              value={profileDraft.monthlyElectricitySpendEstimateZar}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, monthlyElectricitySpendEstimateZar: event.target.value }))}
              placeholder="Monthly electricity spend"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
            <input
              value={profileDraft.contactFirstName}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, contactFirstName: event.target.value }))}
              placeholder="First name"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
            <input
              value={profileDraft.contactSurname}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, contactSurname: event.target.value }))}
              placeholder="Surname"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
            <input
              value={profileDraft.contactPosition}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, contactPosition: event.target.value }))}
              placeholder="Position"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
            <input
              value={profileDraft.contactEmail}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, contactEmail: event.target.value }))}
              placeholder="Email"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
            <input
              value={profileDraft.contactNumber}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, contactNumber: event.target.value }))}
              placeholder="Phone"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
            <input
              value={profileDraft.physicalAddress}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, physicalAddress: event.target.value }))}
              placeholder="Address"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm xl:col-span-2"
            />
            <input
              value={profileDraft.city}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, city: event.target.value }))}
              placeholder="City"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
            <input
              value={profileDraft.province}
              onChange={(event) => setProfileDraft((draft) => ({ ...draft, province: event.target.value }))}
              placeholder="Province"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 rounded-[0.8rem] border border-white/10 px-3 py-2 text-sm text-white/72">
              <input
                type="checkbox"
                checked={profileDraft.isBusinessRegistered}
                onChange={(event) => setProfileDraft((draft) => ({ ...draft, isBusinessRegistered: event.target.checked }))}
              />
              CIPC registered
            </label>
            <label className="inline-flex items-center gap-2 rounded-[0.8rem] border border-white/10 px-3 py-2 text-sm text-white/72">
              <input
                type="checkbox"
                checked={profileDraft.isBusinessOperational}
                onChange={(event) => setProfileDraft((draft) => ({ ...draft, isBusinessOperational: event.target.checked }))}
              />
              Operational
            </label>
            <label className="inline-flex items-center gap-2 rounded-[0.8rem] border border-white/10 px-3 py-2 text-sm text-white/72">
              <input
                type="checkbox"
                checked={profileDraft.hasSixMonthUtilityBill}
                onChange={(event) => setProfileDraft((draft) => ({ ...draft, hasSixMonthUtilityBill: event.target.checked }))}
              />
              Has utility bills
            </label>
          </div>
        </section>
      ) : null}

      <section id="lead-communication" className="app-surface scroll-mt-4 rounded-[1.4rem] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="line-label">Communication</p>
            <p className="mt-2 text-sm text-white/58">
              {lead.userProfile.email || "No email address saved for this lead."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void prepareEmail("outreach")}
              className="rounded-[0.7rem] border border-white/14 px-2.5 py-1.5 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white"
            >
              Outreach
            </button>
            <button
              type="button"
              onClick={() => void prepareEmail("proposal")}
              className="rounded-[0.7rem] border border-white/14 px-2.5 py-1.5 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white"
            >
              Proposal
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedEmailThreadId(null);
                void prepareEmail("outreach");
              }}
              className="rounded-[0.7rem] border border-white/14 px-2.5 py-1.5 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white"
            >
              New Email
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[0.9rem] border border-white/10 bg-black/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                Email History
              </p>
              <button
                type="button"
                onClick={refreshLeadThreads}
                disabled={emailLoading}
                className="rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/72 transition hover:border-white/26 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Refresh
              </button>
            </div>

            {emailThreads.length > 0 ? (
              <div className="mt-3 flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
                {emailThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedEmailThreadId(thread.id)}
                    className={`rounded-[0.75rem] border px-3 py-2 text-left transition ${
                      thread.id === selectedEmailThreadId
                        ? "border-white/26 bg-white/[0.08]"
                        : "border-white/8 bg-black/35 hover:border-white/18"
                    }`}
                  >
                    <span className="block truncate text-sm text-white/82">
                      {thread.subject ?? "No subject"}
                    </span>
                    <span className="mt-1 block text-[0.62rem] uppercase tracking-[0.16em] text-white/42">
                      {thread.lastDirection ?? "email"} • {formatDateTime(thread.lastMessageAt)}
                      {thread.unreadCount > 0 ? ` • ${thread.unreadCount} unread` : ""}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-white/54">
                {emailLoading ? "Loading emails." : "No email history for this lead yet."}
              </p>
            )}

            <div className="mt-4 flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
              {emailMessages.length > 0 ? (
                emailMessages.map((message) => (
                  <article
                    key={message.id}
                    className={`rounded-[0.8rem] border px-3 py-2 ${
                      message.direction === "outbound"
                        ? "border-emerald-300/16 bg-emerald-300/[0.05]"
                        : "border-sky-300/16 bg-sky-300/[0.05]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-[0.16em] text-white/50">
                        {message.direction === "outbound" ? "Sent" : "Received"}
                      </p>
                      <p className="text-xs text-white/42">{formatDateTime(message.sentAt)}</p>
                    </div>
                    <p className="mt-1 text-sm text-white/78">
                      {message.direction === "outbound" ? `To: ${message.toAddresses.join(", ")}` : `From: ${message.fromAddress}`}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/68">
                      {message.bodyText ?? ""}
                    </p>
                    {message.attachments.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.attachments.map((attachment) => (
                          <span
                            key={attachment.id}
                            className="rounded-[0.55rem] border border-white/10 px-2 py-1 text-[0.62rem] text-white/58"
                          >
                            {attachment.filename}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <p className="text-sm text-white/54">
                  {selectedEmailThread ? "No messages found in this thread." : "Select a thread or send a new email."}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[0.9rem] border border-white/10 bg-black/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                {selectedEmailThread ? "Reply" : "Compose"}
              </p>
              {selectedEmailThread ? (
                <button
                  type="button"
                  onClick={() => setSelectedEmailThreadId(null)}
                  className="rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/72 transition hover:border-white/26 hover:text-white"
                >
                  Detach Thread
                </button>
              ) : null}
            </div>

            {isAdminActor ? (
              <label className="mt-3 flex flex-col gap-1">
                <span className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-white/46">
                  From
                </span>
                <select
                  value={emailFrom}
                  onChange={(event) => setEmailFrom(event.target.value)}
                  className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
                >
                  {senderOptions.map((sender) => (
                    <option key={sender.email} value={sender.value}>
                      {sender.label} ({sender.email})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-white/46">
                To
              </span>
              <input
                value={lead.userProfile.email}
                readOnly
                className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 flex flex-col gap-1">
              <span className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Subject
              </span>
              <input
                value={emailSubject}
                onChange={(event) => setEmailSubject(event.target.value)}
                className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
              />
            </label>
            <textarea
              rows={9}
              value={emailBody}
              onChange={(event) => setEmailBody(event.target.value)}
              className="admin-input mt-3 w-full rounded-[0.8rem] px-3 py-2 text-sm leading-6"
            />
            {systemSignaturePreview ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-white/12 bg-black/35">
                <div className="border-b border-white/8 px-3 py-2">
                  <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/46">
                    Footer added to this email
                  </p>
                </div>
                <div className="space-y-3 p-3">
                  <EmailSignaturePreviewText text={systemSignaturePreview.beforeBanner} />
                  <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                    <img
                      src={FOUNDATION_EMAIL_BANNER_PATH}
                      alt="Foundation-1 email banner"
                      className="h-auto w-full object-cover"
                    />
                  </div>
                  {systemSignaturePreview.afterBanner ? (
                    <EmailSignaturePreviewText text={systemSignaturePreview.afterBanner} />
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-[0.7rem] border border-white/14 px-3 py-1.5 text-[0.64rem] uppercase tracking-[0.16em] text-white/76 transition hover:border-white/26 hover:text-white">
                <input
                  type="file"
                  multiple
                  onChange={(event) => {
                    void addEmailAttachments(event.target.files);
                    event.target.value = "";
                  }}
                  className="hidden"
                />
                Attach File
              </label>
              <button
                type="button"
                onClick={sendLeadEmail}
                disabled={emailSending || !lead.userProfile.email.trim()}
                className="rounded-[0.75rem] border border-white/14 bg-white/[0.08] px-4 py-2 text-[0.64rem] uppercase tracking-[0.16em] text-white/86 transition hover:border-white/26 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {emailSending ? "Sending" : selectedEmailThread ? "Send Reply" : "Send Email"}
              </button>
            </div>

            {emailAttachments.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {emailAttachments.map((attachment, index) => (
                  <li
                    key={`${attachment.filename}-${attachment.size}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-[0.7rem] border border-white/10 bg-black/35 px-3 py-1.5 text-sm text-white/78"
                  >
                    <span className="truncate">
                      {attachment.filename}{" "}
                      <span className="text-xs text-white/44">
                        ({Math.max(1, Math.round(attachment.size / 1024))} KB)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeEmailAttachment(index)}
                      className="text-[0.62rem] uppercase tracking-[0.16em] text-white/52 hover:text-rose-200"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {emailNotice ? <p className="mt-3 text-sm text-white/68">{emailNotice}</p> : null}
          </div>
        </div>
      </section>

      <section className="app-surface rounded-[1.4rem] p-4">
        <p className="line-label">Onboarding Workflow</p>
        <p className="mt-2 text-sm text-white/60">
          Flow: Client copies EOI onto letterhead and sends back signed EOI{" -> "}Client uploads 6-month utility bills{" -> "}Admin uploads proposal{" -> "}Admin uploads term sheet{" -> "}Mark onboarding complete.
        </p>
        {!canGenerateEoi ? (
          <p className="mt-2 rounded-[0.8rem] border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-sm text-amber-100/82">
            EOI locked until registration is complete: {missingRegistrationFields.slice(0, 6).join(", ")}
            {missingRegistrationFields.length > 6 ? "…" : ""}.
          </p>
        ) : null}
        {workflowNotice ? (
          <p className="mt-2 text-sm text-white/72">{workflowNotice}</p>
        ) : null}
        <div className="mt-3 rounded-[0.9rem] border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-white/45">
            Client EOI Template Link
          </p>
          <p className="mt-2 text-sm text-white/70">
            {eoiSigningUrl ?? "Generate EOI to create the client template link."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {eoiSigningUrl ? (
              <Link
                href={eoiSigningUrl}
                target="_blank"
                className="rounded-[0.7rem] border border-white/14 px-2.5 py-1.5 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white"
              >
                Open Client Template Page
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
            {lead.eoiSignedAt ? (
              <>
                Signed EOI received from {lead.eoiSignedBy ?? "Client"} • {new Date(lead.eoiSignedAt).toLocaleString("en-ZA")}
              </>
            ) : (
              "Awaiting signed EOI by email or document upload."
            )}
          </p>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {isSalesLikeActor ? (
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
                disabled={!canGenerateEoi || isWorkflowUploading || lead.stage === "Disqualified" || lead.stage === "Onboarding Complete"}
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
        {!hasEoiSigned(lead) && isSalesLikeActor ? (
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
              value={lead.contactStatus}
              onChange={(event) =>
                updateLeadContactStatus(lead.id, event.target.value as AdminLeadContactStatus)
              }
              className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
            >
              {contactStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
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
