import crypto from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Funder deal rooms — the containment layer.
 *
 * A deal room is created per validated-bankable deal. The funder receives an
 * unguessable link; the room exposes ONLY explicitly granted documents plus a
 * bankability summary. Every open/view/download is written to an access log —
 * the evidence trail that any client the funder later approaches came through
 * Foundation-1. Rejected/parked clients never get a room.
 *
 * Tables (supabase/migrations/20260706120000_platform_kyc_dealrooms_associations.sql):
 *   deal_rooms(id, assessment_id?, lead_id?, funder_name, access_token_hash,
 *              status, bankability_summary, opened_at, expires_at)
 *   deal_room_grants(deal_room_id, document_id -> oneos_client_documents.id, revoked_at)
 *   deal_room_access_log(deal_room_id, document_id?, action, actor_label, ip_hash, user_agent)
 */

export type DealRoomStatus = "draft" | "active" | "suspended" | "closed";

export type DealRoomSummary = {
  id: string;
  leadId: string | null;
  assessmentId: string | null;
  funderName: string;
  status: DealRoomStatus;
  createdAt: string;
  openedAt: string | null;
  expiresAt: string | null;
  bankabilitySummary: Record<string, unknown> | null;
  grantedDocumentIds: string[];
};

export type DealRoomDocument = {
  id: string;
  title: string;
  category: string;
  fileType: string;
  fileName: string | null;
  contentType: string | null;
  storagePath: string | null;
  uploadedAt: string | null;
};

const TOKEN_BYTES = 24;

/**
 * Signing secret for deal-room tokens.
 *
 * Previously this fell back to SUPABASE_SERVICE_ROLE_KEY and then to a literal
 * string. Both are bad: the first couples document access to the database
 * credential, and the second is a published constant. Production must supply a
 * dedicated secret; development gets a clearly-marked local one.
 */
function tokenSecret() {
  const explicit = process.env.DEAL_ROOM_TOKEN_SECRET?.trim()
    || process.env.MIGRATION_ACCESS_CODE_SECRET?.trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DEAL_ROOM_TOKEN_SECRET is not configured. Set it before issuing deal-room links.",
    );
  }
  return "foundation1-dealroom-local-development-only";
}

export function newDealRoomToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashDealRoomToken(token: string) {
  return crypto.createHmac("sha256", tokenSecret()).update(`dealroom:${token}`).digest("hex");
}

export function hashIp(ip: string) {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

export function isMissingDealRoomTables(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("deal_rooms") || message.includes("deal_room_");
}

type DealRoomRow = {
  id: string;
  assessment_id: string | null;
  lead_id: string | null;
  funder_name: string;
  status: string;
  created_at: string;
  opened_at: string | null;
  expires_at: string | null;
  bankability_summary: Record<string, unknown> | null;
};

function toSummary(row: DealRoomRow, grantedDocumentIds: string[]): DealRoomSummary {
  return {
    id: row.id,
    leadId: row.lead_id,
    assessmentId: row.assessment_id,
    funderName: row.funder_name,
    status: (row.status as DealRoomStatus) ?? "draft",
    createdAt: row.created_at,
    openedAt: row.opened_at,
    expiresAt: row.expires_at,
    bankabilitySummary: row.bankability_summary,
    grantedDocumentIds,
  };
}

export async function createDealRoom(options: {
  leadId?: string;
  assessmentId?: string;
  funderName?: string;
  bankabilitySummary?: Record<string, unknown>;
  documentIds: string[];
  grantedBy: string;
  expiresAt?: string;
}): Promise<{ room: DealRoomSummary; token: string } | { error: string }> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { error: "Supabase is not configured." };
  if (!options.leadId && !options.assessmentId) {
    return { error: "A deal room needs a lead or an assessment." };
  }

  const token = newDealRoomToken();
  const { data, error } = await supabase
    .from("deal_rooms")
    .insert({
      lead_id: options.leadId ?? null,
      assessment_id: options.assessmentId ?? null,
      funder_name: options.funderName ?? "Nedbank/Eqstra via Green Share",
      access_token_hash: hashDealRoomToken(token),
      status: "active",
      bankability_summary: options.bankabilitySummary ?? null,
      expires_at: options.expiresAt ?? null,
    })
    .select("id, assessment_id, lead_id, funder_name, status, created_at, opened_at, expires_at, bankability_summary")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create the deal room." };
  }

  const grants = options.documentIds.map((documentId) => ({
    deal_room_id: data.id,
    document_id: documentId,
    granted_by: options.grantedBy,
  }));
  if (grants.length > 0) {
    const { error: grantError } = await supabase.from("deal_room_grants").insert(grants);
    if (grantError) return { error: grantError.message };
  }

  return { room: toSummary(data as DealRoomRow, options.documentIds), token };
}

export async function findDealRoomByToken(token: string): Promise<DealRoomSummary | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("deal_rooms")
    .select("id, assessment_id, lead_id, funder_name, status, created_at, opened_at, expires_at, bankability_summary")
    .eq("access_token_hash", hashDealRoomToken(token))
    .limit(1);
  if (error || !data?.[0]) return null;
  const room = data[0] as DealRoomRow;

  const { data: grantRows } = await supabase
    .from("deal_room_grants")
    .select("document_id, revoked_at")
    .eq("deal_room_id", room.id);
  const grantedDocumentIds = (grantRows ?? [])
    .filter((grant) => !grant.revoked_at)
    .map((grant) => String(grant.document_id));

  return toSummary(room, grantedDocumentIds);
}

export function isRoomOpen(room: DealRoomSummary) {
  if (room.status !== "active") return false;
  if (room.expiresAt && new Date(room.expiresAt).getTime() < Date.now()) return false;
  return true;
}

export async function listGrantedDocuments(room: DealRoomSummary): Promise<DealRoomDocument[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase || room.grantedDocumentIds.length === 0) return [];
  const { data, error } = await supabase
    .from("oneos_client_documents")
    .select("id, title, category, file_type, file_name, content_type, storage_path, created_at")
    .in("id", room.grantedDocumentIds);
  if (error || !data) return [];
  return data.map((row) => ({
    id: String(row.id),
    title: String(row.title ?? "Document"),
    category: String(row.category ?? ""),
    fileType: String(row.file_type ?? "PDF"),
    fileName: typeof row.file_name === "string" ? row.file_name : null,
    contentType: typeof row.content_type === "string" ? row.content_type : null,
    storagePath: typeof row.storage_path === "string" ? row.storage_path : null,
    uploadedAt: typeof row.created_at === "string" ? row.created_at : null,
  }));
}

export async function logDealRoomAccess(options: {
  dealRoomId: string;
  action: "room_opened" | "document_viewed" | "document_downloaded" | "summary_viewed";
  documentId?: string;
  actorLabel?: string;
  ip?: string;
  userAgent?: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  await supabase.from("deal_room_access_log").insert({
    deal_room_id: options.dealRoomId,
    document_id: options.documentId ?? null,
    action: options.action,
    actor_label: options.actorLabel ?? null,
    ip_hash: options.ip ? hashIp(options.ip) : null,
    user_agent: options.userAgent?.slice(0, 300) ?? null,
  });
  if (options.action === "room_opened") {
    await supabase
      .from("deal_rooms")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", options.dealRoomId)
      .is("opened_at", null);
  }
}
