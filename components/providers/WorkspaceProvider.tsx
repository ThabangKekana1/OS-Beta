"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ACTIVE_USER_NAME,
  RESOURCE_LIBRARY,
  WORKSPACE_OPTIONS,
} from "@/lib/mock-data";
import { makeId, nowLabel, timelineLabel, todayLabel } from "@/lib/formatting";
import { caseStageLabels } from "@/lib/types";
import type {
  ActivityEvent,
  CaseStage,
  ConversationMessage,
  ConversationMode,
  DocumentCentreEntry,
  DocumentStatus,
  DocumentSubmission,
  MigrationCase,
  ProductLine,
  ResourceItem,
  TaskItem,
  WorkspaceOption,
} from "@/lib/types";
import {
  createDefaultWorkspaceStateSnapshot,
  createWorkspaceCase,
  normalizeWorkspaceStateSnapshot,
  type WorkspaceStateSnapshot,
} from "@/lib/workspace-state";

type NavCounts = {
  activeMigrations: number;
  awaitingClientAction: number;
  awaitingInternalReview: number;
  closedDeals: number;
};

type WorkspaceContextValue = {
  activeWorkspaceId: string;
  workspaceId: string;
  activeCaseId: string | null;
  activeCase: MigrationCase | null;
  cases: MigrationCase[];
  documentCentre: DocumentCentreEntry[];
  navCounts: NavCounts;
  pendingCaseIds: ReadonlySet<string>;
  resources: ResourceItem[];
  userName: string;
  workspaceOptions: WorkspaceOption[];
  createBusinessCase: () => string;
  setActiveCaseId: (caseId: string | null) => void;
  setActiveWorkspaceId: (workspaceId: string) => void;
  sendMessage: (caseId: string, content: string, mode: ConversationMode) => void;
  toggleTaskStatus: (caseId: string, taskId: string) => void;
  uploadDocument: (caseId: string, title: string) => void;
  uploadFiles: (caseId: string, category: WorkspaceUploadCategory, files: File[]) => void;
  updateBusinessProfile: (caseId: string, updates: Partial<MigrationCase["business"]>) => void;
};

export const workspaceUploadCategories = [
  "EOI",
  "Utility Bills",
  "Proposal",
  "Term Sheet",
] as const;
export type WorkspaceUploadCategory = (typeof workspaceUploadCategories)[number];

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const WORKSPACE_STORAGE_KEY = "oneos:workspace:v1";
const EOI_TEMPLATE_TITLE = "Expression of Interest Template";
const SIGNED_EOI_TITLE = "Signed Expression of Interest";
const EOI_MISSING_ITEM = "Signed expression of interest";

const stageIndex: Record<CaseStage, number> = {
  New: 0,
  Registered: 1,
  "Qualification In Progress": 2,
  "Awaiting Service Acceptance": 3,
  "Awaiting Documents": 4,
  "Documents Under Review": 5,
  "Proposal Issued": 6,
  "Awaiting Signed Proposal": 7,
  "Term Sheet Issued": 8,
  "Awaiting Signed Term Sheet": 9,
  "Internal Review": 10,
  "Close Ready": 11,
  Closed: 12,
};

type ChatApiResponse = {
  reply?: string;
};

type WorkspaceApiResponse = {
  ok?: boolean;
  workspaceId?: string;
  snapshot?: WorkspaceStateSnapshot;
};

const AWAITING_CLIENT_STAGES = new Set<CaseStage>([
  "Awaiting Service Acceptance",
  "Awaiting Documents",
  "Awaiting Signed Proposal",
  "Awaiting Signed Term Sheet",
]);

const AWAITING_INTERNAL_STAGES = new Set<CaseStage>([
  "Documents Under Review",
  "Internal Review",
]);

function withDocument(
  documents: DocumentSubmission[],
  incoming: DocumentSubmission,
) {
  const existingIndex = documents.findIndex((document) => document.title === incoming.title);

  if (existingIndex === -1) {
    return [incoming, ...documents];
  }

  return documents.map((document, index) =>
    index === existingIndex ? { ...document, ...incoming } : document,
  );
}

function productForCase(migrationCase: MigrationCase): ProductLine {
  if (migrationCase.productRecommendation) {
    return migrationCase.productRecommendation;
  }

  return migrationCase.business.averageMonthlyUsageKwh >= 500000 ||
    migrationCase.business.siteCount > 1
    ? "Lumen-1"
    : "Generocity";
}

function hasSignedEoiDocument(migrationCase: MigrationCase) {
  return migrationCase.documents.some(
    (document) =>
      document.title === SIGNED_EOI_TITLE &&
      ["signed", "reviewed", "received"].includes(document.status),
  );
}

function isEoiMissingItem(item: string) {
  const normalized = item.toLowerCase();
  return normalized.includes("expression of interest") || normalized === "signed eoi";
}

function ensureEoiMissingItem(missingItems: string[]) {
  return missingItems.some(isEoiMissingItem)
    ? missingItems
    : [EOI_MISSING_ITEM, ...missingItems];
}

function clearEoiMissingItems(missingItems: string[]) {
  return missingItems.filter((item) => !isEoiMissingItem(item));
}

function requiresSignedEoi(migrationCase: MigrationCase) {
  if (hasSignedEoiDocument(migrationCase)) {
    return false;
  }

  if (migrationCase.missingItems.some(isEoiMissingItem)) {
    return true;
  }

  return stageIndex[migrationCase.stage] <= stageIndex["Qualification In Progress"];
}

function reconcileChecklist(migrationCase: MigrationCase) {
  return migrationCase.closeChecklist.map((item) => {
    switch (item.id) {
      case "registration":
        return { ...item, complete: stageIndex[migrationCase.stage] >= 1 };
      case "eoi":
        return {
          ...item,
          complete:
            !requiresSignedEoi(migrationCase) ||
            stageIndex[migrationCase.stage] >= stageIndex["Registered"],
        };
      case "qualification":
        return {
          ...item,
          complete:
            migrationCase.productRecommendation !== null ||
            stageIndex[migrationCase.stage] >= 3,
        };
      case "acceptance":
        return {
          ...item,
          complete:
            stageIndex[migrationCase.stage] >= 4 &&
            !migrationCase.missingItems.includes("Signed service acceptance"),
        };
      case "documents":
        return { ...item, complete: stageIndex[migrationCase.stage] >= 6 };
      case "proposal":
        return { ...item, complete: migrationCase.proposal?.status === "signed" };
      case "term-sheet":
        return { ...item, complete: migrationCase.termSheet?.status === "signed" };
      case "internal-review":
        return { ...item, complete: stageIndex[migrationCase.stage] >= 11 };
      case "close":
        return { ...item, complete: migrationCase.stage === "Closed" };
      default:
        return item;
    }
  });
}

function appendActivity(
  activity: ActivityEvent[],
  item: Omit<ActivityEvent, "id">,
) {
  return [{ id: makeId("activity"), ...item }, ...activity];
}

function appendMessage(
  messages: ConversationMessage[],
  item: Omit<ConversationMessage, "id">,
) {
  return [...messages, { id: makeId("message"), ...item }];
}

function sortRecentCases(a: MigrationCase, b: MigrationCase) {
  return stageIndex[b.stage] - stageIndex[a.stage];
}

function updateCaseStage(
  migrationCase: MigrationCase,
  stage: CaseStage,
  nextAction: string,
) {
  return {
    ...migrationCase,
    stage,
    nextAction,
    lastUpdated: "Just now",
  };
}

function getDefaultActiveCaseId(cases: MigrationCase[]) {
  return cases.find((migrationCase) => migrationCase.stage !== "Closed")?.id ?? cases[0]?.id ?? null;
}

function buildCaseOperationalContext(migrationCase: MigrationCase, mode: ConversationMode) {
  const locationSummary = migrationCase.business.locations
    .map((location) =>
      [location.label, location.city, location.province].filter(Boolean).join(", "),
    )
    .join(" | ");
  const openClientTasks = migrationCase.tasks
    .filter((task) => task.status !== "done" && task.owner === "Client")
    .map((task) => task.title);
  const openInternalTasks = migrationCase.tasks
    .filter((task) => task.status !== "done" && task.owner !== "Client")
    .map((task) => task.title);

  const lines = [
    `Conversation mode: ${mode}`,
    `Business: ${migrationCase.business.name}`,
    `Stage: ${caseStageLabels[migrationCase.stage]}`,
    `Registered locations (${migrationCase.business.locations.length}): ${locationSummary || "Not provided yet"}`,
    `Next action: ${migrationCase.nextAction}`,
    `Product recommendation: ${migrationCase.productRecommendation ?? "Pending assessment"}`,
    `Missing client items: ${migrationCase.missingItems.length > 0 ? migrationCase.missingItems.join(", ") : "None"}`,
    `Open client tasks: ${openClientTasks.length > 0 ? openClientTasks.join(", ") : "None"}`,
    `Open 1OS tasks: ${openInternalTasks.length > 0 ? openInternalTasks.join(", ") : "None"}`,
    `Proposal status: ${migrationCase.proposal?.status ?? "not issued"}`,
    `Term sheet status: ${migrationCase.termSheet?.status ?? "not issued"}`,
  ];

  // When the customer asks to review docs or wants proposal/term sheet support,
  // include the actual document body so the assistant can explain it directly.
  const wantsDocDetail =
    mode === "Review Documents" ||
    mode === "Proposal Support" ||
    mode === "Term Sheet Support" ||
    mode === "Close Deal";

  if (wantsDocDetail && migrationCase.proposal) {
    const p = migrationCase.proposal;
    lines.push(
      "",
      `PROPOSAL DOCUMENT (${p.title}, status: ${p.status}):`,
      `Summary: ${p.summary}`,
      `Forecast savings: ${p.savingsRange}`,
      `Term: ${p.termYears} years`,
    );
  }

  if (wantsDocDetail && migrationCase.termSheet) {
    const t = migrationCase.termSheet;
    lines.push(
      "",
      `TERM SHEET DOCUMENT (${t.title}, status: ${t.status}):`,
      `Summary: ${t.summary}`,
    );
  }

  return lines.join("\n");
}

function createInitialWorkspaceState(): Pick<WorkspaceStateSnapshot, "cases" | "activeCaseId"> {
  const { cases: seedCases, activeCaseId } = createDefaultWorkspaceStateSnapshot();
  return {
    cases: seedCases,
    activeCaseId,
  };
}

function mergeBusinessProfile(
  currentBusiness: MigrationCase["business"],
  updates: Partial<MigrationCase["business"]>,
) {
  const nextBusiness = { ...currentBusiness, ...updates };
  const nextLocations =
    Array.isArray(nextBusiness.locations) && nextBusiness.locations.length > 0
      ? nextBusiness.locations
      : currentBusiness.locations;
  const primaryLocation = nextLocations[0];

  return {
    ...nextBusiness,
    locations: nextLocations,
    location: primaryLocation?.city ?? "",
    province: primaryLocation?.province ?? "",
    siteCount: Math.max(1, nextLocations.length),
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [{ cases: initialCases, activeCaseId: initialActiveCaseId }] = useState(createInitialWorkspaceState);
  const [cases, setCases] = useState<MigrationCase[]>(initialCases);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(initialActiveCaseId);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(WORKSPACE_OPTIONS[0].id);
  const [serverWorkspaceId, setServerWorkspaceId] = useState<string | null>(null);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [pendingCaseIds, setPendingCaseIds] = useState<ReadonlySet<string>>(new Set());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const userInteractedRef = useRef(false);

  useEffect(() => {
    const abortControllers = abortControllersRef.current;

    return () => {
      // Abort all in-flight chat requests on unmount.
      for (const controller of abortControllers.values()) {
        controller.abort();
      }
      abortControllers.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applySnapshot = (snapshot: WorkspaceStateSnapshot, source: "local" | "remote") => {
      if (cancelled) {
        return;
      }

      // Don't let an in-flight server hydration overwrite edits the user just made.
      if (source === "remote" && userInteractedRef.current) {
        return;
      }

      setCases(snapshot.cases);
      setActiveCaseId(snapshot.activeCaseId ?? getDefaultActiveCaseId(snapshot.cases));
      setActiveWorkspaceId(snapshot.activeWorkspaceId);
    };

    try {
      const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (raw) {
        const parsed = normalizeWorkspaceStateSnapshot(JSON.parse(raw));

        if (parsed) {
          applySnapshot(parsed, "local");
        }
      }
    } catch {
      // Keep seed state if persisted payload is malformed.
    }

    void (async () => {
      try {
        const response = await fetch("/api/workspace/state", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Workspace state load failed (${response.status})`);
        }

        const payload = (await response.json()) as WorkspaceApiResponse;
        if (payload.ok && payload.snapshot) {
          setServerWorkspaceId(
            typeof payload.workspaceId === "string" ? payload.workspaceId : null,
          );
          applySnapshot(payload.snapshot, "remote");
        }
      } catch {
        // Local state remains authoritative when the backend is unavailable.
      } finally {
        if (!cancelled) {
          setIsStorageLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isStorageLoaded) {
      return;
    }

    const snapshot: WorkspaceStateSnapshot = {
      cases,
      activeCaseId,
      activeWorkspaceId,
    };

    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify(snapshot),
    );

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/workspace/state", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ snapshot }),
          });

          if (!response.ok) {
            throw new Error(`Workspace state persist failed (${response.status})`);
          }

          const payload = (await response.json()) as WorkspaceApiResponse;
          if (payload.ok && typeof payload.workspaceId === "string") {
            setServerWorkspaceId(payload.workspaceId);
          }
        } catch {
          // Local persistence is already written; retry on the next state change.
        }
      })();
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [activeCaseId, activeWorkspaceId, cases, isStorageLoaded]);

  useEffect(() => {
    if (!activeCaseId) {
      return;
    }

    if (!cases.some((migrationCase: MigrationCase) => migrationCase.id === activeCaseId)) {
      setActiveCaseId(getDefaultActiveCaseId(cases));
    }
  }, [activeCaseId, cases]);

  const activeCase =
    cases.find((migrationCase: MigrationCase) => migrationCase.id === activeCaseId) ?? null;

  const documentCentre = useMemo<DocumentCentreEntry[]>(() => [
    ...RESOURCE_LIBRARY.map((resource) => ({
      id: resource.id,
      title: resource.title,
      category: resource.category,
      fileType: resource.fileType,
      status: "available",
      updatedAt: resource.updatedAt,
      size: resource.size,
      sourceType: "Resource" as const,
      sourceLabel: "Shared Library",
    })),
    ...cases.flatMap((migrationCase: MigrationCase) =>
      migrationCase.documents.map((document: DocumentSubmission) => ({
        id: `${migrationCase.id}-${document.id}`,
        title: document.title,
        category: document.category,
        fileType: document.fileType,
        status: document.status,
        updatedAt: document.updatedAt,
        size: document.size,
        sourceType: "Case" as const,
        sourceLabel: migrationCase.business.name,
        caseId: migrationCase.id,
      })),
    ),
  ], [cases]);

  const navCounts = useMemo<NavCounts>(() => ({
    activeMigrations: cases.filter((migrationCase: MigrationCase) => migrationCase.stage !== "Closed").length,
    awaitingClientAction: cases.filter((migrationCase: MigrationCase) =>
      AWAITING_CLIENT_STAGES.has(migrationCase.stage),
    ).length,
    awaitingInternalReview: cases.filter((migrationCase: MigrationCase) =>
      AWAITING_INTERNAL_STAGES.has(migrationCase.stage),
    ).length,
    closedDeals: cases.filter((migrationCase: MigrationCase) => migrationCase.stage === "Closed").length,
  }), [cases]);

  const sendMessage = (caseId: string, content: string, mode: ConversationMode) => {
    const timestamp = nowLabel();
    const targetCase = cases.find((migrationCase: MigrationCase) => migrationCase.id === caseId) ?? null;
    const chatWorkspaceId = serverWorkspaceId ?? activeWorkspaceId;

    if (!targetCase) {
      return;
    }

    userInteractedRef.current = true;

    setCases((currentCases: MigrationCase[]) =>
      currentCases.map((migrationCase: MigrationCase) =>
        migrationCase.id === caseId
          ? {
              ...migrationCase,
              lastUpdated: "Just now",
              messages: appendMessage(migrationCase.messages, {
                type: "user",
                content,
                timestamp,
                mode,
              }),
            }
          : migrationCase,
      ),
    );

    const context = buildCaseOperationalContext(targetCase, mode);

    // Last 12 turns (user + assistant) for rolling memory in this case.
    const recentHistory = targetCase.messages
      .filter((m) => m.type === "user" || m.type === "assistant")
      .slice(-12)
      .map((m) => ({
        role: m.type === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

    setPendingCaseIds((prev) => new Set([...prev, caseId]));

    // Cancel any in-flight request for this case.
    abortControllersRef.current.get(caseId)?.abort();
    const controller = new AbortController();
    abortControllersRef.current.set(caseId, controller);

    void (async () => {
      const assistantTimestamp = nowLabel();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: content,
            caseName: targetCase.business.name,
            context,
            workspaceId: chatWorkspaceId,
            caseId,
            mode,
            history: recentHistory,
          }),
        });

        const payload = (await response.json()) as ChatApiResponse;
        const reply =
          typeof payload.reply === "string" && payload.reply.trim().length > 0
            ? payload.reply.trim()
            : "I did not receive a full reply just now. Please send that again and I will continue from the same context.";

        setCases((currentCases: MigrationCase[]) =>
          currentCases.map((migrationCase: MigrationCase) => {
            if (migrationCase.id !== caseId) {
              return migrationCase;
            }

            return {
              ...migrationCase,
              lastUpdated: "Just now",
              messages: appendMessage(migrationCase.messages, {
                type: "assistant",
                timestamp: assistantTimestamp,
                content: reply,
              }),
            };
          }),
        );
      } catch (error: unknown) {
        // Silently ignore aborted requests (component unmount or superseded call).
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCases((currentCases: MigrationCase[]) =>
          currentCases.map((migrationCase: MigrationCase) => {
            if (migrationCase.id !== caseId) {
              return migrationCase;
            }

            return {
              ...migrationCase,
              lastUpdated: "Just now",
              messages: appendMessage(migrationCase.messages, {
                type: "assistant",
                timestamp: assistantTimestamp,
                content:
                  "I could not reach the local assistant service right now. Please confirm Ollama is running, then retry and I will continue immediately.",
              }),
            };
          }),
        );
      } finally {
        abortControllersRef.current.delete(caseId);
        setPendingCaseIds((prev) => {
          const next = new Set(prev);
          next.delete(caseId);
          return next;
        });
      }
    })();
  };

  const uploadFiles = (
    caseId: string,
    category: WorkspaceUploadCategory,
    files: File[],
  ) => {
    const uploadWorkspaceId = serverWorkspaceId ?? activeWorkspaceId;

    if (files.length === 0) {
      return;
    }
    userInteractedRef.current = true;
    const targetCase = cases.find((c) => c.id === caseId);
    const categoryToBucket: Record<WorkspaceUploadCategory, string> = {
      EOI: "Registration",
      "Utility Bills": "Qualification",
      Proposal: "Commercials",
      "Term Sheet": "Legal",
    };
    const categoryToStatus: Record<WorkspaceUploadCategory, DocumentStatus> = {
      EOI: "signed",
      "Utility Bills": "received",
      Proposal: "available",
      "Term Sheet": "available",
    };
    const fileTypeFor = (name: string): DocumentSubmission["fileType"] => {
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "docx") return "DOCX";
      if (ext === "xlsx") return "XLSX";
      if (ext === "png" || ext === "jpg" || ext === "jpeg") return "PNG";
      return "PDF";
    };
    const formatSize = (bytes: number) => {
      const mb = bytes / (1024 * 1024);
      return mb >= 0.05 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    };
    const formData = new FormData();
    formData.set("workspaceId", uploadWorkspaceId);
    formData.set("caseId", caseId);
    formData.set("caseName", targetCase?.business.name ?? caseId);
    formData.set("category", category);
    for (const file of files) {
      formData.append("files", file, file.name);
    }

    void (async () => {
      try {
        const response = await fetch("/api/workspace/documents", {
          method: "POST",
          body: formData,
        });

        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };

        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? "Document upload failed.");
        }

        setCases((currentCases: MigrationCase[]) =>
          currentCases.map((migrationCase: MigrationCase) => {
            if (migrationCase.id !== caseId) {
              return migrationCase;
            }

            const timestamp = nowLabel();
            let nextDocuments = migrationCase.documents;
            for (const file of files) {
              const baseName = file.name.replace(/\.[^.]+$/, "");
              const submission: DocumentSubmission = {
                id: makeId("document"),
                title: `${category} — ${baseName}`,
                category: categoryToBucket[category],
                fileType: fileTypeFor(file.name),
                status: categoryToStatus[category],
                updatedAt: todayLabel(),
                size: formatSize(file.size),
                audience: "Client",
              };
              nextDocuments = withDocument(nextDocuments, submission);
            }

            const fileCount = files.length;
            const summary = files.map((file) => file.name).join(", ");
            const messages = appendMessage(migrationCase.messages, {
              type: "system",
              title: `${fileCount} ${category} file${fileCount === 1 ? "" : "s"} uploaded`,
              timestamp,
              content: `${summary} added to your migration workspace under ${category}.`,
            });
            const activity = appendActivity(migrationCase.activity, {
              title: `${category} upload (${fileCount})`,
              detail: summary,
              timestamp: timelineLabel(),
              tone: "client",
            });

            return {
              ...migrationCase,
              documents: nextDocuments,
              messages,
              activity,
              lastUpdated: "Just now",
            };
          }),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Document upload failed. Please try again.";
        setCases((currentCases: MigrationCase[]) =>
          currentCases.map((migrationCase: MigrationCase) => {
            if (migrationCase.id !== caseId) {
              return migrationCase;
            }

            return {
              ...migrationCase,
              messages: appendMessage(migrationCase.messages, {
                type: "system",
                title: `${category} upload failed`,
                timestamp: nowLabel(),
                content: message,
              }),
              activity: appendActivity(migrationCase.activity, {
                title: `${category} upload failed`,
                detail: message,
                timestamp: timelineLabel(),
                tone: "internal",
              }),
              lastUpdated: "Just now",
            };
          }),
        );
      }
    })();
  };

  const uploadDocument = (caseId: string, title: string) => {
    userInteractedRef.current = true;
    setCases((currentCases: MigrationCase[]) =>
      currentCases.map((migrationCase: MigrationCase) => {
        if (migrationCase.id !== caseId) {
          return migrationCase;
        }

        const timestamp = nowLabel();
        let nextCase = { ...migrationCase, lastUpdated: "Just now" };

        const sharedDocument: DocumentSubmission = {
          id: makeId("document"),
          title,
          category:
            title === EOI_TEMPLATE_TITLE || title === SIGNED_EOI_TITLE
              ? "Registration"
              : title === "Utility Bills"
              ? "Qualification"
              : title.includes("Term Sheet")
                ? "Legal"
                : title.includes("Proposal")
                  ? "Commercials"
                  : "Registration",
          fileType: title === EOI_TEMPLATE_TITLE ? "DOCX" : "PDF",
          status: title.includes("Signed")
            ? ("signed" as const)
            : title === "Utility Bills"
              ? ("received" as const)
              : ("available" as const),
          updatedAt: todayLabel(),
          size: title === EOI_TEMPLATE_TITLE ? "0.4 MB" : "1.4 MB",
          audience: "Client" as const,
        };

        nextCase.documents = withDocument(nextCase.documents, sharedDocument);
        nextCase.messages = appendMessage(nextCase.messages, {
          type: "system",
          title: `${title} uploaded`,
          timestamp,
          content: `${title} has been added to your migration workspace.`,
        });
        nextCase.activity = appendActivity(nextCase.activity, {
          title: `${title} uploaded`,
          detail: `Document received in the case workspace.`,
          timestamp: timelineLabel(),
          tone: "client",
        });

        if (title === EOI_TEMPLATE_TITLE) {
          nextCase.missingItems = ensureEoiMissingItem(nextCase.missingItems);
          if (stageIndex[nextCase.stage] <= stageIndex["Qualification In Progress"]) {
            nextCase = updateCaseStage(
              nextCase,
              "New",
              "Digitally sign and submit your Expression of Interest (EOI).",
            );
          }
          nextCase.messages = appendMessage(nextCase.messages, {
            type: "assistant",
            timestamp,
            content:
              "EOI template is ready. Next step is digital signature by the authorized signatory, then upload Signed Expression of Interest to submit on 1OS.",
          });
        }

        if (title === SIGNED_EOI_TITLE) {
          nextCase.missingItems = clearEoiMissingItems(nextCase.missingItems);
          if (stageIndex[nextCase.stage] <= stageIndex["Qualification In Progress"]) {
            nextCase = updateCaseStage(
              nextCase,
              "Registered",
              "EOI received. Upload your usage documents so 1OS can start qualification.",
            );
          }
          nextCase.messages = appendMessage(nextCase.messages, {
            type: "assistant",
            timestamp,
            content:
              "Signed EOI received and submitted on the 1OS platform. Registration is now complete and qualification is unlocked.",
          });
          nextCase.activity = appendActivity(nextCase.activity, {
            title: "EOI submitted",
            detail: "Signed EOI captured and registration confirmed.",
            timestamp: timelineLabel(),
            tone: "system",
          });
          nextCase.tasks = nextCase.tasks.map((task) =>
            /expression of interest|eoi/i.test(task.title) ? { ...task, status: "done" } : task,
          );
        }

        if (title === "Utility Bills") {
          if (requiresSignedEoi(nextCase)) {
            nextCase.missingItems = ensureEoiMissingItem(nextCase.missingItems);
            nextCase.messages = appendMessage(nextCase.messages, {
              type: "assistant",
              timestamp,
              content:
                "Utility bills are saved, but qualification cannot start until your signed EOI is submitted.",
            });
            nextCase.closeChecklist = reconcileChecklist(nextCase);
            return nextCase;
          }

          nextCase.missingItems = nextCase.missingItems.filter(
            (item) =>
              !item.toLowerCase().includes("utility") &&
              !item.toLowerCase().includes("interval"),
          );
          nextCase = updateCaseStage(
            nextCase,
            "Documents Under Review",
            "Your usage pack has been received and is now in 1OS review.",
          );
          nextCase.productRecommendation = productForCase(nextCase);
          nextCase.messages = appendMessage(nextCase.messages, {
            type: "assistant",
            timestamp,
            content:
              "Your usage pack is in. I have moved the case into 1OS review so we can confirm qualification and prepare your proposal path.",
          });
        }

        if (title === "Signed Proposal") {
          nextCase.missingItems = nextCase.missingItems.filter(
            (item) => item !== "Signed proposal",
          );
          nextCase.proposal = nextCase.proposal
            ? { ...nextCase.proposal, status: "signed", updatedAt: todayLabel() }
            : {
                id: makeId("proposal"),
                status: "signed",
                title: `${productForCase(nextCase)} Commercial Proposal`,
                summary: "Signed proposal received.",
                savingsRange: "Confirmed in signed pack",
                termYears: productForCase(nextCase) === "Generocity" ? 12 : 15,
                updatedAt: todayLabel(),
              };
          nextCase = updateCaseStage(
            nextCase,
            "Term Sheet Issued",
            "Your signed proposal has been received. 1OS is preparing the term sheet.",
          );
          nextCase.messages = appendMessage(nextCase.messages, {
            type: "assistant",
            timestamp,
            content:
              "Your signed proposal has been received. The next step is term sheet handling.",
          });
        }

        if (title === "Signed Term Sheet") {
          nextCase.missingItems = nextCase.missingItems.filter(
            (item) => item !== "Signed term sheet",
          );
          nextCase.termSheet = nextCase.termSheet
            ? { ...nextCase.termSheet, status: "signed", updatedAt: todayLabel() }
            : {
                id: makeId("term-sheet"),
                status: "signed",
                title: `${productForCase(nextCase)} Term Sheet`,
                summary: "Signed term sheet received.",
                updatedAt: todayLabel(),
              };
          nextCase = updateCaseStage(
            nextCase,
            "Internal Review",
            "Your signed term sheet is in. 1OS is completing the final review checks.",
          );
          nextCase.messages = appendMessage(nextCase.messages, {
            type: "assistant",
            timestamp,
            content:
              "Your signed term sheet has been received. I have moved the case into final 1OS review.",
          });
        }

        if (title === "Signed Service Acceptance") {
          nextCase.missingItems = nextCase.missingItems.filter(
            (item) => item !== "Signed service acceptance",
          );
        }

        nextCase.closeChecklist = reconcileChecklist(nextCase);
        return nextCase;
      }),
    );
  };

  const createBusinessCase = () => {
    userInteractedRef.current = true;
    const nextCase = createWorkspaceCase();

    setCases((currentCases: MigrationCase[]) => [...currentCases, nextCase]);
    setActiveCaseId(nextCase.id);

    return nextCase.id;
  };

  const updateBusinessProfile = (
    caseId: string,
    updates: Partial<MigrationCase["business"]>,
  ) => {
    userInteractedRef.current = true;
    setCases((currentCases: MigrationCase[]) =>
      currentCases.map((migrationCase: MigrationCase) =>
        migrationCase.id === caseId
          ? {
              ...migrationCase,
              lastUpdated: "Just now",
              business: mergeBusinessProfile(migrationCase.business, updates),
            }
          : migrationCase,
      ),
    );
  };

  const toggleTaskStatus = (caseId: string, taskId: string) => {
    userInteractedRef.current = true;
    setCases((currentCases: MigrationCase[]) =>
      currentCases.map((migrationCase: MigrationCase) => {
        if (migrationCase.id !== caseId) {
          return migrationCase;
        }

        const updatedTasks: TaskItem[] = migrationCase.tasks.map((task: TaskItem) =>
          task.id === taskId
            ? { ...task, status: task.status === "done" ? "open" : "done" }
            : task,
        );

        const nextCase = {
          ...migrationCase,
          lastUpdated: "Just now",
          tasks: updatedTasks,
        };

        nextCase.closeChecklist = reconcileChecklist(nextCase);
        return nextCase;
      }),
    );
  };

  const sortedCases = useMemo(() => [...cases].sort(sortRecentCases), [cases]);

  const value: WorkspaceContextValue = {
    activeWorkspaceId,
    workspaceId: serverWorkspaceId ?? activeWorkspaceId,
    activeCase,
    activeCaseId,
    cases: sortedCases,
    createBusinessCase,
    documentCentre,
    navCounts,
    pendingCaseIds,
    resources: RESOURCE_LIBRARY,
    userName: ACTIVE_USER_NAME,
    workspaceOptions: WORKSPACE_OPTIONS,
    setActiveCaseId,
    setActiveWorkspaceId,
    sendMessage,
    toggleTaskStatus,
    uploadDocument,
    uploadFiles,
    updateBusinessProfile,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider.");
  }

  return context;
}
