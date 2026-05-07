import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  EMAIL_SIGNATURE_IMAGE_MAX_BYTES,
  EMAIL_SIGNATURE_IMAGE_MIME_TYPES,
  EMAIL_SIGNATURE_TEXT_MAX_LENGTH,
  emptyEmailSignature,
  getEmailSignature,
  upsertEmailSignature,
  type EmailSignature,
  type EmailSignatureRole,
  type StoredEmailSignatureFooterImage,
} from "@/lib/email-signatures";

export const runtime = "nodejs";

type FooterImagePayload = {
  filename?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  dataUrl?: unknown;
  base64?: unknown;
};

type SignaturePayload = {
  signatureText?: unknown;
  footerImage?: unknown;
};

function isSignatureRole(role: string): role is EmailSignatureRole {
  return role === "admin" || role === "sales" || role === "partner";
}

function publicSignature(signature: EmailSignature) {
  return {
    ownerUserId: signature.ownerUserId,
    ownerEmail: signature.ownerEmail,
    ownerRole: signature.ownerRole,
    signatureText: signature.signatureText,
    footerImage: signature.footerImage
      ? {
          filename: signature.footerImage.filename,
          mimeType: signature.footerImage.mimeType,
          sizeBytes: signature.footerImage.sizeBytes,
          dataUrl: signature.footerImage.dataUrl,
        }
      : null,
    createdAt: signature.createdAt,
    updatedAt: signature.updatedAt,
  };
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function sanitizeFilename(value: string, mimeType: string): string {
  const cleaned = value
    .replace(/[\\/]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  return cleaned || `email-footer.${extensionForMime(mimeType)}`;
}

function parseFooterImage(value: unknown):
  | { ok: true; image: StoredEmailSignatureFooterImage | null }
  | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true, image: null };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Footer image must be an image payload or null" };
  }

  const payload = value as FooterImagePayload;
  const dataUrl = typeof payload.dataUrl === "string" ? payload.dataUrl.trim() : "";
  const dataUrlMatch = dataUrl.match(/^data:([^;,]+);base64,(.+)$/i);
  const mimeType = (
    typeof payload.mimeType === "string" && payload.mimeType.trim()
      ? payload.mimeType.trim()
      : dataUrlMatch?.[1] ?? ""
  ).toLowerCase();
  const rawBase64 = (
    typeof payload.base64 === "string" && payload.base64.trim()
      ? payload.base64
      : dataUrlMatch?.[2] ?? ""
  ).replace(/\s/g, "");

  if (!EMAIL_SIGNATURE_IMAGE_MIME_TYPES.includes(mimeType as (typeof EMAIL_SIGNATURE_IMAGE_MIME_TYPES)[number])) {
    return { ok: false, error: "Footer image must be PNG, JPG, WEBP, or GIF" };
  }
  if (!rawBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(rawBase64)) {
    return { ok: false, error: "Footer image content must be base64 encoded" };
  }

  const decoded = Buffer.from(rawBase64, "base64");
  if (decoded.byteLength === 0) {
    return { ok: false, error: "Footer image is empty" };
  }
  if (decoded.byteLength > EMAIL_SIGNATURE_IMAGE_MAX_BYTES) {
    return { ok: false, error: "Footer image must be 512 KB or smaller" };
  }

  const filename = sanitizeFilename(
    typeof payload.filename === "string" ? payload.filename : "",
    mimeType,
  );

  return {
    ok: true,
    image: {
      filename,
      mimeType,
      sizeBytes: decoded.byteLength,
      base64: rawBase64,
    },
  };
}

export async function GET() {
  const session = await getServerAuthSession();
  if (!session || !isSignatureRole(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.userId) {
    return NextResponse.json({ error: "Your account profile is not linked to signature storage" }, { status: 400 });
  }

  const signature =
    (await getEmailSignature(session.userId)) ??
    emptyEmailSignature({
      ownerUserId: session.userId,
      ownerEmail: session.email,
      ownerRole: session.role,
    });

  return NextResponse.json({ signature: publicSignature(signature) });
}

export async function PUT(request: Request) {
  const session = await getServerAuthSession();
  if (!session || !isSignatureRole(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.userId) {
    return NextResponse.json({ error: "Your account profile is not linked to signature storage" }, { status: 400 });
  }

  let payload: SignaturePayload;
  try {
    payload = (await request.json()) as SignaturePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const signatureText = typeof payload.signatureText === "string" ? payload.signatureText.replace(/\r\n/g, "\n") : "";
  if (signatureText.length > EMAIL_SIGNATURE_TEXT_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Signature text must be ${EMAIL_SIGNATURE_TEXT_MAX_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  const parsedImage = parseFooterImage(payload.footerImage);
  if (!parsedImage.ok) {
    return NextResponse.json({ error: parsedImage.error }, { status: 400 });
  }

  const saved = await upsertEmailSignature({
    ownerUserId: session.userId,
    ownerEmail: session.email,
    ownerRole: session.role,
    signatureText,
    footerImage: parsedImage.image,
  });

  if (!saved) {
    return NextResponse.json({ error: "Email signature storage is not configured" }, { status: 503 });
  }

  return NextResponse.json({ signature: publicSignature(saved) });
}
