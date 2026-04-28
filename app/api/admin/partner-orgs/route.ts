import { NextRequest, NextResponse } from "next/server";
import {
  readAdminStateSnapshot,
  writeAdminStateSnapshot,
} from "@/lib/admin-state-store";
import { getServerAuthSession } from "@/lib/auth-server";
import { normalizePartnerOrg } from "@/lib/admin-storage";
import { makeId } from "@/lib/formatting";
import type { PartnerOrg, PartnerOrgStatus, PartnerOrgTier } from "@/lib/admin-types";
import { partnerOrgStatuses, partnerOrgTiers } from "@/lib/admin-types";

export const runtime = "nodejs";

const tierSet = new Set<string>(partnerOrgTiers);
const statusSet = new Set<string>(partnerOrgStatuses);

type CreatePayload = {
  name?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  tier?: string;
  commissionPct?: number;
  notes?: string;
};

type UpdatePayload = CreatePayload & {
  id: string;
  status?: string;
};

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function GET() {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { snapshot } = await readAdminStateSnapshot();
  return NextResponse.json({ ok: true, partnerOrgs: snapshot.partnerOrgs ?? [] });
}

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let payload: CreatePayload;
  try {
    payload = (await request.json()) as CreatePayload;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const name = payload.name?.trim() ?? "";
  if (!name) {
    return badRequest("Partner org name is required.");
  }

  const contactEmail = payload.contactEmail?.trim().toLowerCase() ?? "";
  if (contactEmail.length === 0 || !contactEmail.includes("@")) {
    return badRequest("A valid contact email is required.");
  }

  const tier = (tierSet.has(payload.tier ?? "") ? payload.tier : "Standard") as PartnerOrgTier;
  const commission = Number(payload.commissionPct);
  const commissionPct =
    Number.isFinite(commission) && commission >= 0 && commission <= 100 ? commission : 5;

  const now = new Date().toISOString();
  const created = normalizePartnerOrg({
    id: makeId("partner"),
    name,
    contactName: payload.contactName?.trim() ?? "",
    contactEmail,
    contactPhone: payload.contactPhone?.trim() ?? "",
    tier,
    commissionPct,
    status: "Active",
    notes: payload.notes?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
  });

  const { snapshot } = await readAdminStateSnapshot();
  const currentOrgs = snapshot.partnerOrgs ?? [];
  const nextSnapshot = {
    ...snapshot,
    partnerOrgs: [created, ...currentOrgs],
  };

  try {
    const backend = await writeAdminStateSnapshot(nextSnapshot, session.email);
    return NextResponse.json({ ok: true, backend, partnerOrg: created });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: "Unable to persist partner org.", detail },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let payload: UpdatePayload;
  try {
    payload = (await request.json()) as UpdatePayload;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  if (!payload.id || typeof payload.id !== "string") {
    return badRequest("Partner org id is required.");
  }

  const { snapshot } = await readAdminStateSnapshot();
  const currentOrgs = snapshot.partnerOrgs ?? [];
  const existing = currentOrgs.find((entry) => entry.id === payload.id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Partner org not found." }, { status: 404 });
  }

  const merged: PartnerOrg = normalizePartnerOrg({
    ...existing,
    name: payload.name?.trim() || existing.name,
    contactName: payload.contactName?.trim() ?? existing.contactName,
    contactEmail: payload.contactEmail?.trim().toLowerCase() ?? existing.contactEmail,
    contactPhone: payload.contactPhone?.trim() ?? existing.contactPhone,
    tier: (tierSet.has(payload.tier ?? "") ? (payload.tier as PartnerOrgTier) : existing.tier),
    commissionPct:
      payload.commissionPct !== undefined ? Number(payload.commissionPct) : existing.commissionPct,
    status: statusSet.has(payload.status ?? "")
      ? (payload.status as PartnerOrgStatus)
      : existing.status,
    notes: payload.notes ?? existing.notes,
    updatedAt: new Date().toISOString(),
  });

  const nextSnapshot = {
    ...snapshot,
    partnerOrgs: currentOrgs.map((entry) => (entry.id === merged.id ? merged : entry)),
  };

  try {
    const backend = await writeAdminStateSnapshot(nextSnapshot, session.email);
    return NextResponse.json({ ok: true, backend, partnerOrg: merged });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: "Unable to update partner org.", detail },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return badRequest("id query parameter is required.");
  }

  const { snapshot } = await readAdminStateSnapshot();
  const currentOrgs = snapshot.partnerOrgs ?? [];
  if (!currentOrgs.some((entry) => entry.id === id)) {
    return NextResponse.json({ ok: false, error: "Partner org not found." }, { status: 404 });
  }

  const nextSnapshot = {
    ...snapshot,
    partnerOrgs: currentOrgs.filter((entry) => entry.id !== id),
  };

  try {
    const backend = await writeAdminStateSnapshot(nextSnapshot, session.email);
    return NextResponse.json({ ok: true, backend });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: "Unable to delete partner org.", detail },
      { status: 500 },
    );
  }
}
