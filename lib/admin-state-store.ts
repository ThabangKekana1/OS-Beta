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

export async function readAdminStateSnapshot(): Promise<{
  backend: AdminStateBackend;
  snapshot: AdminStateSnapshot;
}> {
  const databaseState = await readAdminStateFromDatabase();
  if (databaseState.snapshot) {
    return {
      backend: "supabase",
      snapshot: databaseState.snapshot,
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
      snapshot,
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
    snapshot: seeded,
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
