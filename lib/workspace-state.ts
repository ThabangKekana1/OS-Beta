import { createSeedCases, WORKSPACE_OPTIONS } from "@/lib/mock-data";
import type { MigrationCase } from "@/lib/types";

export type WorkspaceStateSnapshot = {
  cases: MigrationCase[];
  activeCaseId: string | null;
  activeWorkspaceId: string;
};

function getDefaultActiveCaseId(cases: MigrationCase[]) {
  return cases.find((migrationCase) => migrationCase.stage !== "Closed")?.id ?? cases[0]?.id ?? null;
}

export function createDefaultWorkspaceStateSnapshot(): WorkspaceStateSnapshot {
  // Production starts with no demo cases; the workspace seeds when a user creates one.
  const cases = process.env.NODE_ENV === "production" ? [] : createSeedCases();

  return {
    cases,
    activeCaseId: getDefaultActiveCaseId(cases),
    activeWorkspaceId: WORKSPACE_OPTIONS[0].id,
  };
}

export function normalizeWorkspaceStateSnapshot(input: unknown): WorkspaceStateSnapshot | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const typed = input as {
    cases?: unknown;
    activeCaseId?: unknown;
    activeWorkspaceId?: unknown;
  };

  if (!Array.isArray(typed.cases)) {
    return null;
  }

  const activeWorkspaceId =
    typeof typed.activeWorkspaceId === "string" &&
    WORKSPACE_OPTIONS.some((option) => option.id === typed.activeWorkspaceId)
      ? typed.activeWorkspaceId
      : WORKSPACE_OPTIONS[0].id;

  const activeCaseId =
    typeof typed.activeCaseId === "string" || typed.activeCaseId === null
      ? typed.activeCaseId
      : getDefaultActiveCaseId(typed.cases as MigrationCase[]);

  return {
    cases: typed.cases as MigrationCase[],
    activeCaseId,
    activeWorkspaceId,
  };
}
