import {
  createDefaultAdminStateSnapshot,
  normalizeAdminStateSnapshot,
  type AdminStateSnapshot,
} from "@/lib/admin-state";
import { readJsonObject, writeJsonObject } from "@/lib/server-json-store";
import { hasSupabaseAdminConfig } from "@/lib/supabase-admin";
import {
  readAdminStateFromDatabase,
  writeAdminStateToDatabase,
} from "@/lib/supabase-db-store";

const ADMIN_STATE_BUCKET = "oneos-internal-state";
const ADMIN_STATE_PATH = "admin/state-v1.json";

export type AdminStateBackend = "supabase" | "local";
export type ReadAdminStateOptions = {
  includeSalesLeads?: boolean;
  leadOwnerId?: string | null;
};

function filterSnapshotForOptions(
  snapshot: AdminStateSnapshot,
  options: ReadAdminStateOptions,
): AdminStateSnapshot {
  const leadOwnerId = options.leadOwnerId?.trim() || null;
  const leads = leadOwnerId
    ? snapshot.leads.filter((lead) => lead.ownerId === leadOwnerId)
    : snapshot.leads;
  const activeLeadId = leads.some((lead) => lead.id === snapshot.activeLeadId)
    ? snapshot.activeLeadId
    : leads[0]?.id ?? null;

  return {
    ...snapshot,
    leads,
    activeLeadId,
    salesLeads: options.includeSalesLeads === false ? [] : snapshot.salesLeads,
  };
}

export async function readAdminStateSnapshot(
  options: ReadAdminStateOptions = {},
): Promise<{
  backend: AdminStateBackend;
  snapshot: AdminStateSnapshot;
}> {
  const databaseState = await readAdminStateFromDatabase(options);
  if (databaseState.snapshot) {
    return {
      backend: "supabase",
      snapshot: filterSnapshotForOptions(databaseState.snapshot, options),
    };
  }

  const snapshot = await readJsonObject(
    ADMIN_STATE_BUCKET,
    ADMIN_STATE_PATH,
    normalizeAdminStateSnapshot,
  );

  if (snapshot) {
    if (hasSupabaseAdminConfig()) {
      await writeAdminStateToDatabase(snapshot, "storage-migration");
    }

    return {
      backend: "supabase",
      snapshot: filterSnapshotForOptions(snapshot, options),
    };
  }

  const seeded = createDefaultAdminStateSnapshot();
  if (hasSupabaseAdminConfig()) {
    await writeAdminStateSnapshot(seeded, "system-seed");
    return {
      backend: "supabase",
      snapshot: seeded,
    };
  }

  return {
    backend: "local",
    snapshot: filterSnapshotForOptions(seeded, options),
  };
}

export async function writeAdminStateSnapshot(
  snapshot: AdminStateSnapshot,
  updatedBy: string,
) {
  const databasePersisted = await writeAdminStateToDatabase(snapshot, updatedBy);
  if (databasePersisted) {
    return "supabase";
  }

  const persisted = await writeJsonObject(ADMIN_STATE_BUCKET, ADMIN_STATE_PATH, {
    ...snapshot,
    updatedAt: new Date().toISOString(),
    updatedBy,
  });

  return persisted ? "supabase" : "local";
}
