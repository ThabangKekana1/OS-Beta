import { NextRequest, NextResponse } from "next/server";
import {
  readAdminStateSnapshot,
  writeAdminStateSnapshot,
} from "@/lib/admin-state-store";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  normalizeAdminLead,
  normalizeSalesLead,
} from "@/lib/admin-storage";
import { buildAdminLeadStubFromSalesLead } from "@/lib/client-registration";
import type { AdminLead, SalesLead } from "@/lib/admin-types";

export const runtime = "nodejs";

type MutationPayload = {
  leadUpserts?: AdminLead[];
  leadDeletes?: string[];
  salesLeadUpserts?: SalesLead[];
  salesLeadDeletes?: string[];
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
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

  const salesLeadUpserts = asArray<SalesLead>(payload.salesLeadUpserts).map((lead) => {
    try {
      return normalizeSalesLead(lead);
    } catch {
      return null;
    }
  }).filter(
    (lead): lead is SalesLead =>
      lead !== null && typeof lead?.id === "string" && lead.id.length > 0,
  );

  const leadDeletes = new Set(asStringArray(payload.leadDeletes));
  const salesLeadDeletes = new Set(asStringArray(payload.salesLeadDeletes));

  const { snapshot } = await readAdminStateSnapshot();

  const leadUpsertById = new Map(leadUpserts.map((lead) => [lead.id, lead]));
  const salesUpsertById = new Map(salesLeadUpserts.map((lead) => [lead.id, lead]));

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
  const newLeads = leadUpserts.filter((lead) => !seenLeadIds.has(lead.id));
  const finalLeads = [...newLeads, ...mergedLeads];

  const mergedSalesLeads: SalesLead[] = [];
  const seenSalesIds = new Set<string>();
  for (const lead of snapshot.salesLeads) {
    if (salesLeadDeletes.has(lead.id)) continue;
    const replacement = salesUpsertById.get(lead.id);
    if (replacement) {
      mergedSalesLeads.push(replacement);
      seenSalesIds.add(lead.id);
    } else {
      mergedSalesLeads.push(lead);
      seenSalesIds.add(lead.id);
    }
  }
  const newSalesLeads = salesLeadUpserts.filter((lead) => !seenSalesIds.has(lead.id));
  const finalSalesLeads = [...newSalesLeads, ...mergedSalesLeads];

  // Auto-handover: any partner-originated sales lead at "Qualifies" without a
  // linked admin lead spawns a stub admin lead so Ops can pick it up.
  const handoverAdminLeads: AdminLead[] = [];
  const handoverLinks = new Map<string, string>(); // salesLeadId -> adminLeadId
  for (const lead of finalSalesLeads) {
    if (lead.createdByRole !== "partner") continue;
    if (lead.qualificationStage !== "Qualifies") continue;
    if (lead.linkedAdminLeadId) continue;
    if (!lead.ownerId) continue;

    const stub = buildAdminLeadStubFromSalesLead({
      contactName: lead.contactName,
      company: lead.company,
      email: lead.email,
      ownerId: lead.ownerId,
    });
    if (!stub) continue;

    const stamped: AdminLead = {
      ...stub.lead,
      partnerOrgId: lead.partnerOrgId ?? null,
      linkedSalesLeadId: lead.id,
      events: [
        ...stub.lead.events,
        {
          id: `${stub.lead.id}-handover`,
          title: "Lead qualified by sales",
          detail: "Auto-created from partner referral on qualification.",
          createdAt: new Date().toLocaleString(),
          tone: "system",
        },
      ],
    };
    handoverAdminLeads.push(stamped);
    handoverLinks.set(lead.id, stamped.id);
  }

  const finalSalesLeadsWithLinks =
    handoverLinks.size > 0
      ? finalSalesLeads.map((lead) =>
          handoverLinks.has(lead.id)
            ? { ...lead, linkedAdminLeadId: handoverLinks.get(lead.id)! }
            : lead,
        )
      : finalSalesLeads;

  const finalLeadsWithHandover =
    handoverAdminLeads.length > 0 ? [...handoverAdminLeads, ...finalLeads] : finalLeads;

  const nextSnapshot = {
    ...snapshot,
    leads: finalLeadsWithHandover,
    salesLeads: finalSalesLeadsWithLinks,
  };

  try {
    const backend = await writeAdminStateSnapshot(nextSnapshot, session.email);
    return NextResponse.json({ ok: true, backend, snapshot: nextSnapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: "Unable to persist mutation.", detail: message },
      { status: 500 },
    );
  }
}
