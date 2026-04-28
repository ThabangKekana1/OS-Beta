import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

type Payload = {
  workspaceId?: string;
  caseId?: string;
  caseName?: string;
  category?: string;
  fileNames?: string[];
  customerEmail?: string;
};

export async function POST(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "anonymous";

  const limit = await consumeRateLimit({
    scope: "notify-upload",
    key: `ip:${clientIp}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workspaceId = payload.workspaceId?.trim() ?? "";
  const caseId = payload.caseId?.trim() ?? "";
  const caseName = payload.caseName?.trim() || caseId || "untitled case";
  const category = payload.category?.trim() || "Document";
  const files = Array.isArray(payload.fileNames)
    ? payload.fileNames.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    : [];

  if (!workspaceId || files.length === 0) {
    return NextResponse.json({ error: "workspaceId and fileNames required" }, { status: 400 });
  }

  await createNotification({
    audience: "admin",
    kind: "customer_uploaded_document",
    title: `Customer uploaded ${files.length} ${category} file${files.length === 1 ? "" : "s"} on ${caseName}`,
    body: `Files: ${files.slice(0, 10).join(", ")}${files.length > 10 ? "…" : ""}`,
    link: `/admin/case-documents`,
    metadata: {
      workspaceId,
      caseId: caseId || null,
      caseName,
      category,
      fileNames: files,
      customerEmail: payload.customerEmail ?? null,
      clientIp,
    },
  });

  return NextResponse.json({ ok: true });
}
