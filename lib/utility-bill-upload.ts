import type { AdminStateSnapshot } from "@/lib/admin-state";
import type { AdminLead } from "@/lib/admin-types";

const UTILITY_BILL_UPLOAD_PREFIX = "utility-";

export function buildUtilityBillUploadToken(eoiSigningToken: string | null | undefined) {
  const cleanToken = eoiSigningToken?.trim();
  return cleanToken ? `${UTILITY_BILL_UPLOAD_PREFIX}${cleanToken}` : null;
}

export function parseUtilityBillUploadToken(uploadToken: string) {
  const cleanToken = decodeURIComponent(uploadToken).trim();
  return cleanToken.startsWith(UTILITY_BILL_UPLOAD_PREFIX)
    ? cleanToken.slice(UTILITY_BILL_UPLOAD_PREFIX.length)
    : cleanToken;
}

export function buildUtilityBillUploadPath(eoiSigningToken: string | null | undefined) {
  const uploadToken = buildUtilityBillUploadToken(eoiSigningToken);
  return uploadToken ? `/utility-bills/${uploadToken}` : null;
}

export function findUtilityBillUploadLead(
  snapshot: AdminStateSnapshot,
  uploadToken: string,
): AdminLead | null {
  const eoiSigningToken = parseUtilityBillUploadToken(uploadToken);
  if (!eoiSigningToken) return null;
  return snapshot.leads.find((lead) => lead.eoiSigningToken === eoiSigningToken) ?? null;
}

export function isUtilityBillDocumentTitle(title: string) {
  return /utility bill|prepaid|electricity slip|electricity receipt/i.test(title);
}

export function utilityBillDocumentCount(lead: AdminLead) {
  return lead.documents.filter((document) =>
    isUtilityBillDocumentTitle(`${document.title} ${document.category}`),
  ).length;
}
