import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminLeadMutationSnapshot } from "@/lib/admin-state-store";
import { createNotification } from "@/lib/notifications";
import { makeId, timelineLabel } from "@/lib/formatting";
import { consumeRateLimit } from "@/lib/rate-limit";
import { documentUploadLinkIdForLead } from "@/lib/registration-links";
import { promoteLeadStage as promoteStage } from "@/lib/lead-stage";
import { uploadPrivateObject } from "@/lib/server-json-store";
import { analyseUtilityBillFile } from "@/lib/utility-bill-pdf";
import { aggregateUtilityBills, isUtilityBillDocumentAnalysis, type UtilityBillDocumentAnalysis } from "@/lib/utility-bill-analysis";
import { currentiseEskomBill } from "@/lib/eskom-tariff-currentisation";
import {
  DOCUMENT_TYPE_META,
  KYC_DOCUMENT_TYPES,
  countDocumentsByType,
  isClientUploadDocumentType,
  type ClientDocumentType,
} from "@/lib/document-taxonomy";
import type { AdminLead, AdminLeadDocument } from "@/lib/admin-types";

export const runtime = "nodejs";

const DOCUMENT_BUCKET = "oneos-client-documents";
const MAX_FILES = 12;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "heic",
  "heif",
  "webp",
  "docx",
  "xlsx",
  "txt",
]);
type PublicDocumentType = ClientDocumentType;
type PublicUploadLead = {
  clientProfileId: string;
  company: string;
  contactName: string;
  email: string;
  stage: string;
  documentCounts: Record<PublicDocumentType, number>;
};

type PublicBillAnalysisSummary = {
  fileName: string;
  status: UtilityBillDocumentAnalysis["status"];
  accountMonth: string | null;
  tariffName: string | null;
  monthlyKwh: number | null;
  currentPeriodChargesExVat: number | null;
  confidence: UtilityBillDocumentAnalysis["confidence"];
  warnings: string[];
};

function findLeadByUploadToken(leads: AdminLead[], token: string): AdminLead | null {
  return (
    leads.find(
      (lead) =>
        documentUploadLinkIdForLead({
          leadId: lead.id,
          clientProfileId: lead.clientProfileId,
          email: lead.userProfile.email,
        }) === token,
    ) ?? null
  );
}

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function cleanFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function fileExtension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function toFileType(file: File): AdminLeadDocument["fileType"] {
  const extension = fileExtension(file);
  if (extension === "docx") return "DOCX";
  if (extension === "xlsx") return "XLSX";
  if (["png", "jpg", "jpeg", "heic", "heif", "webp"].includes(extension)) return "PNG";
  if (extension === "txt") return "TXT";
  return "PDF";
}

function baseFileTitle(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validateFile(file: File) {
  const extension = fileExtension(file);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return `${file.name} is not supported. Upload PDF, photos (JPG, PNG, HEIC), DOCX, XLSX, or TXT files.`;
  }
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than 15MB.`;
  return null;
}

function isDocumentType(value: FormDataEntryValue | null): value is PublicDocumentType {
  return isClientUploadDocumentType(value);
}

function setTaskStatus(lead: AdminLead, title: string, done: boolean): AdminLead["tasks"] {
  return lead.tasks.map((task) =>
    task.title === title
      ? {
          ...task,
          status: done ? ("done" as const) : ("open" as const),
        }
      : task,
  );
}

function titleForUpload(type: PublicDocumentType, file: File, index: number) {
  const base = baseFileTitle(file.name);
  const meta = DOCUMENT_TYPE_META[type];
  if (type === "utility_bills") {
    return base ? `Utility Bill - ${base}` : `Utility Bill - Month ${index + 1}`;
  }
  return base ? `${meta.title} - ${base}` : meta.title;
}

function documentCategory(type: PublicDocumentType) {
  return DOCUMENT_TYPE_META[type].category;
}

function documentStatus(type: PublicDocumentType): AdminLeadDocument["status"] {
  return type === "signed_eoi" || type === "signed_proposal" || type === "signed_mandate"
    ? "signed"
    : "received";
}

function publicLead(lead: AdminLead): PublicUploadLead {
  return {
    clientProfileId: lead.clientProfileId,
    company: lead.company,
    contactName: lead.contactName,
    email: lead.userProfile.email,
    stage: lead.stage,
    documentCounts: countDocumentsByType(lead.documents),
  };
}

function publicBillAnalysis(analysis: UtilityBillDocumentAnalysis): PublicBillAnalysisSummary {
  return {
    fileName: analysis.sourceFileName,
    status: analysis.status,
    accountMonth: analysis.accountMonth,
    tariffName: analysis.tariffName,
    monthlyKwh: analysis.monthlyKwh,
    currentPeriodChargesExVat: analysis.totalChargesExVat,
    confidence: analysis.confidence,
    warnings: analysis.warnings,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { backend, snapshot } = await readAdminStateSnapshot();
  const lead = findLeadByUploadToken(snapshot.leads, token);
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Document upload link not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, backend, lead: publicLead(lead) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const limit = await consumeRateLimit({
    scope: "public-document-upload",
    key: `${requestIp(request)}:${token}`,
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many upload attempts. Try again later." },
      { status: 429 },
    );
  }

  // Reject oversized bodies before parsing — a multi-file upload can be at
  // most MAX_FILES × MAX_FILE_BYTES (plus multipart overhead). Without this,
  // huge bodies blow up inside formData() as an unhandled 500.
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FILES * MAX_FILE_BYTES + 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: `Upload too large. Each file must be under 15MB (maximum ${MAX_FILES} files).` },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not read the upload. Send files as multipart form data." },
      { status: 400 },
    );
  }
  const documentTypeEntry = formData.get("documentType");
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);

  if (!isDocumentType(documentTypeEntry)) {
    const isKycAttempt = typeof documentTypeEntry === "string"
      && KYC_DOCUMENT_TYPES.includes(documentTypeEntry as ClientDocumentType);
    return NextResponse.json(
      {
        ok: false,
        error: isKycAttempt
          ? "Bank KYC documents cannot be uploaded to Foundation-1. After the signed formal UFMS proposal, send them directly to info@UFMS.net only."
          : "Choose an allowed document type.",
      },
      { status: isKycAttempt ? 403 : 400 },
    );
  }
  const documentType = documentTypeEntry;

  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "Choose at least one file before uploading." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: `Upload a maximum of ${MAX_FILES} files at a time.` }, { status: 400 });
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_FILES * MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Upload too large. Each file must be under 15MB." },
      { status: 413 },
    );
  }

  const invalidFileMessage = files.map(validateFile).find((message): message is string => Boolean(message));
  if (invalidFileMessage) {
    return NextResponse.json({ ok: false, error: invalidFileMessage }, { status: 400 });
  }

  const { snapshot } = await readAdminStateSnapshot();
  const currentLead = findLeadByUploadToken(snapshot.leads, token);
  if (!currentLead) {
    return NextResponse.json({ ok: false, error: "Document upload link not found." }, { status: 404 });
  }

  // Extraction is deliberately non-fatal. The original private document is
  // always retained; image-only/complex statements are flagged for human
  // review instead of turning a valid upload into an error.
  const billAnalyses = new Map<number, UtilityBillDocumentAnalysis>();
  if (documentType === "utility_bills") {
    await Promise.all(
      files.map(async (file, index) => {
        try {
          billAnalyses.set(index, await analyseUtilityBillFile(file));
        } catch {
          // Storage still proceeds. Lazy proposal analysis can retry later.
        }
      }),
    );
  }

  let updatedLead: AdminLead | null = null;
  const nextLeads = await Promise.all(snapshot.leads.map(async (lead) => {
    if (lead.id !== currentLead.id) return lead;

    const uploadedDocuments: AdminLeadDocument[] = [];
    for (const [index, file] of files.entries()) {
      const documentId = makeId("doc");
      const safeFilename = cleanFileSegment(file.name) || `${documentId}.bin`;
      const storagePath = await uploadPrivateObject(
        DOCUMENT_BUCKET,
        `${lead.clientProfileId}/${documentId}-${safeFilename}`,
        file,
      );

      uploadedDocuments.push({
        id: documentId,
        title: titleForUpload(documentType, file, index),
        category: documentCategory(documentType),
        fileType: toFileType(file),
        status: documentStatus(documentType),
        uploadedAt: timelineLabel(),
        uploadedBy: `${lead.contactName || lead.userProfile.fullName} (Client)`,
        uploadedByType: "Client",
        sourceAccount: lead.migrateAccountId,
        sourceWorkspace: `Foundation-1 Secure Upload / ${lead.company}`,
        storagePath,
        fileName: file.name,
        contentType: file.type || null,
        utilityBillAnalysis: billAnalyses.get(index) ?? null,
      });
    }

    const signedEoiAt = documentType === "signed_eoi" ? lead.eoiSignedAt ?? new Date().toISOString() : lead.eoiSignedAt;
    const nextStage = documentType === "signed_eoi"
      ? promoteStage(lead, "EOI Signed")
      : documentType === "utility_bills"
        ? promoteStage(lead, "Utility Bills Uploaded")
        : lead.stage;
    let nextReadiness = documentType === "signed_eoi"
      ? Math.max(lead.readinessScore, 58)
      : documentType === "utility_bills"
        ? Math.max(lead.readinessScore, 60)
        : documentType === "signed_proposal" || documentType === "signed_mandate"
          ? Math.max(lead.readinessScore, 84)
          : lead.readinessScore;
    const nextAction = documentType === "signed_eoi"
      ? "Review signed EOI and request the 6-month utility bill pack."
      : documentType === "utility_bills"
        ? "Review uploaded utility bills and prepare the proposal."
        : documentType === "signed_proposal"
          ? "Review the signed proposal and issue the direct UFMS KYC instructions."
          : documentType === "signed_mandate"
            ? "Countersign the Foundation-1 mandate and coordinate the formal proposal."
            : lead.nextAction;

    let nextTasks = lead.tasks;
    if (documentType === "signed_eoi") nextTasks = setTaskStatus(lead, "Submit signed EOI", true);
    if (documentType === "signed_proposal") nextTasks = setTaskStatus(lead, "Submit signed proposal", true);

    const existingBillAnalyses = lead.documents
      .map((document) => document.utilityBillAnalysis)
      .filter(isUtilityBillDocumentAnalysis);
    const uploadedBillAnalyses = uploadedDocuments
      .map((document) => document.utilityBillAnalysis)
      .filter(isUtilityBillDocumentAnalysis);
    const allBillAnalyses = [...existingBillAnalyses, ...uploadedBillAnalyses];
    const billPortfolio = documentType === "utility_bills"
      ? aggregateUtilityBills(allBillAnalyses, undefined, {
          currentisedBills: allBillAnalyses.map((analysis) => ({
            sourceHash: analysis.sourceHash,
            ...currentiseEskomBill(analysis),
          })),
        })
      : null;
    if (billPortfolio) {
      nextTasks = setTaskStatus(
        { ...lead, tasks: nextTasks },
        "Upload 6-month utility bill pack",
        billPortfolio.uniquePeriodCount >= 6,
      );
      if (billPortfolio.uniquePeriodCount >= 6) {
        nextReadiness = Math.max(nextReadiness, 72);
      }
    }

    updatedLead = {
      ...lead,
      stage: nextStage,
      readinessScore: nextReadiness,
      nextAction,
      lastTouched: "Just now",
      eoiSignedAt: signedEoiAt,
      eoiAcceptedTermsAt: documentType === "signed_eoi" ? lead.eoiAcceptedTermsAt ?? signedEoiAt : lead.eoiAcceptedTermsAt,
      eoiSignedBy: documentType === "signed_eoi" ? lead.eoiSignedBy ?? lead.contactName : lead.eoiSignedBy,
      eoiSignatureId: documentType === "signed_eoi" ? lead.eoiSignatureId ?? makeId("signature") : lead.eoiSignatureId,
      migrationAssessment: billPortfolio
        ? {
            ...(lead.migrationAssessment ?? {}),
            monthlySpend: billPortfolio.averageMonthlySpendExVat,
            annualSpend: billPortfolio.averageMonthlySpendExVat === null
              ? lead.migrationAssessment?.annualSpend ?? null
              : billPortfolio.averageMonthlySpendExVat * 12,
            monthlyKwh: billPortfolio.averageMonthlyKwh,
            billPortfolio,
            generatedAt: billPortfolio.generatedAt,
          }
        : lead.migrationAssessment,
      documents: [...uploadedDocuments, ...lead.documents],
      tasks: nextTasks,
      events: [
        {
          id: makeId("event"),
          title: "Client document uploaded",
          detail: `${files.length} ${documentType.replace(/_/g, " ")} file${files.length === 1 ? "" : "s"} uploaded through the secure document upload link.`,
          createdAt: timelineLabel(),
          tone: "client",
        },
        ...lead.events,
      ],
    };

    return updatedLead;
  }));

  if (!updatedLead) {
    return NextResponse.json({ ok: false, error: "Document upload link not found." }, { status: 404 });
  }

  const savedLead = updatedLead as AdminLead;
  const nextSnapshot = {
    ...snapshot,
    leads: nextLeads,
    activeLeadId: savedLead.id,
  };
  // Delta write: upsert ONLY the changed lead. A full-snapshot write rewrites
  // every lead row (5k+) and was the cause of >90s upload responses.
  const backend = await writeAdminLeadMutationSnapshot(nextSnapshot, "public-document-upload", {
    leadUpserts: [savedLead],
    leadDeletes: [],
  });

  void createNotification({
    audience: "admin",
    kind: "customer_uploaded_document",
    title: `Document uploaded by ${savedLead.company}`,
    body: `${savedLead.contactName} uploaded ${files.length} ${documentType.replace(/_/g, " ")} file${files.length === 1 ? "" : "s"}.`,
    link: `/admin/leads/${savedLead.clientProfileId}`,
    metadata: {
      leadId: savedLead.id,
      clientProfileId: savedLead.clientProfileId,
      company: savedLead.company,
      fileCount: files.length,
      documentType,
    },
  });

  if (documentType === "signed_eoi") {
    void createNotification({
      audience: "admin",
      kind: "eoi_signed",
      title: `EOI signed by ${savedLead.company}`,
      body: `${savedLead.contactName} signed and uploaded the Expression of Interest.`,
      link: `/admin/leads/${savedLead.clientProfileId}`,
      metadata: {
        leadId: savedLead.id,
        clientProfileId: savedLead.clientProfileId,
        company: savedLead.company,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    backend,
    lead: publicLead(savedLead),
    uploadedCount: files.length,
    billAnalyses: [...billAnalyses.values()].map(publicBillAnalysis),
  });
}
