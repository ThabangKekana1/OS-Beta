import { NextRequest, NextResponse } from "next/server";
import {
  readAdminStateSnapshot,
  writeAdminLeadMutationSnapshot,
} from "@/lib/admin-state-store";
import { getServerAuthSession } from "@/lib/auth-server";
import { recordUserPresence } from "@/lib/user-audit";
import { normalizeAdminLead } from "@/lib/admin-storage";
import type { AdminLead } from "@/lib/admin-types";
import type { AuthSession } from "@/lib/auth";

export const runtime = "nodejs";

type MutationPayload = {
  leadUpserts?: AdminLead[];
  leadDeletes?: string[];
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function actorFields(session: AuthSession) {
  return {
    actorUserId: session.userId,
    actorEmail: session.email,
    actorName: session.name,
    actorAgentId: session.agentId,
    actorRole: session.role,
  };
}

function isValidDate(value: string | null | undefined) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()));
}

function stampNewLeadActivity(lead: AdminLead, existingLead: AdminLead | null, session: AuthSession, at: string): AdminLead {
  const existingEventIds = new Set(existingLead?.events.map((event) => event.id) ?? []);
  const existingNoteIds = new Set(existingLead?.notes.map((note) => note.id) ?? []);
  const existingDocumentIds = new Set(existingLead?.documents.map((document) => document.id) ?? []);
  const actor = actorFields(session);

  return {
    ...lead,
    lastTouched: isValidDate(lead.lastTouched) ? lead.lastTouched : at,
    events: lead.events.map((event) =>
      existingEventIds.has(event.id)
        ? event
        : {
            ...event,
            createdAt: isValidDate(event.createdAt) ? event.createdAt : at,
            ...actor,
          },
    ),
    notes: lead.notes.map((note) =>
      existingNoteIds.has(note.id)
        ? note
        : {
            ...note,
            createdAt: isValidDate(note.createdAt) ? note.createdAt : at,
            ...actor,
          },
    ),
    documents: lead.documents.map((document) =>
      existingDocumentIds.has(document.id)
        ? document
        : {
            ...document,
            uploadedAt: isValidDate(document.uploadedAt) ? document.uploadedAt : at,
            ...actor,
          },
    ),
  };
}

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: MutationPayload;
  try {
    payload = (await request.json()) as MutationPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const leadUpserts = asArray<AdminLead>(payload.leadUpserts).map((lead) => {
    try {
      return normalizeAdminLead(lead);
    } catch {
      return null;
    }
  }).filter((lead): lead is AdminLead => lead !== null && typeof lead?.id === "string" && lead.id.length > 0);

  const leadDeletes = new Set(asStringArray(payload.leadDeletes));

  const { snapshot } = await readAdminStateSnapshot();

  const isAdmin = session.role === "admin";
  const isSales = session.role === "sales";
  const actorAgentId = session.agentId;

  if (!isAdmin && !isSales) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (isSales && !actorAgentId) {
    return NextResponse.json({ ok: false, error: "Sales profile is not linked to an agent." }, { status: 403 });
  }

  if (isSales && leadDeletes.size > 0) {
    return NextResponse.json({ ok: false, error: "Sales users cannot delete leads." }, { status: 403 });
  }

  await recordUserPresence(session).catch((error) => {
    console.error("[admin/state/mutate] presence update failed", error);
  });

  const existingLeadById = new Map(snapshot.leads.map((lead) => [lead.id, lead]));
  const existingLeadOwnerById = new Map(snapshot.leads.map((lead) => [lead.id, lead.ownerId]));
  const scopedLeadUpserts = isSales
    ? leadUpserts.filter((lead) => {
        const existingOwner = existingLeadOwnerById.get(lead.id);
        return lead.ownerId === actorAgentId && (!existingOwner || existingOwner === actorAgentId);
      })
    : leadUpserts;

  if (isSales && scopedLeadUpserts.length !== leadUpserts.length) {
    return NextResponse.json({ ok: false, error: "Sales users can only mutate their own leads." }, { status: 403 });
  }

  const activityAt = new Date().toISOString();
  const stampedLeadUpserts = scopedLeadUpserts.map((lead) =>
    stampNewLeadActivity(lead, existingLeadById.get(lead.id) ?? null, session, activityAt),
  );
  const leadUpsertById = new Map(stampedLeadUpserts.map((lead) => [lead.id, lead]));

  const mergedLeads: AdminLead[] = [];
  const seenLeadIds = new Set<string>();

  // 1. Walk current snapshot, replacing or skipping as needed.
  for (const lead of snapshot.leads) {
    if (leadDeletes.has(lead.id)) continue;
    const replacement = leadUpsertById.get(lead.id);
    if (replacement) {
      mergedLeads.push(replacement);
      seenLeadIds.add(lead.id);
    } else {
      mergedLeads.push(lead);
      seenLeadIds.add(lead.id);
    }
  }
  // 2. Append brand-new upserts at the front (preserves "newest first" UX).
  const newLeads = stampedLeadUpserts.filter((lead) => !seenLeadIds.has(lead.id));
  const finalLeads = [...newLeads, ...mergedLeads];

  const nextSnapshot = {
    ...snapshot,
    leads: finalLeads,
  };

  try {
    const backend = await writeAdminLeadMutationSnapshot(nextSnapshot, session.email, {
      leadUpserts: stampedLeadUpserts,
      leadDeletes: Array.from(leadDeletes),
    });
    const responseSnapshot =
      isSales && actorAgentId
        ? {
            ...nextSnapshot,
            leads: nextSnapshot.leads.filter((lead) => lead.ownerId === actorAgentId),
            activeLeadId:
              nextSnapshot.activeLeadId &&
              nextSnapshot.leads.some(
                (lead) => lead.id === nextSnapshot.activeLeadId && lead.ownerId === actorAgentId,
              )
                ? nextSnapshot.activeLeadId
                : nextSnapshot.leads.find((lead) => lead.ownerId === actorAgentId)?.id ?? null,
          }
        : nextSnapshot;
    return NextResponse.json({ ok: true, backend, snapshot: responseSnapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: "Unable to persist mutation.", detail: message },
      { status: 500 },
    );
  }
}
