import {
  createDefaultWorkspaceStateSnapshot,
  normalizeWorkspaceStateSnapshot,
  type WorkspaceStateSnapshot,
} from "@/lib/workspace-state";
import { readJsonObject, writeJsonObject } from "@/lib/server-json-store";
import { hasSupabaseAdminConfig } from "@/lib/supabase-admin";
import {
  readWorkspaceStateFromDatabase,
  writeWorkspaceStateToDatabase,
} from "@/lib/supabase-db-store";

const WORKSPACE_STATE_BUCKET = "oneos-workspace-state";

export type WorkspaceStateBackend = "supabase" | "local";

function statePath(workspaceId: string) {
  return `workspaces/${workspaceId}/state-v1.json`;
}

export async function readWorkspaceStateSnapshot(workspaceId: string): Promise<{
  backend: WorkspaceStateBackend;
  snapshot: WorkspaceStateSnapshot;
}> {
  const databaseState = await readWorkspaceStateFromDatabase(workspaceId);
  if (databaseState.snapshot) {
    return {
      backend: "supabase",
      snapshot: databaseState.snapshot,
    };
  }

  const snapshot = await readJsonObject(
    WORKSPACE_STATE_BUCKET,
    statePath(workspaceId),
    normalizeWorkspaceStateSnapshot,
  );

  if (snapshot) {
    if (hasSupabaseAdminConfig()) {
      await writeWorkspaceStateToDatabase(workspaceId, snapshot);
    }

    return {
      backend: "supabase",
      snapshot,
    };
  }

  const seeded = createDefaultWorkspaceStateSnapshot();
  if (hasSupabaseAdminConfig()) {
    await writeWorkspaceStateSnapshot(workspaceId, seeded);
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

export async function writeWorkspaceStateSnapshot(
  workspaceId: string,
  snapshot: WorkspaceStateSnapshot,
) {
  const databasePersisted = await writeWorkspaceStateToDatabase(workspaceId, snapshot);
  if (databasePersisted) {
    return "supabase";
  }

  const persisted = await writeJsonObject(
    WORKSPACE_STATE_BUCKET,
    statePath(workspaceId),
    {
      ...snapshot,
      updatedAt: new Date().toISOString(),
    },
  );

  return persisted ? "supabase" : "local";
}
