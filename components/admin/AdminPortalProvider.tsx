"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createDefaultAdminStateSnapshot, normalizeAdminStateSnapshot } from "@/lib/admin-state";
import { ADMIN_AGENTS } from "@/lib/admin-mock-data";
import {
  buildAdminLeadFromClientRegistration,
  splitContactName,
} from "@/lib/client-registration";
import { makeId, timelineLabel } from "@/lib/formatting";
import { registrationLinkIdForProfile } from "@/lib/registration-links";
import {
  ADMIN_STORAGE_KEY,
  readAdminStorageSnapshot,
  writeAdminStorageSnapshot,
} from "@/lib/admin-storage";
import { adminLeadStages, adminLeadContactStatuses, salesLeadQualificationStages } from "@/lib/admin-types";
import type {
  AdminAgent,
  AdminDocumentStatus,
  AdminLead,
  AdminLeadContactStatus,
  AdminLeadDocument,
  AdminLeadPriority,
  AdminLeadStage,
  AdminTaskOwner,
  SalesLead,
  SalesLeadQualificationStage,
} from "@/lib/admin-types";

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
  ownerId: string;
};

type CreateSalesLeadInput = {
  contactName: string;
  company: string;
  email: string;
  ownerId: string;
};

type ConvertSalesLeadToClientInput = {
  salesLeadId: string;
  businessRegistrationNumber: string;
  industry: string;
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
  leadStages: readonly AdminLeadStage[];
  contactStatuses: readonly AdminLeadContactStatus[];
  salesLeadQualificationStages: readonly SalesLeadQualificationStage[];
  activeLeadId: string | null;
  activeLead: AdminLead | null;
  setActiveLeadId: (leadId: string | null) => void;
  updateLeadOwner: (leadId: string, ownerId: string) => void;
  updateLeadPriority: (leadId: string, priority: AdminLeadPriority) => void;
  updateLeadContactStatus: (leadId: string, status: AdminLeadContactStatus) => void;
  updateLeadStage: (leadId: string, stage: AdminLeadStage) => void;
  updateLeadNextAction: (leadId: string, nextAction: string) => void;
  addLeadNote: (leadId: string, note: string, author: string) => void;
  createLeadTask: (leadId: string, input: CreateTaskInput) => void;
  toggleLeadTask: (leadId: string, taskId: string) => void;
  createLead: (input: CreateLeadInput) => CreateLeadResult | null;
  createSalesLead: (input: CreateSalesLeadInput) => string | null;
  updateSalesLeadQualificationStage: (
    salesLeadId: string,
    stage: SalesLeadQualificationStage,
    reason?: string | null,
  ) => boolean;
  updateSalesLeadOwner: (salesLeadId: string, ownerId: string) => boolean;
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

function mergeById<T extends { id: string }>(remoteItems: T[], currentItems: T[]) {
  const currentIds = new Set(currentItems.map((item) => item.id));
  return [
    ...currentItems,
    ...remoteItems.filter((item) => !currentIds.has(item.id)),
  ];
}

const TERMINAL_STAGES = new Set<AdminLeadStage>([
  "Onboarding Complete",
  "Disqualified",
]);
const STAGE_RANK: Record<AdminLeadStage, number> = {
  "Client Registered": 0,
  "EOI Generated": 1,
  "EOI Signed": 2,
  "Utility Bills Uploaded": 3,
  "Term Sheet Uploaded": 4,
  "Onboarding Complete": 5,
  Disqualified: 6,
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
}: {
  children: ReactNode;
  actorRole?: "admin" | "sales" | null;
  actorEmail?: string | null;
  actorName?: string | null;
  actorAgentId?: string | null;
}) {
  const initialSnapshot = createDefaultAdminStateSnapshot();
  const [leads, setLeads] = useState<AdminLead[]>(
    () => initialSnapshot.leads,
  );
  const [salesLeads, setSalesLeads] = useState<SalesLead[]>(
    () => initialSnapshot.salesLeads,
  );
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [syncBackend, setSyncBackend] = useState<"loading" | "supabase" | "local">(
    "loading",
  );

  const activeLead = leads.find((lead) => lead.id === activeLeadId) ?? null;

  useEffect(() => {
    let cancelled = false;

    const localSnapshot = readAdminStorageSnapshot();
    if (localSnapshot) {
      setLeads(localSnapshot.leads);
      setSalesLeads(localSnapshot.salesLeads);
      setActiveLeadId(localSnapshot.activeLeadId);
    }

    const loadRemoteState = async () => {
      try {
        const response = await fetch("/api/admin/state", {
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
        };

        if (!payload.ok) {
          throw new Error("State load returned non-ok payload.");
        }

        const snapshot = normalizeAdminStateSnapshot(payload.snapshot);
        if (!cancelled && snapshot) {
          setLeads((current) => mergeById(snapshot.leads, current));
          setSalesLeads((current) => mergeById(snapshot.salesLeads, current));
          setActiveLeadId((current) => current ?? snapshot.activeLeadId);
        }

        if (!cancelled) {
          setSyncBackend(payload.backend === "supabase" ? "supabase" : "local");
        }
      } catch {
        if (!cancelled) {
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
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const snapshot = { leads, salesLeads, activeLeadId };
    writeAdminStorageSnapshot(snapshot);
  }, [activeLeadId, isHydrated, leads, salesLeads, syncBackend]);

  const persistSnapshotNow = async (snapshot: {
    leads: AdminLead[];
    salesLeads: SalesLead[];
    activeLeadId: string | null;
  }) => {
    writeAdminStorageSnapshot(snapshot);

    if (syncBackend !== "supabase") {
      return;
    }

    try {
      const response = await fetch("/api/admin/state", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ snapshot }),
      });

      if (!response.ok) {
        setSyncBackend("local");
      }
    } catch {
      setSyncBackend("local");
    }
  };

  const persistSnapshotImmediately = (snapshot: {
    leads: AdminLead[];
    salesLeads: SalesLead[];
    activeLeadId: string | null;
  }) => {
    void persistSnapshotNow(snapshot);
  };

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
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
  }, []);

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
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => ({
        ...lead,
        ownerId,
        lastTouched: "Just now",
        events: [
          {
            id: makeId("event"),
            title: "Owner updated",
            detail: `Lead reassigned in admin portal.`,
            createdAt: timelineLabel(),
            tone: "system",
          },
          ...lead.events,
        ],
      })),
    );
  };

  const updateLeadContactStatus = (leadId: string, status: AdminLeadContactStatus) => {
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => ({
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
      })),
    );
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
    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => {
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
              title: "Pipeline stage updated",
              detail: `Lead moved to ${stage}.`,
              createdAt: timelineLabel(),
              tone: "agent",
            },
            ...lead.events,
          ],
        };
      }),
    );
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
    const created = buildAdminLeadFromClientRegistration({
      ...input,
      registrationSource,
    });

    if (!created) {
      return null;
    }

    setLeads((current) => {
      const nextLeads = [created.lead, ...current];
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
    };

    setSalesLeads((current) => {
      const nextSalesLeads = [nextSalesLead, ...current];
      persistSnapshotImmediately({
        leads,
        salesLeads: nextSalesLeads,
        activeLeadId,
      });
      return nextSalesLeads;
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

    setSalesLeads((current) => {
      const nextSalesLeads = current.map((lead) =>
        lead.id === salesLeadId && lead.status === "Open"
          ? (() => {
              updated = true;
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
        persistSnapshotImmediately({
          leads,
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

    setSalesLeads((current) => {
      const nextSalesLeads = current.map((lead) =>
        lead.id === salesLeadId && lead.ownerId !== targetOwnerId
          ? (() => {
              updated = true;
              return {
                ...lead,
                ownerId: targetOwnerId,
                lastUpdatedAt: timestamp,
              };
            })()
          : lead,
      );

      if (updated) {
        persistSnapshotImmediately({
          leads,
          salesLeads: nextSalesLeads,
          activeLeadId,
        });
      }

      return nextSalesLeads;
    });

    return updated;
  };

  const convertSalesLeadToClient = (
    input: ConvertSalesLeadToClientInput,
  ): CreateLeadResult | null => {
    const salesLead = salesLeads.find((lead) => lead.id === input.salesLeadId);
    if (!salesLead || salesLead.status !== "Open" || salesLead.qualificationStage !== "Qualifies") {
      return null;
    }

    const created = createLead({
      businessName: salesLead.company,
      businessRegistrationNumber: input.businessRegistrationNumber,
      industry: input.industry,
      contactFirstName: splitContactName(salesLead.contactName).contactFirstName,
      contactSurname: splitContactName(salesLead.contactName).contactSurname || "Unknown",
      contactPosition: "Owner",
      contactEmail: salesLead.email,
      contactNumber: input.contactNumber,
      monthlyElectricitySpendEstimateZar: input.monthlyElectricitySpendEstimateZar,
      isBusinessRegistered: input.isBusinessRegistered,
      isBusinessOperational: input.isBusinessOperational,
      hasSixMonthUtilityBill: input.hasSixMonthUtilityBill,
      physicalAddress: input.physicalAddress,
      city: input.city,
      province: input.province,
      source: input.source,
      ownerId: salesLead.ownerId,
    });

    if (!created) {
      return null;
    }

    const timestamp = new Date().toISOString();
    setSalesLeads((current) =>
      current.map((lead) =>
        lead.id === input.salesLeadId
          ? {
              ...lead,
              status: "Converted",
              convertedClientProfileId: created.clientProfileId,
              lastUpdatedAt: timestamp,
            }
          : lead,
      ),
    );

    return created;
  };

  const disqualifyLead = (leadId: string, reason: string, by: string) => {
    const cleanReason = reason.trim();
    const cleanBy = by.trim();

    if (!cleanReason) {
      return;
    }

    commitLeads((current) =>
      updateLeadById(current, leadId, (lead) => ({
        ...lead,
        stage: "Disqualified",
        onboardingCompletedAt: null,
        priority: "Standard",
        lastTouched: "Just now",
        disqualification: {
          reason: cleanReason,
          by: cleanBy || "Admin User",
          at: timelineLabel(),
        },
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
      })),
    );
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
          nextAction: stageChanged ? "Capture signed EOI from the client." : lead.nextAction,
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
                  ? `EOI regenerated and signing link refreshed at /eoi/${eoiSigningToken}.`
                  : `System generated Expression of Interest and shared /eoi/${eoiSigningToken} for digital signature.`,
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
        const signerName = signedBy?.trim() || lead.contactName;
        const nextStage =
          lead.stage === "Client Registered" || lead.stage === "EOI Generated"
            ? ("EOI Signed" as const)
            : lead.stage;
        const nextLead = {
          ...lead,
          stage: nextStage,
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
              title: "EOI digitally signed",
              detail: "Client completed digital signature and signed EOI was captured.",
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
          nextAction: "Await admin term sheet upload, then submit signed term sheet.",
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
      await persistSnapshotNow({
        leads,
        salesLeads,
        activeLeadId: leadId,
      });

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
    leadStages: adminLeadStages,
    contactStatuses: adminLeadContactStatuses,
    salesLeadQualificationStages,
    activeLeadId,
    activeLead,
    setActiveLeadId,
    updateLeadOwner,
    updateLeadPriority,
    updateLeadContactStatus,
    updateLeadStage,
    updateLeadNextAction,
    addLeadNote,
    createLeadTask,
    toggleLeadTask,
    createLead,
    createSalesLead,
    updateSalesLeadQualificationStage,
    updateSalesLeadOwner,
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
  };

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 text-center">
        <div>
          <p className="line-label">Loading CRM</p>
          <p className="mt-3 text-sm text-white/58">
            Syncing admin and sales workspace state.
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
