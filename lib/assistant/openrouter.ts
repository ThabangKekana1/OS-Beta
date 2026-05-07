import { OpenRouter } from "@openrouter/sdk";
import type { ChatMessages } from "@openrouter/sdk/models";

export type LlmProvider = "openrouter" | "google";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type OpenRouterCallSuccess = {
  ok: true;
  reply: string;
  finishReason: string | null;
  model: string;
};

export type OpenRouterCallFailure = {
  ok: false;
  error: string;
  status?: number;
};

export const DEFAULT_OPENROUTER_MODEL = "minimax/minimax-m2.5:free";

function normalizeEnv(value?: string) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

export function resolveOpenRouterApiKey() {
  return normalizeEnv(process.env.OPENROUTER_API_KEY);
}

export function resolveOpenRouterModel() {
  return normalizeEnv(process.env.OPENROUTER_MODEL) || DEFAULT_OPENROUTER_MODEL;
}

function siteUrl() {
  return normalizeEnv(process.env.NEXT_PUBLIC_SITE_URL) || "https://www.1os.co.za";
}

function client(apiKey: string) {
  return new OpenRouter({
    apiKey,
    httpReferer: siteUrl(),
    appTitle: "1OS Dawn",
  });
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const typed = item as { text?: unknown; type?: unknown };
      return typeof typed.text === "string" ? typed.text : "";
    })
    .join("")
    .trim();
}

function finishReasonValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

export async function callOpenRouterChat(input: {
  apiKey: string;
  model: string;
  system: string;
  turns: ChatTurn[];
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<OpenRouterCallSuccess | OpenRouterCallFailure> {
  try {
    const messages: ChatMessages[] = [
      { role: "system", content: input.system },
      ...input.turns.map((turn) => ({
        role: turn.role,
        content: turn.content,
      } as ChatMessages)),
    ];

    const result = await client(input.apiKey).chat.send(
      {
        chatRequest: {
          model: input.model,
          messages,
          stream: false,
          temperature: input.temperature ?? 0.2,
          maxTokens: input.maxOutputTokens ?? 1200,
        },
      },
      { timeoutMs: input.timeoutMs ?? 45_000 },
    );

    const choice = result.choices?.[0];
    const reply = contentToText(choice?.message?.content);
    if (!reply) {
      return { ok: false, error: `Empty response from OpenRouter (model=${input.model})` };
    }

    return {
      ok: true,
      reply,
      finishReason: finishReasonValue(choice?.finishReason),
      model: result.model || input.model,
    };
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number"
      ? ((error as { status: number }).status)
      : undefined;
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unable to reach OpenRouter";
    return {
      ok: false,
      error: `OpenRouter API${status ? ` ${status}` : ""} (model=${input.model}): ${message}`,
      status,
    };
  }
}

export async function callOpenRouterText(input: {
  apiKey: string;
  model: string;
  prompt: string;
  maxOutputTokens: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string | null> {
  const response = await callOpenRouterChat({
    apiKey: input.apiKey,
    model: input.model,
    system: "Return exactly what the user asks for. Do not add markdown fences unless requested.",
    turns: [{ role: "user", content: input.prompt }],
    maxOutputTokens: input.maxOutputTokens,
    temperature: input.temperature ?? 0,
    timeoutMs: input.timeoutMs ?? 30_000,
  });

  return response.ok ? response.reply : null;
}
