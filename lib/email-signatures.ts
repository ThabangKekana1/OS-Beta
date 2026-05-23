import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { UserRole } from "@/lib/auth";
import {
  KARMAN_EMAIL_SIGNATURE_TEXT,
  SYSTEM_SIGNATURE_EMAILS,
  SYSTEM_SIGNATURE_TEXTS,
  splitSignatureForBanner,
  systemSignatureTextForSender,
} from "@/lib/email-signature-copy";
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

export const SYSTEM_EMAIL_SIGNATURE_TEXT = KARMAN_EMAIL_SIGNATURE_TEXT;
export const SYSTEM_EMAIL_FOOTER_CONTENT_ID = "foundation1-system-email-footer";
export const SYSTEM_EMAIL_FOOTER_FILENAME = "Email Banner 1-3.png";
const SYSTEM_EMAIL_FOOTER_MIME_TYPE = "image/png";
let cachedSystemFooterImage: EmailSignatureFooterImage | null | undefined;

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

export function buildSystemEmailSignature(input: {
  ownerUserId?: string | null;
  ownerEmail?: string | null;
  ownerRole?: EmailSignatureRole | null;
  footerImage?: EmailSignatureFooterImage | null;
}): EmailSignature {
  const now = new Date().toISOString();
  return {
    ownerUserId: input.ownerUserId ?? "system",
    ownerEmail: input.ownerEmail ?? "karman@foundation-1.co.za",
    ownerRole: input.ownerRole ?? "admin",
    signatureText: systemSignatureTextForSender(input) ?? SYSTEM_EMAIL_SIGNATURE_TEXT,
    footerImage: input.footerImage ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getSystemEmailFooterImage(): Promise<EmailSignatureFooterImage | null> {
  if (cachedSystemFooterImage !== undefined) return cachedSystemFooterImage;
  try {
    const bytes = await readFile(join(process.cwd(), "public", "resources", "email-banner-1-3.png"));
    const base64 = bytes.toString("base64");
    cachedSystemFooterImage = {
      filename: SYSTEM_EMAIL_FOOTER_FILENAME,
      mimeType: SYSTEM_EMAIL_FOOTER_MIME_TYPE,
      sizeBytes: bytes.byteLength,
      base64,
      dataUrl: `data:${SYSTEM_EMAIL_FOOTER_MIME_TYPE};base64,${base64}`,
    };
  } catch (error) {
    console.error("[email-signatures] system footer image read failed", error);
    cachedSystemFooterImage = null;
  }
  return cachedSystemFooterImage;
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

function signatureEmails(signature: EmailSignature | null | undefined): string[] {
  const emails = new Set<string>();
  const ownerEmail = signature?.ownerEmail.trim().toLowerCase();
  if (ownerEmail) emails.add(ownerEmail);
  for (const match of signature?.signatureText.matchAll(/[^\s<>]+@[^\s<>]+/g) ?? []) {
    emails.add(match[0].toLowerCase());
  }
  return Array.from(emails);
}

function bodyAlreadyHasSignature(
  signature: EmailSignature | null | undefined,
  ...values: Array<string | null | undefined>
): boolean {
  const emails = signatureEmails(signature);
  if (emails.length === 0) return false;
  return values.some((value) => {
    const lower = (value ?? "").toLowerCase();
    return emails.some((email) => lower.includes(email));
  });
}

function replaceKnownSystemSignature(bodyText: string, signatureText: string): string {
  for (const knownSignatureText of SYSTEM_SIGNATURE_TEXTS) {
    if (knownSignatureText === signatureText) continue;
    if (bodyText.includes(knownSignatureText)) {
      return bodyText.replace(knownSignatureText, signatureText);
    }
  }
  return bodyText;
}

export function shouldRebuildHtmlForSystemSignature(
  bodyHtml: string | null | undefined,
  signature: EmailSignature | null | undefined,
): boolean {
  if (!bodyHtml?.trim() || !signature) return false;
  if (bodyAlreadyHasSignature(signature, bodyHtml)) return false;
  const lower = bodyHtml.toLowerCase();
  return SYSTEM_SIGNATURE_EMAILS.some((email) => lower.includes(email));
}

export function appendSignatureToText(
  bodyText: string,
  signature: EmailSignature | null | undefined,
): string {
  const signatureText = signature?.signatureText.trim();
  if (!signatureText) return bodyText;
  if (bodyAlreadyHasSignature(signature, bodyText)) return bodyText;
  const bodyWithCorrectKnownSignature = replaceKnownSystemSignature(bodyText, signatureText);
  if (bodyWithCorrectKnownSignature !== bodyText) return bodyWithCorrectKnownSignature;
  return `${bodyText.trimEnd()}\n\n${signatureText}`;
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

  const signatureText = signature?.signatureText.trim();
  const bodyHtmlHasSignature = bodyAlreadyHasSignature(signature, bodyHtml);
  const bodyTextHasSignature = bodyAlreadyHasSignature(signature, bodyText);
  const hasProvidedHtml = Boolean(bodyHtml?.trim());
  const shouldRenderSignatureText = Boolean(
    signatureText && (hasProvidedHtml ? !bodyHtmlHasSignature : !bodyTextHasSignature),
  );
  const imageAlreadyEmbedded = Boolean(footerImageContentId && bodyHtml?.includes(`cid:${footerImageContentId}`));
  const imageHtml = signature?.footerImage && footerImageContentId && !imageAlreadyEmbedded
    ? `<div style="margin-top:12px;"><img src="cid:${escapeHtml(footerImageContentId)}" alt="Foundation-1 email banner" style="display:block;max-width:764px;width:100%;height:auto;border:0;" /></div>`
    : "";
  const signatureAlreadyInMessage = hasProvidedHtml
    ? bodyHtmlHasSignature
    : Boolean(signatureText && bodyText.includes(signatureText));
  const imageInsertedInMessage = Boolean(imageHtml && signatureAlreadyInMessage && !hasProvidedHtml);
  const messageHtml = hasProvidedHtml
    ? bodyHtml!
    : `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">${
        imageInsertedInMessage && signatureText
          ? textToHtmlWithBannerInSignature(bodyText, signatureText, imageHtml)
          : textToHtml(bodyText)
      }</div>`;
  const splitSignature = signatureText ? splitSignatureForBanner(signatureText) : null;
  const standaloneImageHtml = imageInsertedInMessage ? "" : imageHtml;
  const signatureTextHtml = shouldRenderSignatureText && splitSignature
    ? [
        `<div>${textToHtml(splitSignature.beforeBanner)}</div>`,
        standaloneImageHtml,
        splitSignature.afterBanner
          ? `<div style="margin-top:12px;">${textToHtml(splitSignature.afterBanner)}</div>`
          : "",
      ].join("")
    : standaloneImageHtml;

  if (!signatureTextHtml && !imageHtml) {
    return messageHtml;
  }

  return `${messageHtml}<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">${signatureTextHtml}</div>`;
}

function textToHtmlWithBannerInSignature(
  bodyText: string,
  signatureText: string,
  imageHtml: string,
): string {
  const signatureIndex = bodyText.indexOf(signatureText);
  if (signatureIndex === -1) return textToHtml(bodyText);

  const splitSignature = splitSignatureForBanner(signatureText);
  const beforeSignature = bodyText.slice(0, signatureIndex);
  const afterSignature = bodyText.slice(signatureIndex + signatureText.length);
  return [
    textToHtml(beforeSignature),
    textToHtml(splitSignature.beforeBanner),
    imageHtml,
    splitSignature.afterBanner ? `<div style="margin-top:12px;">${textToHtml(splitSignature.afterBanner)}</div>` : "",
    textToHtml(afterSignature),
  ].join("");
}
