import type { UserRole } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type EmailSignatureRole = Extract<UserRole, "admin" | "sales" | "partner">;

export const EMAIL_SIGNATURE_TEXT_MAX_LENGTH = 4000;
export const EMAIL_SIGNATURE_IMAGE_MAX_BYTES = 512 * 1024;
export const EMAIL_SIGNATURE_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type EmailSignatureFooterImage = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  base64: string;
  dataUrl: string;
};

export type EmailSignature = {
  ownerUserId: string;
  ownerEmail: string;
  ownerRole: EmailSignatureRole;
  signatureText: string;
  footerImage: EmailSignatureFooterImage | null;
  createdAt: string;
  updatedAt: string;
};

export type StoredEmailSignatureFooterImage = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  base64: string;
};

export type UpsertEmailSignatureInput = {
  ownerUserId: string;
  ownerEmail: string;
  ownerRole: EmailSignatureRole;
  signatureText: string;
  footerImage: StoredEmailSignatureFooterImage | null;
};

type DbSignatureRow = {
  owner_user_id: string;
  owner_email: string;
  owner_role: EmailSignatureRole;
  signature_text: string | null;
  footer_image_filename: string | null;
  footer_image_mime_type: string | null;
  footer_image_base64: string | null;
  footer_image_size_bytes: number | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "oneos_email_signatures";

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("does not exist");
}

function footerImageFromRow(row: DbSignatureRow): EmailSignatureFooterImage | null {
  if (!row.footer_image_filename || !row.footer_image_mime_type || !row.footer_image_base64) {
    return null;
  }

  const sizeBytes = row.footer_image_size_bytes ?? Math.floor((row.footer_image_base64.length * 3) / 4);
  return {
    filename: row.footer_image_filename,
    mimeType: row.footer_image_mime_type,
    sizeBytes,
    base64: row.footer_image_base64,
    dataUrl: `data:${row.footer_image_mime_type};base64,${row.footer_image_base64}`,
  };
}

function rowToSignature(row: DbSignatureRow): EmailSignature {
  return {
    ownerUserId: row.owner_user_id,
    ownerEmail: row.owner_email,
    ownerRole: row.owner_role,
    signatureText: row.signature_text ?? "",
    footerImage: footerImageFromRow(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function emptyEmailSignature(input: {
  ownerUserId: string;
  ownerEmail: string;
  ownerRole: EmailSignatureRole;
}): EmailSignature {
  const now = new Date().toISOString();
  return {
    ownerUserId: input.ownerUserId,
    ownerEmail: input.ownerEmail,
    ownerRole: input.ownerRole,
    signatureText: "",
    footerImage: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getEmailSignature(ownerUserId: string): Promise<EmailSignature | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (isMissingRelationError(error)) return null;
  if (error) {
    console.error("[email-signatures] read failed", error);
    return null;
  }
  return data ? rowToSignature(data as DbSignatureRow) : null;
}

export async function upsertEmailSignature(
  input: UpsertEmailSignatureInput,
): Promise<EmailSignature | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        owner_user_id: input.ownerUserId,
        owner_email: input.ownerEmail.trim().toLowerCase(),
        owner_role: input.ownerRole,
        signature_text: input.signatureText,
        footer_image_filename: input.footerImage?.filename ?? null,
        footer_image_mime_type: input.footerImage?.mimeType ?? null,
        footer_image_base64: input.footerImage?.base64 ?? null,
        footer_image_size_bytes: input.footerImage?.sizeBytes ?? null,
      },
      { onConflict: "owner_user_id" },
    )
    .select("*")
    .single();

  if (isMissingRelationError(error)) return null;
  if (error || !data) {
    console.error("[email-signatures] upsert failed", error);
    return null;
  }

  return rowToSignature(data as DbSignatureRow);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function hasSignatureContent(signature: EmailSignature | null | undefined): boolean {
  return Boolean(signature?.signatureText.trim() || signature?.footerImage);
}

export function appendSignatureToText(
  bodyText: string,
  signature: EmailSignature | null | undefined,
): string {
  const signatureText = signature?.signatureText.trim();
  if (!signatureText) return bodyText;
  return `${bodyText.trimEnd()}\n\n-- \n${signatureText}`;
}

export function buildEmailHtmlWithSignature({
  bodyText,
  bodyHtml,
  signature,
  footerImageContentId,
}: {
  bodyText: string;
  bodyHtml?: string | null;
  signature?: EmailSignature | null;
  footerImageContentId?: string | null;
}): string | null {
  if (!hasSignatureContent(signature)) {
    return bodyHtml?.trim() ? bodyHtml : null;
  }

  const messageHtml = bodyHtml?.trim()
    ? bodyHtml
    : `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">${textToHtml(bodyText)}</div>`;
  const signatureText = signature?.signatureText.trim();
  const signatureTextHtml = signatureText
    ? `<div>${textToHtml(signatureText)}</div>`
    : "";
  const imageHtml = signature?.footerImage && footerImageContentId
    ? `<div style="margin-top:12px;"><img src="cid:${escapeHtml(footerImageContentId)}" alt="Email footer" style="display:block;max-width:520px;width:100%;height:auto;border:0;" /></div>`
    : "";

  return `${messageHtml}<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">${signatureTextHtml}${imageHtml}</div>`;
}
