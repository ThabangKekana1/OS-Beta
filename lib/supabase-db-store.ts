import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  normalizeAdminStateSnapshot,
  type AdminStateSnapshot,
} from "@/lib/admin-state";
import { normalizeAdminLeads } from "@/lib/admin-storage";
import { migrationLinkIdForLead, registrationLinkIdForLead } from "@/lib/registration-links";
import {
  adminLeadContactStatuses,
  adminLeadOrigins,
  adminLeadPartners,
  adminLeadStages,
  type AdminLead,
  type AdminLeadContactStatus,
  type AdminLeadDocument,
  type AdminLeadOrigin,
  type AdminLeadPartner,
  type AdminLeadPriority,
  type AdminLeadStage,
  type PartnerOrg,
  type SalesLead,
} from "@/lib/admin-types";

type StoreReadResult<T> = {
  found: boolean;
  snapshot: T | null;
};

type ReadAdminStateOptions = {
  includeSalesLeads?: boolean;
  leadOwnerId?: string | null;
};

const SUPABASE_PAGE_SIZE = 1000;
const ADMIN_LEAD_COMPACT_SELECT = `
  id,
  client_profile_id,
  company,
  business_registration_number,
  contact_name,
  contact_email,
  owner_id,
  stage,
  priority,
  readiness_score,
  estimated_value_zar,
  eoi_signing_token,
  eoi_signed_at,
  onboarding_completed_at,
  disqualified_at,
  created_at,
  industry:payload->industry,
  monthly_spend:payload->monthlyElectricitySpendEstimateZar,
  is_business_registered:payload->isBusinessRegistered,
  is_business_operational:payload->isBusinessOperational,
  has_six_month_utility_bill:payload->hasSixMonthUtilityBill,
  contact_status:payload->contactStatus,
  profile_id:payload->userProfile->id,
  profile_full_name:payload->userProfile->fullName,
  profile_phone:payload->userProfile->phone,
  profile_role:payload->userProfile->role,
  profile_joined_at:payload->userProfile->joinedAt,
  physical_address:payload->physicalAddress,
  city:payload->city,
  province:payload->province,
  origin:payload->origin,
  partner:payload->partner,
  partner_org_id:payload->partnerOrgId,
  source:payload->source,
  last_touched:payload->lastTouched,
  next_action:payload->nextAction,
  payload
`;
const adminLeadStageSet = new Set<string>(adminLeadStages);
const adminLeadContactStatusSet = new Set<string>(adminLeadContactStatuses);
const adminLeadOriginSet = new Set<string>(adminLeadOrigins);
const adminLeadPartnerSet = new Set<string>(adminLeadPartners);
const adminLeadPrioritySet = new Set<string>(["Standard", "Priority", "Executive"]);
const adminLeadSourceSet = new Set<string>(["Migrate Portal", "Referral", "Outbound"]);

type CompactAdminLeadRow = {
  id: string | null;
  client_profile_id: string | null;
  company: string | null;
  business_registration_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  owner_id: string | null;
  stage: string | null;
  priority: string | null;
  readiness_score: number | null;
  estimated_value_zar: number | null;
  eoi_signing_token: string | null;
  eoi_signed_at: string | null;
  onboarding_completed_at: string | null;
  disqualified_at: string | null;
  created_at: string | null;
  industry?: unknown;
  monthly_spend?: unknown;
  is_business_registered?: unknown;
  is_business_operational?: unknown;
  has_six_month_utility_bill?: unknown;
  contact_status?: unknown;
  profile_id?: unknown;
  profile_full_name?: unknown;
  profile_phone?: unknown;
  profile_role?: unknown;
  profile_joined_at?: unknown;
  physical_address?: unknown;
  city?: unknown;
  province?: unknown;
  origin?: unknown;
  partner?: unknown;
  partner_org_id?: unknown;
  source?: unknown;
  last_touched?: unknown;
  next_action?: unknown;
  payload?: unknown;
};

type AdminLeadDocumentRow = {
  lead_id: string | null;
  payload: unknown;
};

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

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function nullableStringValue(value: unknown) {
  const text = stringValue(value);
  return text.length > 0 ? text : null;
}

function numberValue(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  return typeof value === "string" && allowed.has(value) ? (value as T) : fallback;
}

function partnerValue(value: unknown): AdminLeadPartner | null {
  return typeof value === "string" && adminLeadPartnerSet.has(value)
    ? (value as AdminLeadPartner)
    : null;
}

function splitContactName(contactName: string) {
  const parts = contactName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? contactName,
    surname: parts.slice(1).join(" "),
  };
}

function compactAdminLeadFromRow(
  row: CompactAdminLeadRow,
  documents: AdminLeadDocument[],
): AdminLead | null {
  const id = stringValue(row.id);
  if (!id) {
    return null;
  }

  const company = stringValue(row.company, "Unknown company");
  const contactEmail = stringValue(row.contact_email).toLowerCase();
  const profileFullName = stringValue(row.profile_full_name);
  const contactName = stringValue(
    row.contact_name,
    profileFullName || contactEmail || "Unknown contact",
  );
  const { firstName, surname } = splitContactName(contactName);
  const role = stringValue(row.profile_role, "Owner");
  const stage = oneOf<AdminLeadStage>(
    row.stage,
    adminLeadStageSet,
    "Client Registered",
  );
  const disqualifiedAt = toIsoOrNull(row.disqualified_at);
  const createdAt = toIsoOrNull(row.created_at) ?? new Date().toISOString();

  const compactLead: AdminLead = {
    id,
    clientProfileId: stringValue(row.client_profile_id, `profile-${id}`),
    createdAt,
    registeredAt: createdAt,
    manuallyAddedAt: null,
    company,
    businessRegistrationNumber: stringValue(row.business_registration_number),
    industry: stringValue(row.industry),
    contactFirstName: firstName,
    contactSurname: surname,
    contactPosition: role,
    contactName,
    monthlyElectricitySpendEstimateZar: Math.max(0, Math.round(numberValue(row.monthly_spend))),
    isBusinessRegistered: booleanValue(
      row.is_business_registered,
      Boolean(stringValue(row.business_registration_number)),
    ),
    isClientRegistered: true,
    isBusinessOperational: booleanValue(row.is_business_operational, true),
    hasSixMonthUtilityBill: booleanValue(row.has_six_month_utility_bill),
    physicalAddress: stringValue(row.physical_address),
    city: stringValue(row.city),
    province: stringValue(row.province),
    source: oneOf<AdminLead["source"]>(row.source, adminLeadSourceSet, "Outbound"),
    origin: oneOf<AdminLeadOrigin>(row.origin, adminLeadOriginSet, "imported"),
    partner: partnerValue(row.partner),
    partnerOrgId: nullableStringValue(row.partner_org_id),
    stage,
    contactStatus: oneOf<AdminLeadContactStatus>(
      row.contact_status,
      adminLeadContactStatusSet,
      "Not Contacted",
    ),
    priority: oneOf<AdminLeadPriority>(row.priority, adminLeadPrioritySet, "Standard"),
    ownerId: stringValue(row.owner_id, "agent-karman"),
    linkedSalesLeadId: null,
    registrationSource: null,
    readinessScore: numberValue(row.readiness_score),
    estimatedValueZar: Math.max(0, Math.round(numberValue(row.estimated_value_zar))),
    lastTouched: stringValue(row.last_touched, "Imported"),
    nextAction: stringValue(row.next_action, "Send outreach email."),
    migrateAccountName: company,
    migrateAccountId: id,
    userProfile: {
      id: stringValue(row.profile_id, `usr-${id}`),
      fullName: profileFullName || contactName,
      email: contactEmail,
      phone: stringValue(row.profile_phone),
      role,
      joinedAt: stringValue(row.profile_joined_at, createdAt),
    },
    eoiSigningToken: nullableStringValue(row.eoi_signing_token),
    eoiSignatureId: null,
    eoiSignedBy: null,
    eoiSignedAt: toIsoOrNull(row.eoi_signed_at),
    eoiAcceptedTermsAt: null,
    onboardingCompletedAt: toIsoOrNull(row.onboarding_completed_at),
    disqualification: disqualifiedAt
      ? {
          reason: "Disqualified",
          by: "system",
          at: disqualifiedAt,
        }
      : null,
    tasks: [],
    documents,
    notes: [],
    events: [],
  };

  if (row.payload && typeof row.payload === "object") {
    const payloadRecord = row.payload as Partial<AdminLead>;
    const payloadHasCreatedAt = typeof payloadRecord.createdAt === "string" && payloadRecord.createdAt.trim().length > 0;
    const payloadHasRegisteredAt = typeof payloadRecord.registeredAt === "string" && payloadRecord.registeredAt.trim().length > 0;
    const payloadHasManuallyAddedAt = typeof payloadRecord.manuallyAddedAt === "string" && payloadRecord.manuallyAddedAt.trim().length > 0;
    const [payloadLead] = normalizeAdminLeads([row.payload as AdminLead]);
    if (payloadLead?.id) {
      const isManualLead =
        payloadLead.origin === "created" && payloadLead.registrationSource?.channel !== "public_link";
      const hasRegistrationSignal = Boolean(
        payloadLead.isClientRegistered ||
          payloadLead.registrationSource?.channel === "public_link" ||
          payloadLead.migrationAssessment,
      );
      return {
        ...payloadLead,
        createdAt: payloadHasCreatedAt ? payloadLead.createdAt : createdAt,
        registeredAt: payloadHasRegisteredAt
          ? payloadLead.registeredAt
          : hasRegistrationSignal
            ? createdAt
            : null,
        manuallyAddedAt: payloadHasManuallyAddedAt
          ? payloadLead.manuallyAddedAt
          : isManualLead
            ? createdAt
            : null,
        documents: documents.length > 0 ? documents : payloadLead.documents,
      };
    }
  }

  return compactLead;
}

function adminLeadRow(lead: AdminLead) {
  const createdAt = toIsoOrNull(lead.createdAt);
  const row: {
    id: string;
    client_profile_id: string;
    company: string;
    business_registration_number: string;
    contact_name: string;
    contact_email: string;
    owner_id: string;
    stage: AdminLeadStage;
    priority: AdminLeadPriority;
    readiness_score: number;
    estimated_value_zar: number;
    eoi_signing_token: string | null;
    eoi_signed_at: string | null;
    onboarding_completed_at: string | null;
    disqualified_at: string | null;
    payload: AdminLead;
    created_at?: string;
  } = {
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

  if (createdAt) {
    row.created_at = createdAt;
  }

  return row;
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

async function readAdminLeadRows(ownerId?: string | null): Promise<{
  data: CompactAdminLeadRow[] | null;
  error: { code?: string; message?: string } | null;
}> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { data: null, error: null };
  }

  const ownerFilter = ownerId?.trim() || null;
  let countQuery = supabase
    .from("oneos_admin_leads")
    .select("id", { count: "exact", head: true });
  if (ownerFilter) {
    countQuery = countQuery.eq("owner_id", ownerFilter);
  }
  const countResult = await countQuery;
  if (countResult.error) {
    return { data: null, error: countResult.error };
  }

  const totalRows = countResult.count ?? 0;
  if (totalRows === 0) {
    return { data: [], error: null };
  }

  const rows: CompactAdminLeadRow[] = [];
  const pageCount = Math.ceil(totalRows / SUPABASE_PAGE_SIZE);
  const pageResults = await Promise.all(
    Array.from({ length: pageCount }, (_unused, pageIndex) => {
      const from = pageIndex * SUPABASE_PAGE_SIZE;
      let pageQuery = supabase
        .from("oneos_admin_leads")
        .select(ADMIN_LEAD_COMPACT_SELECT)
        .range(from, from + SUPABASE_PAGE_SIZE - 1);
      if (ownerFilter) {
        pageQuery = pageQuery.eq("owner_id", ownerFilter);
      }
      return pageQuery;
    }),
  );

  for (const { data, error } of pageResults) {
    if (error) {
      return { data: null, error };
    }

    rows.push(...((data ?? []) as CompactAdminLeadRow[]));
  }

  return { data: rows, error: null };
}

async function readAdminLeadDocumentRows(): Promise<{
  data: AdminLeadDocumentRow[] | null;
  error: { code?: string; message?: string } | null;
}> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { data: null, error: null };
  }

  const rows: AdminLeadDocumentRow[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("oneos_client_documents")
      .select("lead_id, payload")
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (error) {
      return { data: null, error };
    }

    const page = (data ?? []) as AdminLeadDocumentRow[];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) {
      return { data: rows, error: null };
    }
  }
}

async function readPayloadRows(
  table: "oneos_sales_leads",
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

export async function readAdminStateFromDatabase(
  options: ReadAdminStateOptions = {},
): Promise<StoreReadResult<AdminStateSnapshot>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { found: false, snapshot: null };
  }
  const includeSalesLeads = options.includeSalesLeads ?? true;

  const [stateResult, leadsResult, salesLeadsResult] = await Promise.all([
    supabase
      .from("oneos_admin_state")
      .select("active_lead_id, partner_orgs")
      .eq("id", "singleton")
      .maybeSingle(),
    readAdminLeadRows(options.leadOwnerId),
    includeSalesLeads
      ? readPayloadRows("oneos_sales_leads")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const documentRowsResult =
    leadsResult.error || isMissingRelationError(leadsResult.error)
      ? { data: [], error: null }
      : await readAdminLeadDocumentRows();

  if (
    isMissingRelationError(stateResult.error) ||
    isMissingRelationError(leadsResult.error) ||
    isMissingRelationError(salesLeadsResult.error) ||
    isMissingRelationError(documentRowsResult.error)
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

  if (documentRowsResult.error) {
    throw documentRowsResult.error;
  }

  const documentsByLeadId = new Map<string, AdminLeadDocument[]>();
  for (const row of documentRowsResult.data ?? []) {
    if (!row.lead_id) continue;
    const documents = documentsByLeadId.get(row.lead_id) ?? [];
    documents.push(row.payload as AdminLeadDocument);
    documentsByLeadId.set(row.lead_id, documents);
  }

  const leads = (leadsResult.data ?? [])
    .map((row) => compactAdminLeadFromRow(row, documentsByLeadId.get(row.id ?? "") ?? []))
    .filter((lead): lead is AdminLead => Boolean(lead));
  const salesLeads = includeSalesLeads
    ? payloadFromRows<SalesLead>(salesLeadsResult.data ?? [])
    : [];
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

/**
 * Targeted lookup: returns all leads matching a contact email (typically 1–2 rows).
 * Used by public registration routes to check for an existing signup-shell lead.
 */
export async function findLeadsByEmailFromDatabase(email: string): Promise<AdminLead[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return [];

  const { data, error } = await supabase
    .from("oneos_admin_leads")
    .select("payload")
    .eq("contact_email", normalizedEmail)
    .limit(10);

  if (isMissingRelationError(error)) return [];
  if (error) throw error;

  return (data ?? []).map((row) => row.payload as AdminLead).filter(Boolean);
}

/**
 * Targeted lookup: finds a lead whose registration link hash matches linkId.
 * Scans only 3 small columns (no payload, no documents) to avoid full-table reads,
 * then fetches the full payload only for the matching row.
 */
export async function findLeadByRegistrationLinkFromDatabase(
  linkId: string,
): Promise<AdminLead | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  // Lightweight scan — just 3 varchar columns, no JSON payload, no document join.
  const rows: Array<{ id: string; client_profile_id: string | null; contact_email: string | null }> = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("oneos_admin_leads")
      .select("id, client_profile_id, contact_email")
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (isMissingRelationError(error)) return null;
    if (error) throw error;

    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }

  const matchedRow = rows.find(
    (row) =>
      registrationLinkIdForLead({
        leadId: row.id,
        clientProfileId: row.client_profile_id ?? "",
        email: row.contact_email ?? "",
      }) === linkId,
  );

  if (!matchedRow) return null;

  // Fetch only the matched lead's payload.
  const { data: fullData, error: fullError } = await supabase
    .from("oneos_admin_leads")
    .select("payload")
    .eq("id", matchedRow.id)
    .single();

  if (isMissingRelationError(fullError)) return null;
  if (fullError) throw fullError;

  return (fullData?.payload as AdminLead | null) ?? null;
}

/**
 * Targeted lookup: resolves the dedicated migration-estimate link for an
 * existing lead. This lets outreach recipients generate an estimate without
 * creating a duplicate lead record.
 */
export async function findLeadByMigrationLinkFromDatabase(
  linkId: string,
): Promise<AdminLead | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const rows: Array<{ id: string; client_profile_id: string | null; contact_email: string | null }> = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("oneos_admin_leads")
      .select("id, client_profile_id, contact_email")
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (isMissingRelationError(error)) return null;
    if (error) throw error;

    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }

  const matchedRow = rows.find(
    (row) =>
      migrationLinkIdForLead({
        leadId: row.id,
        clientProfileId: row.client_profile_id ?? "",
        email: row.contact_email ?? "",
      }) === linkId,
  );

  if (!matchedRow) return null;

  const { data: fullData, error: fullError } = await supabase
    .from("oneos_admin_leads")
    .select("payload")
    .eq("id", matchedRow.id)
    .single();

  if (isMissingRelationError(fullError)) return null;
  if (fullError) throw fullError;

  return (fullData?.payload as AdminLead | null) ?? null;
}

export async function upsertSingleLeadToDatabase(
  lead: AdminLead,
  updatedBy: string,
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const leadResult = await supabase
    .from("oneos_admin_leads")
    .upsert(adminLeadRow(lead), { onConflict: "id" });

  if (isMissingRelationError(leadResult.error)) return false;
  if (leadResult.error) throw leadResult.error;

  const leadDocRows = documentRows(lead);
  if (leadDocRows.length > 0) {
    const docResult = await supabase
      .from("oneos_client_documents")
      .upsert(leadDocRows, { onConflict: "id" });
    if (isMissingRelationError(docResult.error)) return false;
    if (docResult.error) throw docResult.error;
  }

  const stateResult = await supabase
    .from("oneos_admin_state")
    .upsert(
      { id: "singleton", active_lead_id: lead.id, updated_by: updatedBy },
      { onConflict: "id" },
    );
  if (isMissingRelationError(stateResult.error)) return false;
  if (stateResult.error) throw stateResult.error;

  return true;
}

/**
 * Upserts a single admin lead row (and its documents) without touching the
 * admin_state singleton. Use this for background activity updates (e.g. email
 * sent / reply received) where we must not flip the dashboard's active lead.
 */
export async function upsertAdminLeadOnly(lead: AdminLead): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const leadResult = await supabase
    .from("oneos_admin_leads")
    .upsert(adminLeadRow(lead), { onConflict: "id" });

  if (isMissingRelationError(leadResult.error)) return false;
  if (leadResult.error) throw leadResult.error;

  const leadDocRows = documentRows(lead);
  if (leadDocRows.length > 0) {
    const docResult = await supabase
      .from("oneos_client_documents")
      .upsert(leadDocRows, { onConflict: "id" });
    if (isMissingRelationError(docResult.error)) return false;
    if (docResult.error) throw docResult.error;
  }

  return true;
}

export async function writeAdminLeadDeltaToDatabase({
  leadUpserts,
  leadDeletes,
  activeLeadId,
  partnerOrgs,
  updatedBy,
}: {
  leadUpserts: AdminLead[];
  leadDeletes: string[];
  activeLeadId: string | null;
  partnerOrgs?: PartnerOrg[];
  updatedBy: string;
}): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const stateResult = await supabase
    .from("oneos_admin_state")
    .upsert(
      {
        id: "singleton",
        active_lead_id: activeLeadId,
        updated_by: updatedBy,
        partner_orgs: partnerOrgs ?? [],
      },
      { onConflict: "id" },
    );

  if (isMissingRelationError(stateResult.error)) return false;
  if (stateResult.error) throw stateResult.error;

  if (leadDeletes.length > 0) {
    const deleteResult = await supabase
      .from("oneos_admin_leads")
      .delete()
      .in("id", leadDeletes);

    if (isMissingRelationError(deleteResult.error)) return false;
    if (deleteResult.error) throw deleteResult.error;
  }

  if (leadUpserts.length > 0) {
    const leadResult = await supabase
      .from("oneos_admin_leads")
      .upsert(leadUpserts.map(adminLeadRow), { onConflict: "id" });

    if (isMissingRelationError(leadResult.error)) return false;
    if (leadResult.error) throw leadResult.error;
  }

  const leadDocumentRows = leadUpserts.flatMap(documentRows);
  if (leadDocumentRows.length > 0) {
    const documentResult = await supabase
      .from("oneos_client_documents")
      .upsert(leadDocumentRows, { onConflict: "id" });

    if (isMissingRelationError(documentResult.error)) return false;
    if (documentResult.error) throw documentResult.error;
  }

  return true;
}

/**
 * Upserts a single sales lead row. Used alongside upsertAdminLeadOnly for
 * background activity updates.
 */
export async function upsertSalesLeadOnly(lead: SalesLead): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const result = await supabase
    .from("oneos_sales_leads")
    .upsert(salesLeadRow(lead), { onConflict: "id" });

  if (isMissingRelationError(result.error)) return false;
  if (result.error) throw result.error;

  return true;
}

/**
 * Fetches a single admin lead's payload by id. Returns null if not found.
 */
export async function readAdminLeadByIdFromDatabase(
  leadId: string,
): Promise<AdminLead | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("oneos_admin_leads")
    .select("payload")
    .eq("id", leadId)
    .maybeSingle();

  if (isMissingRelationError(error)) return null;
  if (error) throw error;

  return (data?.payload as AdminLead | null) ?? null;
}

/**
 * Fetches a single sales lead's payload by id, or by its linked admin lead id.
 * Returns the first match (sales leads are 1:1 with admin leads in practice).
 */
export async function readSalesLeadForAdminLeadFromDatabase(
  adminLeadId: string,
  linkedSalesLeadId: string | null,
): Promise<SalesLead | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  if (linkedSalesLeadId) {
    const { data, error } = await supabase
      .from("oneos_sales_leads")
      .select("payload")
      .eq("id", linkedSalesLeadId)
      .maybeSingle();
    if (isMissingRelationError(error)) return null;
    if (error) throw error;
    if (data?.payload) return data.payload as SalesLead;
  }

  // Fallback: scan payload for linkedAdminLeadId match. Bounded to a small page
  // because there's typically at most one row.
  const { data, error } = await supabase
    .from("oneos_sales_leads")
    .select("payload")
    .filter("payload->>linkedAdminLeadId", "eq", adminLeadId)
    .limit(1);

  if (isMissingRelationError(error)) return null;
  if (error) throw error;

  const row = (data ?? [])[0];
  return (row?.payload as SalesLead | null) ?? null;
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
