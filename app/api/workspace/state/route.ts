import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeWorkspaceStateSnapshot } from "@/lib/workspace-state";
import {
  readWorkspaceStateSnapshot,
  writeWorkspaceStateSnapshot,
} from "@/lib/workspace-state-store";

export const runtime = "nodejs";

const WORKSPACE_COOKIE_NAME = "oneos_workspace_id";
const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getWorkspaceId(request: NextRequest) {
  const existing = request.cookies.get(WORKSPACE_COOKIE_NAME)?.value;

  if (existing && /^[a-zA-Z0-9_-]{12,80}$/.test(existing)) {
    return {
      workspaceId: existing,
      isNew: false,
    };
  }

  return {
    workspaceId: `workspace_${randomUUID().replace(/-/g, "")}`,
    isNew: true,
  };
}

function setWorkspaceCookie(response: NextResponse, workspaceId: string) {
  response.cookies.set(WORKSPACE_COOKIE_NAME, workspaceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: WORKSPACE_COOKIE_MAX_AGE,
  });
}

export async function GET(request: NextRequest) {
  const { workspaceId } = getWorkspaceId(request);

  try {
    const result = await readWorkspaceStateSnapshot(workspaceId);
    const response = NextResponse.json({
      ok: true,
      backend: result.backend,
      workspaceId,
      snapshot: result.snapshot,
    });

    setWorkspaceCookie(response, workspaceId);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workspace backend error";
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to load workspace state.",
        detail: message,
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const { workspaceId } = getWorkspaceId(request);
  let payload: { snapshot?: unknown };

  try {
    payload = (await request.json()) as { snapshot?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const snapshot = normalizeWorkspaceStateSnapshot(payload.snapshot);
  if (!snapshot) {
    return NextResponse.json(
      { ok: false, error: "Snapshot payload is missing required fields." },
      { status: 400 },
    );
  }

  try {
    const backend = await writeWorkspaceStateSnapshot(workspaceId, snapshot);
    const response = NextResponse.json({
      ok: true,
      backend,
      workspaceId,
      snapshot,
    });

    setWorkspaceCookie(response, workspaceId);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workspace backend error";
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to persist workspace state.",
        detail: message,
      },
      { status: 500 },
    );
  }
}
