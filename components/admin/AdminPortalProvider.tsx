"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createDefaultAdminStateSnapshot, normalizeAdminStateSnapshot } from "@/lib/admin-state";
import { ADMIN_AGENTS } from "@/lib/admin-mock-data";
import {
  buildAdminLeadFromClientRegistration,
  buildAdminLeadStubFromSalesLead,
  findSignupShellLeadByEmail,
  promoteSignupLeadToClientRegistration,
  splitContactName,
} from "@/lib/client-registration";
import { makeId, timelineLabel } from "@/lib/formatting";
import { registrationLinkIdForProfile } from "@/lib/registration-links";
import {
  ADMIN_STORAGE_KEY,
  clearAdminStorageSnapshot,
  readAdminStorageSnapshot,
  writeAdminStorageSnapshot,
} from "@/lib/admin-storage";
import { isValidSouthAfricanCompanyRegistration } from "@/lib/company-registration";
import { adminLeadStages, adminLeadContactStatuses, salesLeadQualificationStages } from "@/lib/admin-types";
import {
  adminContactToQualification,
  qualificationToAdminContact,
} from "@/lib/lead-status-mapping";
import type {
  AdminAgent,
  AdminDocumentStatus,
  AdminLead,
  AdminLeadContactStatus,
  AdminLeadDocument,
  AdminLeadOrigin,
  AdminLeadPartner,
  AdminLeadPriority,
  AdminLeadStage,
  AdminLeadTask,
  AdminTaskOwner,
  PartnerOrg,
  SalesLead,
  SalesLeadQualificationStage,
} from "@/lib/admin-types";

type RegistrationDraft = never;

type CreateTaskInput = {
  title: string;
  owner: AdminTaskOwner;
  dueLabel: string;
};

type CreateLeadInput = {
  businessName: string;
  businessRegistrationNumber: string;
  industry: string;
  contactFirstName: string;
  contactSurname: string;
  contactPosition: string;
  contactEmail: string;
  contactNumber: string;
  monthlyElectricitySpendEstimateZar: number;
  isBusinessRegistered: boolean;
  isBusinessOperational: boolean;
  hasSixMonthUtilityBill: boolean;
  physicalAddress: string;
  city: string;
  province: string;
  source: AdminLead["source"];
  origin?: AdminLeadOrigin;
  partner?: AdminLeadPartner | null;
  partnerOrgId?: string | null;
  ownerId: string;
};

type CreateSalesLeadInput = {
  contactName: string;
  company: string;
  email: string;
  ownerId: string;
};

type CreateLeadShellInput = {
  contactName: string;
  company: string;
  email: string;
  ownerId: string;
  contactNumber?: string;
  industry?: string;
  source?: AdminLead["source"];
  origin?: AdminLeadOrigin;
  partner?: AdminLeadPartner | null;
};

type LeadShellImportInput = CreateLeadShellInput &
  Partial<UpdateLeadProfileInput> & {
    rowNumber: number;
  };

type UpdateLeadProfileInput = {
  company?: string;
  businessRegistrationNumber?: string;
  industry?: string;
  contactFirstName?: string;
  contactSurname?: string;
  contactPosition?: string;
  contactEmail?: string;
  contactNumber?: string;
  monthlyElectricitySpendEstimateZar?: number;
  isBusinessRegistered?: boolean;
  isBusinessOperational?: boolean;
  hasSixMonthUtilityBill?: boolean;
  physicalAddress?: string;
  city?: string;
  province?: string;
  source?: AdminLead["source"];
};

type ConvertSalesLeadToClientInput = {
  salesLeadId: string;
  businessName: string;
  businessRegistrationNumber: string;
  industry: string;
  contactFirstName: string;
  contactSurname: string;
  contactPosition: string;
  contactEmail: string;
  contactNumber: string;
  monthlyElectricitySpendEstimateZar: number;
  isBusinessRegistered: boolean;
  isBusinessOperational: boolean;
  hasSixMonthUtilityBill: boolean;
  physicalAddress: string;
  city: string;
  province: string;
  source: AdminLead["source"];
};

type UploadLeadDocumentInput = {
  file: File;
  title: string;
  category: string;
  status: AdminDocumentStatus;
};

type CreateLeadResult = {
  leadId: string;
  clientProfileId: string;
};

type AdminPortalContextValue = {
  agents: AdminAgent[];
  actorAgentId: string | null;
  leads: AdminLead[];
  salesLeads: SalesLead[];
  registrationDrafts: RegistrationDraft[];
  leadStages: readonly AdminLeadStage[];
  contactStatuses: readonly AdminLeadContactStatus[];
  salesLeadQualificationStages: readonly SalesLeadQualificationStage[];
  activeLeadId: string | null;
  activeLead: AdminLead | null;
  setActiveLeadId: (leadId: string | null) => void;
  updateLeadOwner: (leadId: string, ownerId: string) => void;
  updateLeadPartner: (leadId: string, partner: AdminLeadPartner | null) => void;
  updateLeadPriority: (leadId: string, priority: AdminLeadPriority) => void;
  updateLeadContactStatus: (leadId: string, status: AdminLeadContactStatus) => void;
  updateLeadStage: (leadId: string, stage: AdminLeadStage) => void;
  updateLeadNextAction: (leadId: string, nextAction: string) => void;
  addLeadNote: (leadId: string, note: string, author: string) => void;
  createLeadTask: (leadId: string, input: CreateTaskInput) => void;
  toggleLeadTask: (leadId: string, taskId: string) => void;
  createLead: (input: CreateLeadInput) => CreateLeadResult | null;
  createLeadShell: (input: CreateLeadShellInput) => CreateLeadResult | null;
  importLeadShells: (inputs: LeadShellImportInput[]) => {
    imported: number;
    failures: { row: number; reason: string }[];
  };
  updateLeadProfile: (leadId: string, input: UpdateLeadProfileInput) => void;
  createSalesLead: (input: CreateSalesLeadInput) => string | null;
  updateSalesLeadQualificationStage: (
    salesLeadId: string,
    stage: SalesLeadQualificationStage,
    reason?: string | null,
  ) => boolean;
  updateSalesLeadOwner: (salesLeadId: string, ownerId: string) => boolean;
  deleteSalesLead: (salesLeadId: string) => { ok: true } | { ok: false; error: string };
  convertSalesLeadToClient: (
    input: ConvertSalesLeadToClientInput,
  ) => CreateLeadResult | null;
  disqualifyLead: (leadId: string, reason: string, by: string) => void;
  generateLeadEoi: (leadId: string) => void;
  recordLeadEoiSignature: (leadId: string, signedBy?: string) => void;
  uploadLeadUtilityBills: (leadId: string) => void;
  issueLeadProposal: (leadId: string) => void;
  submitLeadProposal: (leadId: string) => void;
  issueLeadTermSheet: (leadId: string) => void;
  submitLeadTermSheet: (leadId: string) => void;
  recordLeadDocumentDownload: (
    leadId: string,
    documentTitle: string,
    downloadedBy: "Admin Team" | "Sales Team",
  ) => void;
  uploadLeadDocument: (leadId: string, input: UploadLeadDocumentInput) => Promise<boolean>;
  uploadLeadTermSheet: (leadId: string) => void;
  completeLeadOnboarding: (leadId: string) => void;
  saveStatus: SaveStatus;
  syncBackend: "loading" | "supabase" | "local";
  retrySave: () => void;
};

const AdminPortalContext = createContext<AdminPortalContextValue | null>(null);

function buildEoiSigningToken(companyName: string) {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  return `eoi-${slug || "client"}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateLeadById(
  leads: AdminLead[],
  leadId: string,
  updater: (lead: AdminLead) => AdminLead,
) {
  return leads.map((lead) => (lead.id === leadId ? updater(lead) : lead));
}

function diffById<T extends { id: string }>(
  next: T[],
  baseline: Map<string, T>,
): { upserts: T[]; deletes: string[] } {
  const upserts: T[] = [];
  const seenIds = new Set<string>();
  for (const item of next) {
    seenIds.add(item.id);
    const prior = baseline.get(item.id);
    if (!prior || prior !== item) {
      upserts.push(item);
    }
  }
  const deletes: string[] = [];
  for (const id of baseline.keys()) {
    if (!seenIds.has(id)) deletes.push(id);
  }
  return { upserts, deletes };
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const TERMINAL_STAGES = new Set<AdminLeadStage>([
  "Onboarding Complete",
  "Disqualified",
]);
const STAGE_RANK: Record<AdminLeadStage, number> = {
  "Client Registered": 0,
  "EOI Generated": 1,
  "EOI Signed": 2,
  "Utility Bills Uploaded": 3,
  "Compliance Pack Uploaded": 4,
  "Term Sheet Uploaded": 5,
  "Onboarding Complete": 6,
  Disqualified: 7,
};

function promoteStage(
  currentStage: AdminLeadStage,
  targetStage: AdminLeadStage,
): AdminLeadStage {
  return STAGE_RANK[currentStage] >= STAGE_RANK[targetStage]
    ? currentStage
    : targetStage;
}

const DOC_TITLE_EOI = "Expression of Interest";
const DOC_TITLE_SIGNED_EOI = "Signed Expression of Interest";
const DOC_TITLE_UTILITY_BILLS = "6-Month Utility Bill Pack";
const DOC_TITLE_PROPOSAL_ISSUED = "Proposal (Admin Issued)";
const DOC_TITLE_PROPOSAL_SIGNED = "Signed Proposal";
const DOC_TITLE_TERM_SHEET_ISSUED = "Term Sheet (Admin Issued)";
const DOC_TITLE_TERM_SHEET_SIGNED = "Signed Term Sheet";

const COMPLIANCE_PACK_NEXT_ACTION =
  "Request the Generocity compliance pack from the client: " +
  "(1) Company registration documents (the contracting entity for UFMS), " +
  "(2) FICA pack — director ID + proof of residence, " +
  "(3) Latest audited financial statements, " +
  "(4) Latest management accounts, " +
  "(5) Last 6 months bank statements, " +
  "(6) Valid tax clearance certificate.";

function ensureRegistrationTasks(tasks: AdminLeadTask[]) {
  const existingTitles = new Set(tasks.map((task) => task.title));
  const required: Array<Pick<AdminLeadTask, "title" | "owner" | "dueLabel" | "status">> = [
    {
      title: "Submit signed EOI",
      owner: "Client",
      dueLabel: "Today",
      status: "open",
    },
    {
      title: "Upload 6-month utility bill pack",
      owner: "Agent",
      dueLabel: "Today",
      status: "open",
    },
    {
      title: "Submit signed proposal",
      owner: "Agent",
      dueLabel: "Today",
      status: "open",
    },
    {
      title: "Submit signed term sheet",
      owner: "Agent",
      dueLabel: "Today",
      status: "open",
    },
  ];

  return [
    ...tasks,
    ...required
      .filter((task) => !existingTitles.has(task.title))
      .map((task) => ({ ...task, id: makeId("task") })),
  ];
}

function upsertDocument(
  lead: AdminLead,
  document: Omit<AdminLeadDocument, "id"> & { id?: string },
) {
  const existing = lead.documents.find((entry) => entry.title === document.title);
  const nextDocument: AdminLeadDocument = {
    ...existing,
    id: existing?.id ?? document.id ?? makeId("doc"),
    ...document,
    storagePath: document.storagePath ?? existing?.storagePath ?? null,
    fileName: document.fileName ?? existing?.fileName ?? null,
    contentType: document.contentType ?? existing?.contentType ?? null,
  };

  if (!existing) {
    return [nextDocument, ...lead.documents];
  }

  return lead.documents.map((entry) =>
    entry.id === existing.id ? nextDocument : entry,
  );
}

function setTaskStatus(
  lead: AdminLead,
  title: string,
  done: boolean,
): AdminLead["tasks"] {
  return lead.tasks.map((task) =>
    task.title === title
      ? {
          ...task,
          status: done ? ("done" as const) : ("open" as const),
        }
      : task,
  );
}

export function AdminPortalProvider({
  children,
  actorRole = null,
  actorEmail = null,
  actorName = null,
  actorAgentId = null,
  includeSalesLeads = true,
  includeRegistrationDrafts = true,
  leadOwnerScopeId = null,
}: {
  children: ReactNode;
  actorRole?: "admin" | "sales" | "partner" | null;
  actorEmail?: string | null;
  actorName?: string | null;
  actorAgentId?: string | null;
  includeSalesLeads?: boolean;
  includeRegistrationDrafts?: boolean;
  leadOwnerScopeId?: string | null;
}) {
  const scopedOwnerId = leadOwnerScopeId?.trim() || null;
  const initialSnapshot = createDefaultAdminStateSnapshot();
  const [leads, setLeads] = useState<AdminLead[]>(
    () => initialSnapshot.leads,
  );
  const [salesLeads, setSalesLeads] = useState<SalesLead[]>(
    () => initialSnapshot.salesLeads,
  );
  const [registrationDrafts, setRegistrationDrafts] = useState<RegistrationDraft[]>([]);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [syncBackend, setSyncBackend] = useState<"loading" | "supabase" | "local">(
    "loading",
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Server-authoritative baseline used for delta-diffing on every persist.
  const leadsBaselineRef = useRef<Map<string, AdminLead>>(new Map());
  const salesLeadsBaselineRef = useRef<Map<string, SalesLead>>(new Map());
  // Coalesce rapid mutations.
  const pendingPersistRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef(false);
  const dirtyRef = useRef(false);
  const latestSnapshotRef = useRef<{
    leads: AdminLead[];
    salesLeads: SalesLead[];
  }>({ leads: initialSnapshot.leads, salesLeads: initialSnapshot.salesLeads });

  const activeLead = leads.find((lead) => lead.id === activeLeadId) ?? null;

  const applyLeadScope = useCallback((snapshot: {
    leads: AdminLead[];
    salesLeads: SalesLead[];
    activeLeadId: string | null;
    partnerOrgs?: PartnerOrg[];
  }) => {
    const scopedLeads = scopedOwnerId
      ? snapshot.leads.filter((lead) => lead.ownerId === scopedOwnerId)
      : snapshot.leads;
    const scopedActiveLeadId = scopedLeads.some((lead) => lead.id === snapshot.activeLeadId)
      ? snapshot.activeLeadId
      : scopedLeads[0]?.id ?? null;

    return {
      ...snapshot,
      leads: scopedLeads,
      activeLeadId: scopedActiveLeadId,
      salesLeads: includeSalesLeads ? snapshot.salesLeads : [],
    };
  }, [includeSalesLeads, scopedOwnerId]);

  const clearSaveStatusIdleTimer = () => {
    if (saveStatusIdleTimerRef.current) {
      clearTimeout(saveStatusIdleTimerRef.current);
      saveStatusIdleTimerRef.current = null;
    }
  };

  const setSaveStatusWithAutoIdle = (status: SaveStatus) => {
    clearSaveStatusIdleTimer();
    setSaveStatus(status);
    if (status === "saved") {
      saveStatusIdleTimerRef.current = setTimeout(() => {
        saveStatusIdleTimerRef.current = null;
        setSaveStatus("idle");
      }, 1800);
    }
  };

  useEffect(() => {
    return () => {
      clearSaveStatusIdleTimer();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRemoteState = async () => {
      try {
        const url = new URL("/api/admin/state", window.location.origin);
        if (!includeSalesLeads) {
          url.searchParams.set("includeSalesLeads", "0");
        }
        if (!includeRegistrationDrafts) {
          url.searchParams.set("includeRegistrationDrafts", "0");
        }
        const response = await fetch(url.toString(), {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`State load failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          ok?: boolean;
          backend?: "supabase" | "local";
          snapshot?: unknown;
          registrationDrafts?: RegistrationDraft[];
        };

        if (!payload.ok) {
          throw new Error("State load returned non-ok payload.");
        }

        const serverSnapshot = normalizeAdminStateSnapshot(payload.snapshot);
        const backend = payload.backend === "supabase" ? "supabase" : "local";
        const localSnapshot = backend === "local" ? readAdminStorageSnapshot() : null;
        const rawSnapshot = localSnapshot ?? serverSnapshot;
        const snapshot = rawSnapshot ? applyLeadScope(rawSnapshot) : null;
        if (!cancelled && snapshot) {
          // Server is the single source of truth. Replace local state outright
          // so admin wipes / deletions actually clear the dashboard instead of
          // resurrecting stale records cached in this browser's localStorage.
          setLeads(() => {
            latestSnapshotRef.current = {
              ...latestSnapshotRef.current,
              leads: snapshot.leads,
            };
            return snapshot.leads;
          });
          setSalesLeads(() => {
            latestSnapshotRef.current = {
              ...latestSnapshotRef.current,
              salesLeads: snapshot.salesLeads,
            };
            return snapshot.salesLeads;
          });
          setActiveLeadId(snapshot.activeLeadId);

          // Baseline tracks ONLY what the server has confirmed.
          leadsBaselineRef.current = new Map(
            snapshot.leads.map((lead) => [lead.id, lead]),
          );
          salesLeadsBaselineRef.current = new Map(
            snapshot.salesLeads.map((lead) => [lead.id, lead]),
          );
          setRegistrationDrafts(
            Array.isArray(payload.registrationDrafts) ? payload.registrationDrafts : [],
          );

          if (backend === "supabase") {
            clearAdminStorageSnapshot();
          } else {
            writeAdminStorageSnapshot({
              leads: snapshot.leads,
              salesLeads: snapshot.salesLeads,
              partnerOrgs: snapshot.partnerOrgs ?? [],
              activeLeadId: snapshot.activeLeadId,
            });
          }
        }

        if (!cancelled) {
          setSyncBackend(backend);
        }
      } catch {
        if (!cancelled) {
          const rawLocalSnapshot = readAdminStorageSnapshot();
          const localSnapshot = rawLocalSnapshot ? applyLeadScope(rawLocalSnapshot) : null;
          if (localSnapshot) {
            setLeads(localSnapshot.leads);
            setSalesLeads(localSnapshot.salesLeads);
            setActiveLeadId(localSnapshot.activeLeadId);
            latestSnapshotRef.current = {
              leads: localSnapshot.leads,
              salesLeads: localSnapshot.salesLeads,
            };
          }
          setSyncBackend("local");
        }
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    void loadRemoteState();

    return () => {
      cancelled = true;
    };
  }, [applyLeadScope, includeRegistrationDrafts, includeSalesLeads, scopedOwnerId]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (syncBackend !== "local") {
      return;
    }

    const snapshot = { leads, salesLeads, activeLeadId };
    writeAdminStorageSnapshot(snapshot);
  }, [activeLeadId, isHydrated, leads, salesLeads, syncBackend]);

  const persistDeltaNow = async () => {
    if (inflightRef.current) {
      // Will be re-triggered by the dirtyRef flag once the inflight call returns.
      dirtyRef.current = true;
      return;
    }

    if (syncBackend !== "supabase") {
      return;
    }

    const { leads: nextLeads, salesLeads: nextSalesLeads } =
      latestSnapshotRef.current;

    const leadDelta = diffById(nextLeads, leadsBaselineRef.current);
    const salesDelta = includeSalesLeads
      ? diffById(nextSalesLeads, salesLeadsBaselineRef.current)
      : { upserts: [], deletes: [] };

    if (
      leadDelta.upserts.length === 0 &&
      leadDelta.deletes.length === 0 &&
      salesDelta.upserts.length === 0 &&
      salesDelta.deletes.length === 0
    ) {
      return;
    }

    inflightRef.current = true;
    dirtyRef.current = false;
    setSaveStatusWithAutoIdle("saving");

    try {
      const response = await fetch("/api/admin/state/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          leadUpserts: leadDelta.upserts,
          leadDeletes: leadDelta.deletes,
          salesLeadUpserts: salesDelta.upserts,
          salesLeadDeletes: salesDelta.deletes,
        }),
      });

      if (!response.ok) {
        console.error(
          "[AdminPortal] mutate endpoint failed",
          response.status,
        );
        setSaveStatusWithAutoIdle("error");
        setSyncBackend("local");
        return;
      }

      const payload = (await response.json()) as {
        ok?: boolean;
        snapshot?: unknown;
      };

      const snapshot = normalizeAdminStateSnapshot(payload.snapshot);
      if (snapshot) {
        const scopedSnapshot = applyLeadScope(snapshot);
        // Re-baseline against the server's authoritative response.
        leadsBaselineRef.current = new Map(
          scopedSnapshot.leads.map((lead) => [lead.id, lead]),
        );
        if (includeSalesLeads) {
          salesLeadsBaselineRef.current = new Map(
            scopedSnapshot.salesLeads.map((lead) => [lead.id, lead]),
          );
        }
      }

      setSaveStatusWithAutoIdle("saved");
    } catch (error) {
      console.error("[AdminPortal] mutate endpoint threw", error);
      setSaveStatusWithAutoIdle("error");
      setSyncBackend("local");
    } finally {
      inflightRef.current = false;
      // If more edits arrived during the inflight call, persist them now.
      if (dirtyRef.current) {
        void persistDeltaNow();
      }
    }
  };

  const schedulePersist = () => {
    if (pendingPersistRef.current) {
      clearTimeout(pendingPersistRef.current);
    }
    // Coalesce sub-200ms bursts of mutations into a single network call.
    pendingPersistRef.current = setTimeout(() => {
      pendingPersistRef.current = null;
      void persistDeltaNow();
    }, 150);
  };

  const persistSnapshotImmediately = (snapshot: {
    leads: AdminLead[];
    salesLeads: SalesLead[];
    activeLeadId: string | null;
  }) => {
    if (syncBackend === "local") {
      writeAdminStorageSnapshot(snapshot);
    }
    latestSnapshotRef.current = {
      leads: snapshot.leads,
      salesLeads: snapshot.salesLeads,
    };
    dirtyRef.current = true;
    schedulePersist();
  };

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (syncBackend !== "local") {
        return;
      }

      if (event.key !== ADMIN_STORAGE_KEY) {
        return;
      }

      const snapshot = readAdminStorageSnapshot();
      if (!snapshot) {
        return;
      }

      setLeads(snapshot.leads);
      setSalesLeads(snapshot.salesLeads);
      setActiveLeadId(snapshot.activeLeadId);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [syncBackend]);

  useEffect(() => {
    if (!activeLeadId) {
      setActiveLeadId(leads[0]?.id ?? null);
      return;
    }

    if (!leads.some((lead) => lead.id === activeLeadId)) {
      setActiveLeadId(leads[0]?.id ?? null);
    }
  }, [activeLeadId, leads]);

  const commitLeads = (
    updater: (current: AdminLead[]) => AdminLead[],
    nextActiveLeadId = activeLeadId,
  ) => {
    setLeads((current) => {
      const nextLeads = updater(current);
      persistSnapshotImmediately({
        leads: nextLeads,
        salesLeads,
        activeLeadId: nextActiveLeadId,
      });
      return nextLeads;
    });
  };

  const updateLeadOwner = (leadId: string, ownerId: string) => {
    let linkedSalesLeadId: string | null = null;
    setLeads((current) => {
      const nextLeads = updateLeadById(current, leadId, (lead) => {
        linkedSalesLeadId = lead.linkedSalesLeadId;
        return {
          ...lead,
          ownerId,
          lastTouched: "Just now",
          events: [
            {
              id: makeId("event"),
              title: "Owner updated",
              detail: `Lead reassigned in admin portal.`,
              createdAt: timelineLabel(),
              tone: "system" as const,
            },
            ...lead.events,
          ],
        };
      });

      const timestamp = new Date().toISOString();
      const nextSalesLeads = linkedSalesLeadId
        ? salesLeads.map((sLead) =>
            sLead.id === linkedSalesLeadId && sLead.ownerId !== ownerId
              ? { ...sLead, ownerId, lastUpdatedAt: timestamp }
              : sLead,
          )
        : salesLeads;

      if (nextSalesLeads !== salesLeads) {
        setSalesLeads(nextSalesLeads);
      }

      persistSnapshotImmediately({
        leads: nextLeads,
        salesLeads: nextSalesLeads,
        activeLeadId,
      });

      return nextLeads;
    });
  };

  const updateLeadPartner = (leadId: string, partner: AdminLeadPartner | null) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => ({
        ...lead,
        partner,
        lastTouched: "Just now",
        events: [
          {
            id: makeId("event"),
            title: "Partner updated",
            detail: partner ? `Partner set to ${partner}.` : "Partner cleared.",
            createdAt: timelineLabel(),
            tone: "system",
          },
          ...lead.events,
        ],
      })),
    );
  };

  const updateLeadContactStatus = (leadId: string, status: AdminLeadContactStatus) => {
    let targetEmail = "";
    let targetOwnerId = "";
    let linkedSalesLeadId: string | null = null;

    setLeads((current) => {
      const nextLeads = updateLeadById(current, leadId, (lead) => {
        targetEmail = lead.userProfile.email.trim().toLowerCase();
        targetOwnerId = lead.ownerId;
        linkedSalesLeadId = lead.linkedSalesLeadId;
        return {
          ...lead,
          contactStatus: status,
          lastTouched: "Just now",
          events: [
            {
              id: makeId("event"),
              title: "Contact status updated",
              detail: `Marked as ${status}.`,
              createdAt: timelineLabel(),
              tone: "system",
            },
            ...lead.events,
          ],
        };
      });

      const mappedQualification = adminContactToQualification(status);
      const timestamp = new Date().toISOString();
      const matches = (sLead: SalesLead) => {
        if (linkedSalesLeadId) return sLead.id === linkedSalesLeadId;
        if (sLead.email.trim().toLowerCase() !== targetEmail) return false;
        if (targetOwnerId && sLead.ownerId !== targetOwnerId) return false;
        return true;
      };
      const nextSalesLeads = mappedQualification
        ? salesLeads.map((sLead) => {
            if (sLead.status !== "Open") return sLead;
            if (!matches(sLead)) return sLead;
            if (sLead.qualificationStage === mappedQualification) return sLead;
            if (
              mappedQualification === "Not Interested" &&
              !sLead.qualificationReason
            ) {
              return {
                ...sLead,
                qualificationStage: mappedQualification,
                qualificationReason: `Mirrored from admin contact status: ${status}.`,
                lastUpdatedAt: timestamp,
              };
            }
            return {
              ...sLead,
              qualificationStage: mappedQualification,
              lastUpdatedAt: timestamp,
            };
          })
        : salesLeads;

      if (nextSalesLeads !== salesLeads) {
        setSalesLeads(nextSalesLeads);
      }

      persistSnapshotImmediately({
        leads: nextLeads,
        salesLeads: nextSalesLeads,
        activeLeadId,
      });

      return nextLeads;
    });
  };

  const updateLeadPriority = (leadId: string, priority: AdminLeadPriority) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => ({
        ...lead,
        priority,
        lastTouched: "Just now",
        events: [
          {
            id: makeId("event"),
            title: "Priority updated",
            detail: `Priority moved to ${priority}.`,
            createdAt: timelineLabel(),
            tone: "system",
          },
          ...lead.events,
        ],
      })),
    );
  };

  const updateLeadStage = (leadId: string, stage: AdminLeadStage) => {
    let linkedSalesLeadId: string | null = null;

    setLeads((current) => {
      const nextLeads = updateLeadById(current, leadId, (lead) => {
        linkedSalesLeadId = lead.linkedSalesLeadId;
        const onboardingCompletedAt =
          stage === "Onboarding Complete"
            ? lead.onboardingCompletedAt ?? new Date().toISOString()
            : null;

        return {
          ...lead,
          stage,
          onboardingCompletedAt,
          lastTouched: "Just now",
          events: [
            {
              id: makeId("event"),
              title: "Lifecycle stage updated",
              detail: `Lead moved to ${stage}.`,
              createdAt: timelineLabel(),
              tone: "agent",
            },
            ...lead.events,
          ],
        };
      });

      const timestamp = new Date().toISOString();
      const nextSalesLeads = linkedSalesLeadId
        ? salesLeads.map((sLead) => {
            if (sLead.id !== linkedSalesLeadId) return sLead;
            if (stage === "Onboarding Complete") {
              return {
                ...sLead,
                qualificationStage: "Qualifies" as const,
                status: "Converted" as const,
                lastUpdatedAt: timestamp,
              };
            }
            if (stage === "Disqualified") {
              return {
                ...sLead,
                qualificationStage: "Does Not Qualify" as const,
                qualificationReason:
                  sLead.qualificationReason ??
                  "Disqualified from admin lifecycle.",
                status: "Converted" as const,
                lastUpdatedAt: timestamp,
              };
            }
            return sLead;
          })
        : salesLeads;

      if (nextSalesLeads !== salesLeads) {
        setSalesLeads(nextSalesLeads);
      }

      persistSnapshotImmediately({
        leads: nextLeads,
        salesLeads: nextSalesLeads,
        activeLeadId,
      });

      return nextLeads;
    });
  };

  const updateLeadNextAction = (leadId: string, nextAction: string) => {
    const trimmed = nextAction.trim();
    if (!trimmed) {
      return;
    }

    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => ({
        ...lead,
        nextAction: trimmed,
        lastTouched: "Just now",
      })),
    );
  };

  const addLeadNote = (leadId: string, note: string, author: string) => {
    const trimmed = note.trim();
    if (!trimmed) {
      return;
    }

    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => ({
        ...lead,
        lastTouched: "Just now",
        notes: [
          {
            id: makeId("note"),
            body: trimmed,
            author,
            createdAt: timelineLabel(),
          },
          ...lead.notes,
        ],
        events: [
          {
            id: makeId("event"),
            title: "Internal note added",
            detail: trimmed,
            createdAt: timelineLabel(),
            tone: "agent",
          },
          ...lead.events,
        ],
      })),
    );
  };

  const createLeadTask = (leadId: string, input: CreateTaskInput) => {
    const title = input.title.trim();
    const dueLabel = input.dueLabel.trim();

    if (!title || !dueLabel) {
      return;
    }

    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => ({
        ...lead,
        lastTouched: "Just now",
        tasks: [
          {
            id: makeId("task"),
            title,
            owner: input.owner,
            dueLabel,
            status: "open",
          },
          ...lead.tasks,
        ],
        events: [
          {
            id: makeId("event"),
            title: "Follow-up task created",
            detail: `${title} (${input.owner}, due ${dueLabel}).`,
            createdAt: timelineLabel(),
            tone: "system",
          },
          ...lead.events,
        ],
      })),
    );
  };

  const toggleLeadTask = (leadId: string, taskId: string) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => ({
        ...lead,
        lastTouched: "Just now",
        tasks: lead.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: task.status === "done" ? "open" : "done",
              }
            : task,
        ),
      })),
    );
  };

  const createLead = (input: CreateLeadInput): CreateLeadResult | null => {
    const registrationSource =
      actorRole && actorEmail && actorName
        ? {
            linkId: registrationLinkIdForProfile({
              email: actorEmail,
              role: actorRole,
              agentId: actorAgentId,
            }),
            profileName: actorName,
            profileRole: actorRole,
            profileAgentId: actorAgentId,
            channel: "dashboard" as const,
          }
        : null;
    const registrationInput = {
      ...input,
      origin: input.origin ?? "created",
      registrationSource,
    } as const;
    const existingSignupShell = findSignupShellLeadByEmail(leads, input.contactEmail);
    const created = existingSignupShell
      ? promoteSignupLeadToClientRegistration(existingSignupShell, registrationInput)
      : buildAdminLeadFromClientRegistration(registrationInput);

    if (!created) {
      return null;
    }

    setLeads((current) => {
      const nextLeads = existingSignupShell
        ? [created.lead, ...current.filter((lead) => lead.id !== existingSignupShell.id)]
        : [created.lead, ...current];
      persistSnapshotImmediately({
        leads: nextLeads,
        salesLeads,
        activeLeadId: created.leadId,
      });
      return nextLeads;
    });
    setActiveLeadId(created.leadId);
    return {
      leadId: created.leadId,
      clientProfileId: created.clientProfileId,
    };
  };

  const createLeadShell = (input: CreateLeadShellInput): CreateLeadResult | null => {
    const contactName = input.contactName.trim();
    const company = input.company.trim();
    const email = input.email.trim().toLowerCase();
    const ownerId = input.ownerId.trim();
    const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!contactName || !company || !hasValidEmail || !ownerId) {
      return null;
    }

    const existingLead = leads.find(
      (lead) => lead.userProfile.email.trim().toLowerCase() === email,
    );
    if (existingLead) {
      setActiveLeadId(existingLead.id);
      return {
        leadId: existingLead.id,
        clientProfileId: existingLead.clientProfileId,
      };
    }

    const created = buildAdminLeadStubFromSalesLead({
      contactName,
      company,
      email,
      ownerId,
      origin: input.origin ?? "created",
    });

    if (!created) {
      return null;
    }

    const nextLead: AdminLead = {
      ...created.lead,
      contactPosition: created.lead.contactPosition || "Decision Maker",
      industry: input.industry?.trim() ?? created.lead.industry,
      source: input.source ?? created.lead.source,
      partner: input.partner ?? created.lead.partner,
      userProfile: {
        ...created.lead.userProfile,
        phone: input.contactNumber?.trim() ?? created.lead.userProfile.phone,
      },
    };

    setLeads((current) => {
      const nextLeads = [nextLead, ...current];
      persistSnapshotImmediately({
        leads: nextLeads,
        salesLeads,
        activeLeadId: nextLead.id,
      });
      return nextLeads;
    });
    setActiveLeadId(nextLead.id);

    return {
      leadId: nextLead.id,
      clientProfileId: nextLead.clientProfileId,
    };
  };

  const importLeadShells = (inputs: LeadShellImportInput[]) => {
    const importedLeads: AdminLead[] = [];
    const failures: { row: number; reason: string }[] = [];
    const seenEmails = new Set(
      leads.map((lead) => lead.userProfile.email.trim().toLowerCase()).filter(Boolean),
    );

    for (const input of inputs) {
      const contactName = input.contactName.trim() || input.company.trim();
      const company = input.company.trim();
      const email = input.email.trim().toLowerCase();
      const ownerId = input.ownerId.trim();
      const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      if (!contactName || !company || !hasValidEmail || !ownerId) {
        failures.push({
          row: input.rowNumber,
          reason: "Company and valid Email are required",
        });
        continue;
      }

      if (seenEmails.has(email)) {
        failures.push({
          row: input.rowNumber,
          reason: "A lead profile with this email already exists",
        });
        continue;
      }

      const created = buildAdminLeadStubFromSalesLead({
        contactName,
        company,
        email,
        ownerId,
        origin: input.origin ?? "imported",
      });

      if (!created) {
        failures.push({
          row: input.rowNumber,
          reason: "Could not create lead profile",
        });
        continue;
      }

      const contactFirstName =
        input.contactFirstName?.trim() ||
        created.lead.contactFirstName ||
        contactName.split(/\s+/)[0] ||
        "";
      const contactSurname =
        input.contactSurname?.trim() ||
        created.lead.contactSurname ||
        contactName.split(/\s+/).slice(1).join(" ");
      const contactPosition =
        input.contactPosition?.trim() ||
        created.lead.contactPosition ||
        "Decision Maker";
      const contactNumber = input.contactNumber?.trim() ?? created.lead.userProfile.phone;
      const monthlyElectricitySpendEstimateZar =
        typeof input.monthlyElectricitySpendEstimateZar === "number" &&
        Number.isFinite(input.monthlyElectricitySpendEstimateZar)
          ? Math.max(0, Math.round(input.monthlyElectricitySpendEstimateZar))
          : created.lead.monthlyElectricitySpendEstimateZar;

      const nextLead: AdminLead = {
        ...created.lead,
        businessRegistrationNumber:
          input.businessRegistrationNumber?.trim() ?? created.lead.businessRegistrationNumber,
        industry: input.industry?.trim() ?? created.lead.industry,
        contactFirstName,
        contactSurname,
        contactPosition,
        contactName: [contactFirstName, contactSurname].filter(Boolean).join(" ") || contactName,
        monthlyElectricitySpendEstimateZar,
        isBusinessRegistered: input.isBusinessRegistered ?? created.lead.isBusinessRegistered,
        isBusinessOperational: input.isBusinessOperational ?? created.lead.isBusinessOperational,
        hasSixMonthUtilityBill: input.hasSixMonthUtilityBill ?? created.lead.hasSixMonthUtilityBill,
        physicalAddress: input.physicalAddress?.trim() ?? created.lead.physicalAddress,
        city: input.city?.trim() ?? created.lead.city,
        province: input.province?.trim() ?? created.lead.province,
        source: input.source ?? created.lead.source,
        partner: input.partner ?? created.lead.partner,
        userProfile: {
          ...created.lead.userProfile,
          fullName: [contactFirstName, contactSurname].filter(Boolean).join(" ") || contactName,
          email,
          phone: contactNumber,
          role: contactPosition,
        },
      };

      importedLeads.push(nextLead);
      seenEmails.add(email);
    }

    if (importedLeads.length > 0) {
      const nextLeads = [...importedLeads, ...leads];
      const nextActiveLeadId = importedLeads[0].id;
      setLeads(nextLeads);
      setActiveLeadId(nextActiveLeadId);
      persistSnapshotImmediately({
        leads: nextLeads,
        salesLeads,
        activeLeadId: nextActiveLeadId,
      });
    }

    return {
      imported: importedLeads.length,
      failures,
    };
  };

  const updateLeadProfile = (leadId: string, input: UpdateLeadProfileInput) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => {
        const company = input.company !== undefined ? input.company.trim() : lead.company;
        const businessRegistrationNumber =
          input.businessRegistrationNumber !== undefined
            ? input.businessRegistrationNumber.trim()
            : lead.businessRegistrationNumber;
        const industry = input.industry !== undefined ? input.industry.trim() : lead.industry;
        const contactFirstName =
          input.contactFirstName !== undefined
            ? input.contactFirstName.trim()
            : lead.contactFirstName ?? "";
        const contactSurname =
          input.contactSurname !== undefined
            ? input.contactSurname.trim()
            : lead.contactSurname ?? "";
        const contactPosition =
          input.contactPosition !== undefined
            ? input.contactPosition.trim()
            : lead.contactPosition ?? lead.userProfile.role;
        const contactEmail =
          input.contactEmail !== undefined
            ? input.contactEmail.trim().toLowerCase()
            : lead.userProfile.email;
        const contactNumber =
          input.contactNumber !== undefined
            ? input.contactNumber.trim()
            : lead.userProfile.phone;
        const monthlyElectricitySpendEstimateZar =
          input.monthlyElectricitySpendEstimateZar !== undefined &&
          Number.isFinite(input.monthlyElectricitySpendEstimateZar)
            ? Math.max(0, Math.round(input.monthlyElectricitySpendEstimateZar))
            : lead.monthlyElectricitySpendEstimateZar;
        const isBusinessRegistered =
          input.isBusinessRegistered ?? lead.isBusinessRegistered;
        const isBusinessOperational =
          input.isBusinessOperational ?? lead.isBusinessOperational;
        const hasSixMonthUtilityBill =
          input.hasSixMonthUtilityBill ?? lead.hasSixMonthUtilityBill;
        const physicalAddress =
          input.physicalAddress !== undefined
            ? input.physicalAddress.trim()
            : lead.physicalAddress;
        const city = input.city !== undefined ? input.city.trim() : lead.city;
        const province =
          input.province !== undefined ? input.province.trim() : lead.province;
        const contactName =
          [contactFirstName, contactSurname].filter(Boolean).join(" ") ||
          lead.contactName;
        const registrationComplete = Boolean(
          company &&
            isValidSouthAfricanCompanyRegistration(businessRegistrationNumber) &&
            industry &&
            contactFirstName &&
            contactSurname &&
            contactPosition &&
            contactEmail &&
            contactNumber &&
            physicalAddress &&
            city &&
            province &&
            monthlyElectricitySpendEstimateZar >= 10_000 &&
            isBusinessRegistered &&
            isBusinessOperational,
        );
        const completedNow = registrationComplete && !lead.isClientRegistered;
        const nextStage =
          registrationComplete && !TERMINAL_STAGES.has(lead.stage)
            ? promoteStage(lead.stage, "EOI Generated")
            : lead.stage;
        const eoiSigningToken =
          registrationComplete
            ? lead.eoiSigningToken ?? buildEoiSigningToken(company)
            : lead.eoiSigningToken;

        return {
          ...lead,
          company,
          businessRegistrationNumber,
          industry,
          contactFirstName,
          contactSurname,
          contactPosition,
          contactName,
          monthlyElectricitySpendEstimateZar,
          isBusinessRegistered,
          isClientRegistered: lead.isClientRegistered || registrationComplete,
          isBusinessOperational,
          hasSixMonthUtilityBill,
          physicalAddress,
          city,
          province,
          source: input.source ?? lead.source,
          stage: nextStage,
          readinessScore: registrationComplete
            ? Math.max(lead.readinessScore, hasSixMonthUtilityBill ? 45 : 40)
            : lead.readinessScore,
          lastTouched: "Just now",
          nextAction: completedNow
            ? "Send the EOI template link and request the signed EOI on company letterhead."
            : lead.nextAction,
          migrateAccountName: company || lead.migrateAccountName,
          eoiSigningToken,
          userProfile: {
            ...lead.userProfile,
            fullName: contactName,
            email: contactEmail,
            phone: contactNumber,
            role: contactPosition,
          },
          tasks: completedNow ? ensureRegistrationTasks(lead.tasks) : lead.tasks,
          events: [
            {
              id: makeId("event"),
              title: completedNow ? "Lead registration completed" : "Profile updated",
              detail: completedNow
                ? "Pre-qualified lead details completed in the profile."
                : "Lead profile details updated.",
              createdAt: timelineLabel(),
              tone: "system",
            },
            ...lead.events,
          ],
        };
      }),
    );
  };

  const createSalesLead = (input: CreateSalesLeadInput): string | null => {
    const contactName = input.contactName.trim();
    const company = input.company.trim();
    const email = input.email.trim().toLowerCase();

    const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!contactName || !company || !hasValidEmail || !input.ownerId) {
      return null;
    }

    const timestamp = new Date().toISOString();
    const salesLeadId = makeId("slead");

    const stub = buildAdminLeadStubFromSalesLead({
      contactName,
      company,
      email,
      ownerId: input.ownerId,
      origin: "created",
    });

    const stubLead = stub
      ? { ...stub.lead, linkedSalesLeadId: salesLeadId }
      : null;

    const nextSalesLead: SalesLead = {
      id: salesLeadId,
      ownerId: input.ownerId,
      createdByRole: actorRole === "admin" ? "admin" : "sales",
      createdByEmail:
        typeof actorEmail === "string" && actorEmail.trim().length > 0
          ? actorEmail.trim().toLowerCase()
          : null,
      contactName,
      company,
      email,
      qualificationStage: "Havent Contacted",
      qualificationReason: null,
      status: "Open",
      createdAt: timestamp,
      lastUpdatedAt: timestamp,
      convertedClientProfileId: null,
      linkedAdminLeadId: stubLead ? stubLead.id : null,
    };

    const nextSalesLeads = [nextSalesLead, ...salesLeads];
    const nextLeads = stubLead ? [stubLead, ...leads] : leads;
    setSalesLeads(nextSalesLeads);
    if (stubLead) {
      setLeads(nextLeads);
    }
    persistSnapshotImmediately({
      leads: nextLeads,
      salesLeads: nextSalesLeads,
      activeLeadId,
    });
    return salesLeadId;
  };

  const updateSalesLeadQualificationStage = (
    salesLeadId: string,
    stage: SalesLeadQualificationStage,
    reason?: string | null,
  ): boolean => {
    const reasonRequired =
      stage === "Not Interested" || stage === "Does Not Qualify";
    const normalizedReason = reason?.trim() ?? "";

    if (reasonRequired && normalizedReason.length === 0) {
      return false;
    }

    const timestamp = new Date().toISOString();
    let updated = false;
    let mirrorEmail = "";
    let mirrorOwnerId = "";
    let linkedAdminLeadId: string | null = null;

    setSalesLeads((current) => {
      const nextSalesLeads = current.map((lead) =>
        lead.id === salesLeadId && lead.status === "Open"
          ? (() => {
              updated = true;
              mirrorEmail = lead.email.trim().toLowerCase();
              mirrorOwnerId = lead.ownerId;
              linkedAdminLeadId = lead.linkedAdminLeadId;
              return {
                ...lead,
                qualificationStage: stage,
                qualificationReason: reasonRequired ? normalizedReason : null,
                lastUpdatedAt: timestamp,
              };
            })()
          : lead,
      );

      if (updated) {
        const mappedContact = qualificationToAdminContact(stage);
        const matches = (aLead: AdminLead) => {
          if (linkedAdminLeadId) return aLead.id === linkedAdminLeadId;
          if (aLead.userProfile.email.trim().toLowerCase() !== mirrorEmail)
            return false;
          if (mirrorOwnerId && aLead.ownerId !== mirrorOwnerId) return false;
          return true;
        };
        const nextLeads = mappedContact
          ? leads.map((aLead) => {
              if (!matches(aLead)) return aLead;
              if (aLead.contactStatus === mappedContact) return aLead;
              return {
                ...aLead,
                contactStatus: mappedContact,
                lastTouched: "Just now",
                events: [
                  {
                    id: makeId("event"),
                    title: "Contact status updated",
                    detail: `Mirrored from sales qualification: ${stage}.`,
                    createdAt: timelineLabel(),
                    tone: "system" as const,
                  },
                  ...aLead.events,
                ],
              };
            })
          : leads;

        if (nextLeads !== leads) {
          setLeads(nextLeads);
        }

        persistSnapshotImmediately({
          leads: nextLeads,
          salesLeads: nextSalesLeads,
          activeLeadId,
        });
      }

      return nextSalesLeads;
    });

    return updated;
  };

  const updateSalesLeadOwner = (salesLeadId: string, ownerId: string): boolean => {
    const targetOwnerId = ownerId.trim();
    if (!targetOwnerId) return false;
    const timestamp = new Date().toISOString();
    let updated = false;
    let linkedAdminLeadId: string | null = null;

    setSalesLeads((current) => {
      const nextSalesLeads = current.map((lead) =>
        lead.id === salesLeadId && lead.ownerId !== targetOwnerId
          ? (() => {
              updated = true;
              linkedAdminLeadId = lead.linkedAdminLeadId;
              return {
                ...lead,
                ownerId: targetOwnerId,
                lastUpdatedAt: timestamp,
              };
            })()
          : lead,
      );

      if (updated) {
        const nextLeads = linkedAdminLeadId
          ? leads.map((aLead) =>
              aLead.id === linkedAdminLeadId && aLead.ownerId !== targetOwnerId
                ? {
                    ...aLead,
                    ownerId: targetOwnerId,
                    lastTouched: "Just now",
                    events: [
                      {
                        id: makeId("event"),
                        title: "Owner updated",
                        detail: "Mirrored from sales lead reassignment.",
                        createdAt: timelineLabel(),
                        tone: "system" as const,
                      },
                      ...aLead.events,
                    ],
                  }
                : aLead,
            )
          : leads;

        if (nextLeads !== leads) {
          setLeads(nextLeads);
        }

        persistSnapshotImmediately({
          leads: nextLeads,
          salesLeads: nextSalesLeads,
          activeLeadId,
        });
      }

      return nextSalesLeads;
    });

    return updated;
  };

  const deleteSalesLead = (
    salesLeadId: string,
  ): { ok: true } | { ok: false; error: string } => {
    const currentSalesLeads = latestSnapshotRef.current.salesLeads;
    const currentLeads = latestSnapshotRef.current.leads;
    const salesLead = currentSalesLeads.find((lead) => lead.id === salesLeadId);

    if (!salesLead) {
      return { ok: false, error: "Lead not found." };
    }

    if (salesLead.status === "Converted" || salesLead.convertedClientProfileId) {
      return {
        ok: false,
        error: "Converted leads must be managed from the lead profile, not deleted from Leads.",
      };
    }

    const linkedAdminLead = salesLead.linkedAdminLeadId
      ? currentLeads.find((lead) => lead.id === salesLead.linkedAdminLeadId) ?? null
      : null;

    if (linkedAdminLead?.isClientRegistered) {
      return {
        ok: false,
        error: "Registered lead profiles cannot be deleted from Leads.",
      };
    }

    const nextSalesLeads = currentSalesLeads.filter((lead) => lead.id !== salesLeadId);
    const nextLeads =
      linkedAdminLead && !linkedAdminLead.isClientRegistered
        ? currentLeads.filter((lead) => lead.id !== linkedAdminLead.id)
        : currentLeads;
    const nextActiveLeadId =
      activeLeadId && nextLeads.some((lead) => lead.id === activeLeadId)
        ? activeLeadId
        : nextLeads[0]?.id ?? null;

    setSalesLeads(nextSalesLeads);
    if (nextLeads !== currentLeads) {
      setLeads(nextLeads);
    }
    if (nextActiveLeadId !== activeLeadId) {
      setActiveLeadId(nextActiveLeadId);
    }

    persistSnapshotImmediately({
      leads: nextLeads,
      salesLeads: nextSalesLeads,
      activeLeadId: nextActiveLeadId,
    });

    return { ok: true };
  };

  const convertSalesLeadToClient = (
    input: ConvertSalesLeadToClientInput,
  ): CreateLeadResult | null => {
    const currentLeads = latestSnapshotRef.current.leads;
    const currentSalesLeads = latestSnapshotRef.current.salesLeads;
    const salesLead = currentSalesLeads.find((lead) => lead.id === input.salesLeadId);
    if (!salesLead || salesLead.status !== "Open" || salesLead.qualificationStage !== "Qualifies") {
      return null;
    }

    const registrationSource =
      actorRole && actorEmail && actorName
        ? {
            linkId: registrationLinkIdForProfile({
              email: actorEmail,
              role: actorRole,
              agentId: actorAgentId,
            }),
            profileName: actorName,
            profileRole: actorRole,
            profileAgentId: actorAgentId,
            partnerOrgId: salesLead.partnerOrgId ?? null,
            channel: "dashboard" as const,
          }
        : null;
    const contactParts = splitContactName(salesLead.contactName);
    const created = buildAdminLeadFromClientRegistration({
      businessName: input.businessName || salesLead.company,
      businessRegistrationNumber: input.businessRegistrationNumber,
      industry: input.industry,
      contactFirstName: input.contactFirstName || contactParts.contactFirstName,
      contactSurname: input.contactSurname || contactParts.contactSurname || "Unknown",
      contactPosition: input.contactPosition || "Decision Maker",
      contactEmail: input.contactEmail || salesLead.email,
      contactNumber: input.contactNumber,
      monthlyElectricitySpendEstimateZar: input.monthlyElectricitySpendEstimateZar,
      isBusinessRegistered: input.isBusinessRegistered,
      isBusinessOperational: input.isBusinessOperational,
      hasSixMonthUtilityBill: input.hasSixMonthUtilityBill,
      physicalAddress: input.physicalAddress,
      city: input.city,
      province: input.province,
      source: input.source,
      origin: "created",
      partnerOrgId: salesLead.partnerOrgId ?? null,
      ownerId: salesLead.ownerId,
      registrationSource,
    });

    if (!created) {
      return null;
    }

    const oldStubId = salesLead.linkedAdminLeadId;
    const timestamp = new Date().toISOString();
    const linkedLead = {
      ...created.lead,
      linkedSalesLeadId: input.salesLeadId,
    };
    const nextLeads = [
      linkedLead,
      ...currentLeads.filter((lead) => lead.id !== oldStubId),
    ];
    const nextSalesLeads = currentSalesLeads.map((lead) =>
        lead.id === input.salesLeadId
          ? {
              ...lead,
              status: "Converted" as const,
              convertedClientProfileId: created.clientProfileId,
              linkedAdminLeadId: created.leadId,
              lastUpdatedAt: timestamp,
            }
          : lead,
    );

    setLeads(nextLeads);
    setSalesLeads(nextSalesLeads);
    setActiveLeadId(created.leadId);
    persistSnapshotImmediately({
      leads: nextLeads,
      salesLeads: nextSalesLeads,
      activeLeadId: created.leadId,
    });

    return created;
  };

  const disqualifyLead = (leadId: string, reason: string, by: string) => {
    const cleanReason = reason.trim();
    const cleanBy = by.trim();

    if (!cleanReason) {
      return;
    }

    const currentLeads = latestSnapshotRef.current.leads;
    const currentSalesLeads = latestSnapshotRef.current.salesLeads;
    let linkedSalesLeadId: string | null = null;
    const timestamp = new Date().toISOString();
    const disqualification = {
      reason: cleanReason,
      by: cleanBy || "Admin User",
      at: timelineLabel(),
    };
    const nextLeads = updateLeadById(currentLeads, leadId, (lead) => {
      linkedSalesLeadId = lead.linkedSalesLeadId;
      return {
        ...lead,
        stage: "Disqualified",
        onboardingCompletedAt: null,
        priority: "Standard",
        lastTouched: "Just now",
        disqualification,
        events: [
          {
            id: makeId("event"),
            title: "Lead disqualified",
            detail: cleanReason,
            createdAt: timelineLabel(),
            tone: "system",
          },
          ...lead.events,
        ],
      };
    });
    const nextSalesLeads = linkedSalesLeadId
      ? currentSalesLeads.map((lead) =>
          lead.id === linkedSalesLeadId
            ? {
                ...lead,
                qualificationStage: "Does Not Qualify" as const,
                qualificationReason: cleanReason,
                status: "Converted" as const,
                lastUpdatedAt: timestamp,
              }
            : lead,
        )
      : currentSalesLeads;

    setLeads(nextLeads);
    if (nextSalesLeads !== currentSalesLeads) {
      setSalesLeads(nextSalesLeads);
    }
    persistSnapshotImmediately({
      leads: nextLeads,
      salesLeads: nextSalesLeads,
      activeLeadId,
    });
  };

  const generateLeadEoi = (leadId: string) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => {
        if (TERMINAL_STAGES.has(lead.stage)) {
          return lead;
        }

        const eoiSigningToken = lead.eoiSigningToken ?? buildEoiSigningToken(lead.company);
        const promotedStage = promoteStage(lead.stage, "EOI Generated");
        const stageChanged = promotedStage !== lead.stage;
        const nextLead = {
          ...lead,
          stage: promotedStage,
          eoiSigningToken,
          readinessScore: Math.max(lead.readinessScore, 45),
          nextAction: stageChanged ? "Request signed EOI on company letterhead from the client." : lead.nextAction,
          lastTouched: "Just now",
        };

        return {
          ...nextLead,
          documents: upsertDocument(nextLead, {
            title: DOC_TITLE_EOI,
            category: "Onboarding",
            fileType: "PDF",
            status: "issued",
            uploadedAt: timelineLabel(),
            uploadedBy: "1OS System",
            uploadedByType: "Sales Team",
            sourceAccount: lead.migrateAccountId,
            sourceWorkspace: `1OS Admin / ${lead.company}`,
          }),
          events: [
            {
              id: makeId("event"),
              title: "EOI generated",
              detail:
                STAGE_RANK[lead.stage] > STAGE_RANK["EOI Generated"]
                  ? `EOI regenerated and template copy link refreshed at /eoi/${eoiSigningToken}.`
                  : `System generated Expression of Interest and shared /eoi/${eoiSigningToken} for client letterhead completion.`,
              createdAt: timelineLabel(),
              tone: "system",
            },
            ...lead.events,
          ],
        };
      }),
    );
  };

  const recordLeadEoiSignature = (leadId: string, signedBy?: string) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => {
        if (TERMINAL_STAGES.has(lead.stage)) {
          return lead;
        }

        const signedAtIso = new Date().toISOString();
        const signatureId = lead.eoiSignatureId?.trim() || crypto.randomUUID();
        const signerName = signedBy?.trim() || lead.contactName;
        const nextStage =
          lead.stage === "Client Registered" || lead.stage === "EOI Generated"
            ? ("EOI Signed" as const)
            : lead.stage;
        const nextLead = {
          ...lead,
          stage: nextStage,
          eoiSignatureId: signatureId,
          eoiSignedBy: signerName,
          eoiSignedAt: signedAtIso,
          eoiAcceptedTermsAt: signedAtIso,
          readinessScore: Math.max(lead.readinessScore, 58),
          nextAction: "Submit 6-month utility bills from the sales onboarding desk.",
          lastTouched: "Just now",
        };

        return {
          ...nextLead,
          documents: upsertDocument(nextLead, {
            title: DOC_TITLE_SIGNED_EOI,
            category: "Onboarding",
            fileType: "PDF",
            status: "signed",
            uploadedAt: timelineLabel(),
            uploadedBy: `${signerName} (Client)`,
            uploadedByType: "Client",
            sourceAccount: lead.migrateAccountId,
            sourceWorkspace: `1OS Migrate / ${lead.company}`,
          }),
          tasks: setTaskStatus(nextLead, "Submit signed EOI", true),
          events: [
            {
              id: makeId("event"),
              title: "Signed EOI recorded",
              detail: `Signed EOI was captured at ${signedAtIso}. Record ID: ${signatureId}.`,
              createdAt: timelineLabel(),
              tone: "client",
            },
            ...lead.events,
          ],
        };
      }),
    );
  };

  const uploadLeadUtilityBills = (leadId: string) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => {
        if (TERMINAL_STAGES.has(lead.stage)) {
          return lead;
        }

        const promotedStage = promoteStage(lead.stage, "Utility Bills Uploaded");
        const stageChanged = promotedStage !== lead.stage;
        const nextLead = {
          ...lead,
          stage: promotedStage,
          readinessScore: Math.max(lead.readinessScore, 72),
          nextAction: stageChanged
            ? "Await admin proposal upload, then download and submit signed proposal."
            : lead.nextAction,
          lastTouched: "Just now",
        };

        return {
          ...nextLead,
          documents: upsertDocument(nextLead, {
            title: DOC_TITLE_UTILITY_BILLS,
            category: "Qualification",
            fileType: "PDF",
            status: "received",
            uploadedAt: timelineLabel(),
            uploadedBy: "Sales Team Upload",
            uploadedByType: "Sales Team",
            sourceAccount: lead.migrateAccountId,
            sourceWorkspace: `1OS Admin / ${lead.company}`,
          }),
          tasks: setTaskStatus(nextLead, "Upload 6-month utility bill pack", true),
          events: [
            {
              id: makeId("event"),
              title: "Utility bills submitted by sales",
              detail:
                STAGE_RANK[lead.stage] > STAGE_RANK["Utility Bills Uploaded"]
                  ? "6-month utility bill pack refreshed on client profile."
                  : "Sales uploaded the client 6-month utility bill pack.",
              createdAt: timelineLabel(),
              tone: "agent",
            },
            ...lead.events,
          ],
        };
      }),
    );
  };

  const issueLeadProposal = (leadId: string) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => {
        if (TERMINAL_STAGES.has(lead.stage)) {
          return lead;
        }

        const nextLead = {
          ...lead,
          readinessScore: Math.max(lead.readinessScore, 78),
          nextAction: "Sales must download the proposal and submit the signed proposal.",
          lastTouched: "Just now",
        };

        return {
          ...nextLead,
          documents: upsertDocument(nextLead, {
            title: DOC_TITLE_PROPOSAL_ISSUED,
            category: "Commercial",
            fileType: "PDF",
            status: "issued",
            uploadedAt: timelineLabel(),
            uploadedBy: "Admin Team Upload",
            uploadedByType: "Admin Team",
            sourceAccount: lead.migrateAccountId,
            sourceWorkspace: `1OS Admin / ${lead.company}`,
          }),
          events: [
            {
              id: makeId("event"),
              title: "Proposal issued by admin",
              detail: "Admin uploaded a proposal package for sales review and signature.",
              createdAt: timelineLabel(),
              tone: "system",
            },
            ...lead.events,
          ],
        };
      }),
    );
  };

  const submitLeadProposal = (leadId: string) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => {
        if (TERMINAL_STAGES.has(lead.stage)) {
          return lead;
        }

        const nextLead = {
          ...lead,
          readinessScore: Math.max(lead.readinessScore, 84),
          nextAction: COMPLIANCE_PACK_NEXT_ACTION,
          lastTouched: "Just now",
        };

        return {
          ...nextLead,
          documents: upsertDocument(nextLead, {
            title: DOC_TITLE_PROPOSAL_SIGNED,
            category: "Commercial",
            fileType: "PDF",
            status: "signed",
            uploadedAt: timelineLabel(),
            uploadedBy: "Sales Team Upload",
            uploadedByType: "Sales Team",
            sourceAccount: lead.migrateAccountId,
            sourceWorkspace: `1OS Sales / ${lead.company}`,
          }),
          tasks: setTaskStatus(nextLead, "Submit signed proposal", true),
          events: [
            {
              id: makeId("event"),
              title: "Signed proposal submitted by sales",
              detail: "Sales uploaded the signed proposal back to the client profile.",
              createdAt: timelineLabel(),
              tone: "agent",
            },
            ...lead.events,
          ],
        };
      }),
    );
  };

  const issueLeadTermSheet = (leadId: string) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => {
        if (TERMINAL_STAGES.has(lead.stage)) {
          return lead;
        }

        const nextLead = {
          ...lead,
          readinessScore: Math.max(lead.readinessScore, 88),
          nextAction: "Sales must download the term sheet and submit the signed term sheet.",
          lastTouched: "Just now",
        };

        return {
          ...nextLead,
          documents: upsertDocument(nextLead, {
            title: DOC_TITLE_TERM_SHEET_ISSUED,
            category: "Legal",
            fileType: "PDF",
            status: "issued",
            uploadedAt: timelineLabel(),
            uploadedBy: "Admin Team Upload",
            uploadedByType: "Admin Team",
            sourceAccount: lead.migrateAccountId,
            sourceWorkspace: `1OS Admin / ${lead.company}`,
          }),
          events: [
            {
              id: makeId("event"),
              title: "Term sheet issued by admin",
              detail: "Admin uploaded the term sheet for sales download and submission.",
              createdAt: timelineLabel(),
              tone: "system",
            },
            ...lead.events,
          ],
        };
      }),
    );
  };

  const submitLeadTermSheet = (leadId: string) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => {
        if (TERMINAL_STAGES.has(lead.stage)) {
          return lead;
        }

        const promotedStage = promoteStage(lead.stage, "Term Sheet Uploaded");
        const stageChanged = promotedStage !== lead.stage;
        const nextLead = {
          ...lead,
          stage: promotedStage,
          readinessScore: Math.max(lead.readinessScore, 94),
          nextAction: stageChanged
            ? "Validate final checklist and mark deal closed once approved."
            : lead.nextAction,
          lastTouched: "Just now",
        };

        return {
          ...nextLead,
          documents: upsertDocument(nextLead, {
            title: DOC_TITLE_TERM_SHEET_SIGNED,
            category: "Legal",
            fileType: "PDF",
            status: "signed",
            uploadedAt: timelineLabel(),
            uploadedBy: "Sales Team Upload",
            uploadedByType: "Sales Team",
            sourceAccount: lead.migrateAccountId,
            sourceWorkspace: `1OS Sales / ${lead.company}`,
          }),
          tasks: setTaskStatus(nextLead, "Submit signed term sheet", true),
          events: [
            {
              id: makeId("event"),
              title: "Signed term sheet submitted by sales",
              detail: "Sales uploaded the signed term sheet to complete document exchange.",
              createdAt: timelineLabel(),
              tone: "agent",
            },
            ...lead.events,
          ],
        };
      }),
    );
  };

  const recordLeadDocumentDownload = (
    leadId: string,
    documentTitle: string,
    downloadedBy: "Admin Team" | "Sales Team",
  ) => {
    const cleanTitle = documentTitle.trim();
    if (!cleanTitle) {
      return;
    }

    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => ({
        ...lead,
        lastTouched: "Just now",
        events: [
          {
            id: makeId("event"),
            title: `${cleanTitle} downloaded by ${downloadedBy.toLowerCase()}`,
            detail: `${downloadedBy} downloaded ${cleanTitle} from the client file vault.`,
            createdAt: timelineLabel(),
            tone: downloadedBy === "Sales Team" ? "agent" : "system",
          },
          ...lead.events,
        ],
      })),
    );
  };

  const uploadLeadDocument = async (
    leadId: string,
    input: UploadLeadDocumentInput,
  ): Promise<boolean> => {
    const title = input.title.trim();
    const category = input.category.trim();

    if (!title || !category || input.file.size === 0) {
      return false;
    }

    try {
      // Flush any pending coalesced edits before the document upload.
      if (pendingPersistRef.current) {
        clearTimeout(pendingPersistRef.current);
        pendingPersistRef.current = null;
      }
      await persistDeltaNow();

      const formData = new FormData();
      formData.set("file", input.file);
      formData.set("title", title);
      formData.set("category", category);
      formData.set("status", input.status);

      const response = await fetch(`/api/admin/leads/${leadId}/documents`, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        snapshot?: {
          leads?: AdminLead[];
          salesLeads?: SalesLead[];
          activeLeadId?: string | null;
        };
      };

      if (!response.ok || !payload.ok || !payload.snapshot) {
        return false;
      }

      if (Array.isArray(payload.snapshot.leads)) {
        setLeads(payload.snapshot.leads);
      }

      if (Array.isArray(payload.snapshot.salesLeads)) {
        setSalesLeads(payload.snapshot.salesLeads);
      }

      if (
        typeof payload.snapshot.activeLeadId === "string" ||
        payload.snapshot.activeLeadId === null
      ) {
        setActiveLeadId(payload.snapshot.activeLeadId);
      }

      return true;
    } catch {
      return false;
    }
  };

  // Backwards-compatibility for existing route calls.
  const uploadLeadTermSheet = (leadId: string) => {
    submitLeadTermSheet(leadId);
  };

  const completeLeadOnboarding = (leadId: string) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => {
        if (lead.stage === "Onboarding Complete") {
          return lead;
        }

        const nextLead = {
          ...lead,
          stage: "Onboarding Complete" as const,
          onboardingCompletedAt:
            lead.onboardingCompletedAt ?? new Date().toISOString(),
          readinessScore: 100,
          nextAction: "Onboarding completed. Hand over to migration operations.",
          lastTouched: "Just now",
        };

        return {
          ...nextLead,
          tasks: nextLead.tasks.map((task) => ({ ...task, status: "done" })),
          events: [
            {
              id: makeId("event"),
              title: "Onboarding completed",
              detail:
                "Client registration, EOI, utility bills, proposal, and signed term sheet are complete.",
              createdAt: timelineLabel(),
              tone: "system",
            },
            ...lead.events,
          ],
        };
      }),
    );
  };

  const value: AdminPortalContextValue = {
    agents: ADMIN_AGENTS,
    actorAgentId,
    leads,
    salesLeads,
    registrationDrafts,
    leadStages: adminLeadStages,
    contactStatuses: adminLeadContactStatuses,
    salesLeadQualificationStages,
    activeLeadId,
    activeLead,
    setActiveLeadId,
    updateLeadOwner,
    updateLeadPartner,
    updateLeadPriority,
    updateLeadContactStatus,
    updateLeadStage,
    updateLeadNextAction,
    addLeadNote,
    createLeadTask,
    toggleLeadTask,
    createLead,
    createLeadShell,
    importLeadShells,
    updateLeadProfile,
    createSalesLead,
    updateSalesLeadQualificationStage,
    updateSalesLeadOwner,
    deleteSalesLead,
    convertSalesLeadToClient,
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
    uploadLeadTermSheet,
    completeLeadOnboarding,
    saveStatus,
    syncBackend,
    retrySave: () => {
      setSyncBackend((current) => (current === "local" ? "supabase" : current));
      dirtyRef.current = true;
      void persistDeltaNow();
    },
  };

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 text-center">
        <div>
          <p className="line-label">Loading Leads</p>
          <p className="mt-3 text-sm text-white/58">
            Syncing the lead book.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AdminPortalContext.Provider value={value}>
      {children}
    </AdminPortalContext.Provider>
  );
}

export function useAdminPortal() {
  const context = useContext(AdminPortalContext);

  if (!context) {
    throw new Error("useAdminPortal must be used within an AdminPortalProvider.");
  }

  return context;
}

export function useOptionalAdminPortal() {
  return useContext(AdminPortalContext);
}
