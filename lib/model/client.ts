/**
 * Provider-agnostic model client. Speaks the OpenAI chat-completions shape over
 * plain HTTPS (no SDK), so the same code runs against OpenAI, Prime Intellect
 * serverless or dedicated inference, a self-hosted vLLM, or any other
 * OpenAI-compatible endpoint by changing MODEL_BASE_URL alone.
 *
 * Configure with MODEL_API_KEY + MODEL_BASE_URL. Optional:
 *   MODEL_DEFAULT   model for drafting and merging nodes
 *   MODEL_VERIFIER  model for verifier nodes (defaults to MODEL_DEFAULT)
 *   MODEL_MAX_OUTPUT_TOKENS, MODEL_TIMEOUT_MS
 *
 * If unset, every call resolves { ok: false, skipped: true } so callers never
 * break: the agent layer stays dormant instead of failing the platform.
 */

export type ModelRole = "draft" | "verify";

export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type ModelCompletion =
  | { ok: true; text: string; model: string; usage: ModelUsage }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string };

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2_048;

function env(name: string) {
  const value = process.env[name];
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

function positiveInt(raw: string, fallback: number) {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function modelConfig() {
  const apiKey = env("MODEL_API_KEY");
  const baseUrl = (env("MODEL_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const draftModel = env("MODEL_DEFAULT");
  const verifierModel = env("MODEL_VERIFIER") || draftModel;
  return {
    configured: Boolean(apiKey && draftModel),
    apiKey,
    baseUrl,
    draftModel,
    verifierModel,
    maxOutputTokens: positiveInt(env("MODEL_MAX_OUTPUT_TOKENS"), DEFAULT_MAX_OUTPUT_TOKENS),
    timeoutMs: positiveInt(env("MODEL_TIMEOUT_MS"), DEFAULT_TIMEOUT_MS),
  };
}

export function modelForRole(role: ModelRole) {
  const config = modelConfig();
  return role === "verify" ? config.verifierModel : config.draftModel;
}

/** Reports whether the agent layer has a model to run on, without exposing the key. */
export function isModelConfigured() {
  return modelConfig().configured;
}

export async function completeChat(input: {
  messages: ModelMessage[];
  role?: ModelRole;
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask the provider for a JSON object. Ignored by providers that do not support it. */
  json?: boolean;
  signal?: AbortSignal;
}): Promise<ModelCompletion> {
  const config = modelConfig();
  if (!config.configured) {
    return {
      ok: false,
      skipped: true,
      reason: "MODEL_API_KEY or MODEL_DEFAULT is not configured.",
    };
  }

  const model = modelForRole(input.role ?? "draft");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  if (input.signal) {
    input.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxOutputTokens ?? config.maxOutputTokens,
        ...(input.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Model request failed (${response.status}). ${detail.slice(0, 400)}`,
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      return { ok: false, error: "Model returned an empty completion." };
    }
    return {
      ok: true,
      text,
      model,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
      },
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? `Model request timed out after ${config.timeoutMs}ms.`
        : error instanceof Error
          ? error.message
          : "Model request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Providers wrap JSON in prose or fences often enough that this is worth having. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return null;
}
