import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { MIGRATION_CASE_DOCUMENT_BUCKET } from "@/lib/migration-case-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_URL_SECONDS = 60 * 10;

export type CaseFileGroup = "utility_bill" | "kyc" | "partner_proposal" | "assessment" | "term_sheet";

type CaseFile = {
  id: string;
  group: CaseFileGroup;
  label: string;
  originalName: string;
  storagePath: string;
  sizeBytes: number | null;
  createdAt: string;
  url: string | null;
};

/**
 * Every document held against a case, with short-lived signed URLs. This is the
 * operator's way to get the client's utility bills out for offline analysis.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  const { id } = await params;
  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Storage unavailable." }, { status: 503 });
  }

  const collected: Omit<CaseFile, "url">[] = [];

  const { data: billFiles } = await client
    .from("migration_case_bill_files")
    .select("id,original_name,storage_path,file_size_bytes,created_at")
    .eq("case_id", id)
    .order("created_at", { ascending: true });
  for (const row of billFiles ?? []) {
    collected.push({
      id: row.id as string,
      group: "utility_bill",
      label: "Utility bill",
      originalName: (row.original_name as string) ?? "bill.pdf",
      storagePath: row.storage_path as string,
      sizeBytes: (row.file_size_bytes as number | null) ?? null,
      createdAt: row.created_at as string,
    });
  }

  const { data: kycFiles } = await client
    .from("migration_case_kyc_documents")
    .select("id,document_type,original_name,storage_path,file_size_bytes,created_at,status")
    .eq("case_id", id)
    .order("created_at", { ascending: true });
  for (const row of kycFiles ?? []) {
    collected.push({
      id: row.id as string,
      group: "kyc",
      label: `KYC: ${String(row.document_type).replace(/_/g, " ")}`,
      originalName: (row.original_name as string) ?? "document.pdf",
      storagePath: row.storage_path as string,
      sizeBytes: (row.file_size_bytes as number | null) ?? null,
      createdAt: row.created_at as string,
    });
  }

  const { data: proposals } = await client
    .from("migration_case_proposals")
    .select("id,document_storage_path,document_original_name,document_file_size_bytes,created_at,source")
    .eq("case_id", id)
    .order("created_at", { ascending: true });
  for (const row of proposals ?? []) {
    if (!row.document_storage_path) continue;
    collected.push({
      id: row.id as string,
      group: "assessment",
      label: "Published assessment",
      originalName: (row.document_original_name as string) ?? "assessment.pdf",
      storagePath: row.document_storage_path as string,
      sizeBytes: (row.document_file_size_bytes as number | null) ?? null,
      createdAt: row.created_at as string,
    });
  }

  const { data: partnerProposals } = await client
    .from("migration_case_partner_proposals")
    .select("id,issued_storage_path,issued_original_name,signed_storage_path,signed_original_name,created_at")
    .eq("case_id", id);
  for (const row of partnerProposals ?? []) {
    if (row.issued_storage_path) {
      collected.push({
        id: `${row.id}-issued`,
        group: "partner_proposal",
        label: "Formal proposal (issued)",
        originalName: (row.issued_original_name as string) ?? "proposal.pdf",
        storagePath: row.issued_storage_path as string,
        sizeBytes: null,
        createdAt: row.created_at as string,
      });
    }
    if (row.signed_storage_path) {
      collected.push({
        id: `${row.id}-signed`,
        group: "partner_proposal",
        label: "Formal proposal (signed)",
        originalName: (row.signed_original_name as string) ?? "proposal-signed.pdf",
        storagePath: row.signed_storage_path as string,
        sizeBytes: null,
        createdAt: row.created_at as string,
      });
    }
  }

  const files: CaseFile[] = await Promise.all(collected.map(async (entry) => {
    const { data } = await client.storage
      .from(MIGRATION_CASE_DOCUMENT_BUCKET)
      .createSignedUrl(entry.storagePath, SIGNED_URL_SECONDS);
    return { ...entry, url: data?.signedUrl ?? null };
  }));

  return NextResponse.json({ ok: true, files });
}
