import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  findDealRoomByToken,
  isRoomOpen,
  listGrantedDocuments,
  logDealRoomAccess,
} from "@/lib/deal-rooms";
import { downloadPrivateObject } from "@/lib/server-json-store";

export const runtime = "nodejs";

const DOCUMENT_BUCKET = "oneos-client-documents";

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** GET /api/dealroom/[token]/documents/[documentId] — logged, grant-checked download. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; documentId: string }> },
) {
  const { token, documentId } = await params;
  const limit = await consumeRateLimit({
    scope: "dealroom-download",
    key: `${requestIp(request)}:${token}`,
    limit: 60,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  const room = await findDealRoomByToken(token);
  if (!room || !isRoomOpen(room)) {
    return NextResponse.json({ ok: false, error: "This deal room is not available." }, { status: 404 });
  }
  if (!room.grantedDocumentIds.includes(documentId)) {
    // Denied requests are evidence too.
    await logDealRoomAccess({
      dealRoomId: room.id,
      action: "document_viewed",
      documentId,
      actorLabel: "DENIED — not granted",
      ip: requestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: false, error: "This document is not shared in this deal room." }, { status: 403 });
  }

  const documents = await listGrantedDocuments(room);
  const document = documents.find((entry) => entry.id === documentId);
  if (!document?.storagePath) {
    return NextResponse.json({ ok: false, error: "Document file unavailable." }, { status: 404 });
  }

  const blob = await downloadPrivateObject(DOCUMENT_BUCKET, document.storagePath);
  if (!blob) {
    return NextResponse.json({ ok: false, error: "Document file unavailable." }, { status: 404 });
  }

  await logDealRoomAccess({
    dealRoomId: room.id,
    action: "document_downloaded",
    documentId,
    ip: requestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  const filename = document.fileName ?? `${document.title}.pdf`;
  return new NextResponse(blob, {
    headers: {
      "Content-Type": document.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.\- ]+/g, "_")}"`,
      "Cache-Control": "no-store",
      "X-Prepared-By": "Foundation-1 (Pty) Ltd",
    },
  });
}
