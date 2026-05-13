import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  normalizeAdminStateSnapshot,
  type AdminStateSnapshot,
} from "@/lib/admin-state";
import { normalizeWorkspaceStateSnapshot, type WorkspaceStateSnapshot } from "@/lib/workspace-state";
import type { AdminLead, PartnerOrg, SalesLead } from "@/lib/admin-types";

type StoreReadResult<T> = {
  found: boolean;
  snapshot: T | null;
};

const SUPABASE_PAGE_SIZE = 1000;

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("does not exist");
}

function toIsoOrNull(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function adminLeadRow(lead: AdminLead) {
  return {
    id: lead.id,
    client_profile_id: lead.clientProfileId,
    company: lead.company,
    business_registration_number: lead.businessRegistrationNumber,
    contact_name: lead.contactName,
    contact_email: lead.userProfile.email,
    owner_id: lead.ownerId,
    stage: lead.stage,
    priority: lead.priority,
    readiness_score: lead.readinessScore,
    estimated_value_zar: Number.isFinite(lead.estimatedValueZar)
      ? Math.max(0, Math.round(lead.estimatedValueZar))
      : 0,
    eoi_signing_token: lead.eoiSigningToken,
    eoi_signed_at: toIsoOrNull(lead.eoiSignedAt),
    onboarding_completed_at: toIsoOrNull(lead.onboardingCompletedAt),
    disqualified_at: lead.disqualification ? new Date().toISOString() : null,
    payload: lead,
  };
}

function salesLeadRow(lead: SalesLead) {
  return {
    id: lead.id,
    owner_id: lead.ownerId,
    contact_name: lead.contactName,
    company: lead.company,
    email: lead.email,
    qualification_stage: lead.qualificationStage,
    qualification_reason: lead.qualificationReason,
    status: lead.status,
    converted_client_profile_id: lead.convertedClientProfileId,
    payload: lead,
    created_at: lead.createdAt,
    updated_at: lead.lastUpdatedAt,
  };
}

function documentRows(lead: AdminLead) {
  return lead.documents.map((document) => ({
    id: document.id,
    lead_id: lead.id,
    client_profile_id: lead.clientProfileId,
    title: document.title,
    category: document.category,
    file_type: document.fileType,
    status: document.status,
    uploaded_by: document.uploadedBy,
    uploaded_by_type: document.uploadedByType,
    storage_path: document.storagePath ?? null,
    file_name: document.fileName ?? null,
    content_type: document.contentType ?? null,
    payload: document,
  }));
}

function payloadFromRows<T>(rows: Array<{ payload: unknown }>) {
  return rows.map((row) => row.payload) as T[];
}

async function readPayloadRows(
  table: "oneos_admin_leads" | "oneos_sales_leads",
): Promise<{
  data: Array<{ payload: unknown }> | null;
  error: { code?: string; message?: string } | null;
}> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { data: null, error: null };
  }

  const rows: Array<{ payload: unknown }> = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select("payload, updated_at")
      .order("updated_at", { ascending: false })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      return { data: null, error };
    }

    const page = (data ?? []) as Array<{ payload: unknown }>;
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) {
      return { data: rows, error: null };
    }
  }
}

export async function readAdminStateFromDatabase(): Promise<StoreReadResult<AdminStateSnapshot>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { found: false, snapshot: null };
  }

  const [stateResult, leadsResult, salesLeadsResult] = await Promise.all([
    supabase
      .from("oneos_admin_state")
      .select("active_lead_id, partner_orgs")
      .eq("id", "singleton")
      .maybeSingle(),
    readPayloadRows("oneos_admin_leads"),
    readPayloadRows("oneos_sales_leads"),
  ]);

  if (
    isMissingRelationError(stateResult.error) ||
    isMissingRelationError(leadsResult.error) ||
    isMissingRelationError(salesLeadsResult.error)
  ) {
    return { found: false, snapshot: null };
  }

  if (stateResult.error) {
    throw stateResult.error;
  }

  if (leadsResult.error) {
    throw leadsResult.error;
  }

  if (salesLeadsResult.error) {
    throw salesLeadsResult.error;
  }

  const leads = payloadFromRows<AdminLead>(leadsResult.data ?? []);
  const salesLeads = payloadFromRows<SalesLead>(salesLeadsResult.data ?? []);
  const partnerOrgsRaw = stateResult.data?.partner_orgs;
  const partnerOrgs: PartnerOrg[] = Array.isArray(partnerOrgsRaw)
    ? (partnerOrgsRaw as PartnerOrg[])
    : [];

  if (leads.length === 0 && salesLeads.length === 0 && partnerOrgs.length === 0) {
    return { found: false, snapshot: null };
  }

  const snapshot = normalizeAdminStateSnapshot({
    leads,
    activeLeadId: stateResult.data?.active_lead_id ?? leads[0]?.id ?? null,
    salesLeads,
    partnerOrgs,
  });

  return {
    found: Boolean(snapshot),
    snapshot,
  };
}

export async function writeAdminStateToDatabase(
  snapshot: AdminStateSnapshot,
  updatedBy: string,
) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return false;
  }

  const leadRows = snapshot.leads.map(adminLeadRow);
  const salesLeadRows = snapshot.salesLeads.map(salesLeadRow);
  const allDocumentRows = snapshot.leads.flatMap(documentRows);

  const stateResult = await supabase
    .from("oneos_admin_state")
    .upsert(
      {
        id: "singleton",
        active_lead_id: snapshot.activeLeadId,
        updated_by: updatedBy,
        partner_orgs: snapshot.partnerOrgs ?? [],
      },
      { onConflict: "id" },
    );

  if (isMissingRelationError(stateResult.error)) {
    return false;
  }

  if (stateResult.error) {
    throw stateResult.error;
  }

  if (leadRows.length > 0) {
    const result = await supabase
      .from("oneos_admin_leads")
      .upsert(leadRows, { onConflict: "id" });

    if (isMissingRelationError(result.error)) {
      return false;
    }

    if (result.error) {
      throw result.error;
    }
  }

  if (salesLeadRows.length > 0) {
    const result = await supabase
      .from("oneos_sales_leads")
      .upsert(salesLeadRows, { onConflict: "id" });

    if (isMissingRelationError(result.error)) {
      return false;
    }

    if (result.error) {
      throw result.error;
    }
  }

  if (allDocumentRows.length > 0) {
    const result = await supabase
      .from("oneos_client_documents")
      .upsert(allDocumentRows, { onConflict: "id" });

    if (isMissingRelationError(result.error)) {
      return false;
    }

    if (result.error) {
      throw result.error;
    }
  }

  return true;
}

export async function readWorkspaceStateFromDatabase(
  workspaceId: string,
): Promise<StoreReadResult<WorkspaceStateSnapshot>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { found: false, snapshot: null };
  }

  const result = await supabase
    .from("oneos_workspace_states")
    .select("payload")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (isMissingRelationError(result.error)) {
    return { found: false, snapshot: null };
  }

  if (result.error) {
    throw result.error;
  }

  const snapshot = result.data?.payload
    ? normalizeWorkspaceStateSnapshot(result.data.payload)
    : null;

  return {
    found: Boolean(snapshot),
    snapshot,
  };
}

export async function writeWorkspaceStateToDatabase(
  workspaceId: string,
  snapshot: WorkspaceStateSnapshot,
) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return false;
  }

  const result = await supabase
    .from("oneos_workspace_states")
    .upsert(
      {
        workspace_id: workspaceId,
        active_case_id: snapshot.activeCaseId,
        active_workspace_id: snapshot.activeWorkspaceId,
        cases: snapshot.cases,
        payload: snapshot,
      },
      { onConflict: "workspace_id" },
    );

  if (isMissingRelationError(result.error)) {
    return false;
  }

  if (result.error) {
    throw result.error;
  }

  return true;
}
