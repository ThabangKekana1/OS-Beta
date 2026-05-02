import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { FOUNDATION_ASSISTANT_SYSTEM_PROMPT } from "@/lib/assistant/system-prompt";
import { readJsonObject, writeJsonObject } from "@/lib/server-json-store";

export type Prequalification = {
  minMonthlySpendZar: number;
  requireRegistered: boolean;
  requireOperational: boolean;
  requireSixMonthHistory: boolean;
  softDisqualifyMessage: string;
};

export type AgentConfig = {
  systemPrompt: string | null;
  onboardingPlaybook: string | null;
  doNotSay: string[];
  escalationTriggers: string[];
  tone: string | null;
  modeOverrides: Record<string, string>;
  prequalification: Prequalification;
  updatedAt: string | null;
  updatedBy: string | null;
};

const TABLE = "oneos_agent_config";
const ROW_ID = "default";
const BUCKET = "oneos-internal-state";
const OBJECT_PATH = "admin/agent-config-v1.json";

const DEFAULT_PREQUAL: Prequalification = {
  minMonthlySpendZar: 10000,
  requireRegistered: true,
  requireOperational: true,
  requireSixMonthHistory: true,
  softDisqualifyMessage:
    "Based on what you have shared, your business may not be a fit for Generocity right now. A Foundation-1 specialist will reach out within one business day to talk through alternatives like Lumen-1.",
};

const EMPTY: AgentConfig = {
  systemPrompt: null,
  onboardingPlaybook: null,
  doNotSay: [],
  escalationTriggers: [],
  tone: null,
  modeOverrides: {},
  prequalification: DEFAULT_PREQUAL,
  updatedAt: null,
  updatedBy: null,
};

function normalizePrequalification(
  raw: Partial<Prequalification> | null | undefined,
): Prequalification {
  return {
    minMonthlySpendZar:
      typeof raw?.minMonthlySpendZar === "number"
        ? Math.max(DEFAULT_PREQUAL.minMonthlySpendZar, Math.round(raw.minMonthlySpendZar))
        : DEFAULT_PREQUAL.minMonthlySpendZar,
    requireRegistered: true,
    requireOperational: true,
    requireSixMonthHistory: true,
    softDisqualifyMessage:
      typeof raw?.softDisqualifyMessage === "string" && raw.softDisqualifyMessage.trim()
        ? raw.softDisqualifyMessage
        : DEFAULT_PREQUAL.softDisqualifyMessage,
  };
}

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("does not exist");
}

function normalizeAgentConfig(input: unknown): AgentConfig | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const typed = input as Partial<AgentConfig>;
  const prequalRaw = typed.prequalification as Partial<Prequalification> | null | undefined;

  return {
    systemPrompt:
      typeof typed.systemPrompt === "string" && typed.systemPrompt.trim()
        ? typed.systemPrompt
        : null,
    onboardingPlaybook:
      typeof typed.onboardingPlaybook === "string" && typed.onboardingPlaybook.trim()
        ? typed.onboardingPlaybook
        : null,
    doNotSay: Array.isArray(typed.doNotSay)
      ? typed.doNotSay.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
      : [],
    escalationTriggers: Array.isArray(typed.escalationTriggers)
      ? typed.escalationTriggers
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean)
      : [],
    tone:
      typeof typed.tone === "string" && typed.tone.trim()
        ? typed.tone
        : null,
    modeOverrides:
      typed.modeOverrides && typeof typed.modeOverrides === "object" && !Array.isArray(typed.modeOverrides)
        ? Object.fromEntries(
            Object.entries(typed.modeOverrides as Record<string, unknown>)
              .filter(([, v]) => typeof v === "string" && String(v).trim())
              .map(([k, v]) => [k, String(v)]),
          )
        : {},
    prequalification: normalizePrequalification(prequalRaw),
    updatedAt: typeof typed.updatedAt === "string" && typed.updatedAt ? typed.updatedAt : null,
    updatedBy: typeof typed.updatedBy === "string" && typed.updatedBy ? typed.updatedBy : null,
  };
}

async function readAgentConfigFromStorage() {
  return (await readJsonObject(BUCKET, OBJECT_PATH, normalizeAgentConfig)) ?? EMPTY;
}

export async function loadAgentConfig(): Promise<AgentConfig> {
  const client = getSupabaseAdminClient();
  if (!client) return readAgentConfigFromStorage();

  const { data, error } = await client
    .from(TABLE)
    .select("system_prompt, onboarding_playbook, do_not_say, escalation_triggers, tone, mode_overrides, prequalification, updated_at, updated_by")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (isMissingRelationError(error)) {
    return readAgentConfigFromStorage();
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return readAgentConfigFromStorage();
  }

  const prequalRaw = data.prequalification as Partial<Prequalification> | null;
  const prequalification = normalizePrequalification(prequalRaw);

  return {
    systemPrompt: data.system_prompt ? String(data.system_prompt) : null,
    onboardingPlaybook: data.onboarding_playbook ? String(data.onboarding_playbook) : null,
    doNotSay: Array.isArray(data.do_not_say)
      ? data.do_not_say.filter((v: unknown): v is string => typeof v === "string")
      : [],
    escalationTriggers: Array.isArray(data.escalation_triggers)
      ? data.escalation_triggers.filter((v: unknown): v is string => typeof v === "string")
      : [],
    tone: data.tone ? String(data.tone) : null,
    modeOverrides:
      data.mode_overrides && typeof data.mode_overrides === "object" && !Array.isArray(data.mode_overrides)
        ? Object.fromEntries(
            Object.entries(data.mode_overrides as Record<string, unknown>)
              .filter(([, v]) => typeof v === "string")
              .map(([k, v]) => [k, String(v)]),
          )
        : {},
    prequalification,
    updatedAt: data.updated_at ? String(data.updated_at) : null,
    updatedBy: data.updated_by ? String(data.updated_by) : null,
  };
}

export async function saveAgentConfig(
  patch: Partial<Omit<AgentConfig, "updatedAt" | "updatedBy">>,
  updatedBy: string | null,
): Promise<AgentConfig> {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase not configured");

  const current = await loadAgentConfig();
  const next = {
    id: ROW_ID,
    system_prompt: patch.systemPrompt ?? current.systemPrompt,
    onboarding_playbook: patch.onboardingPlaybook ?? current.onboardingPlaybook,
    do_not_say: patch.doNotSay ?? current.doNotSay,
    escalation_triggers: patch.escalationTriggers ?? current.escalationTriggers,
    tone: patch.tone ?? current.tone,
    mode_overrides: patch.modeOverrides ?? current.modeOverrides,
    prequalification: normalizePrequalification(
      patch.prequalification ?? current.prequalification,
    ),
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };

  const storagePayload: AgentConfig = {
    systemPrompt: next.system_prompt,
    onboardingPlaybook: next.onboarding_playbook,
    doNotSay: next.do_not_say,
    escalationTriggers: next.escalation_triggers,
    tone: next.tone,
    modeOverrides: next.mode_overrides,
    prequalification: next.prequalification,
    updatedAt: next.updated_at,
    updatedBy: next.updated_by,
  };

  const { error } = await client.from(TABLE).upsert(next, { onConflict: "id" });
  if (isMissingRelationError(error)) {
    const persisted = await writeJsonObject(BUCKET, OBJECT_PATH, storagePayload);
    if (!persisted) {
      throw new Error("Unable to persist agent config.");
    }
    return storagePayload;
  }

  if (error) throw new Error(error.message);

  await writeJsonObject(BUCKET, OBJECT_PATH, storagePayload).catch(() => {});
  return loadAgentConfig();
}

/**
 * Compose the final system prompt for the chat route, layering:
 * 1. Editable base system prompt (or built-in default).
 * 2. Tone directive.
 * 3. Onboarding playbook.
 * 4. Hard guardrails (never-say + escalation triggers).
 */
export function composeSystemPrompt(config: AgentConfig): string {
  const sections: string[] = [];

  sections.push(config.systemPrompt?.trim() || FOUNDATION_ASSISTANT_SYSTEM_PROMPT);

  if (config.tone?.trim()) {
    sections.push(`Tone directive: ${config.tone.trim()}`);
  }

  if (config.onboardingPlaybook?.trim()) {
    sections.push(`Onboarding playbook (follow this sequence when guiding the customer):\n${config.onboardingPlaybook.trim()}`);
  }

  if (config.doNotSay.length > 0) {
    sections.push(
      `Hard guardrails — NEVER do or say the following under any circumstance:\n- ${config.doNotSay.join("\n- ")}`,
    );
  }

  if (config.escalationTriggers.length > 0) {
    sections.push(
      `Escalation triggers — if the user mentions any of these, stop advising and tell them a human team member will be in touch within one business day:\n- ${config.escalationTriggers.join("\n- ")}`,
    );
  }

  return sections.filter(Boolean).join("\n\n");
}
