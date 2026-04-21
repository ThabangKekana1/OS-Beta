import { NextRequest, NextResponse } from "next/server";
import { FOUNDATION_ASSISTANT_SYSTEM_PROMPT } from "@/lib/assistant/system-prompt";

export const runtime = "nodejs";

function normalizeEnv(value?: string) {
  if (!value) {
    return "";
  }

  return value.trim().replace(/^["']|["']$/g, "");
}

function isTruthyEnv(value?: string) {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const DEFAULT_GOOGLE_MODEL = "gemini-2.5-flash";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:7b";
const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const OPENAI_MODEL = normalizeEnv(process.env.OPENAI_MODEL) || "gpt-4o-mini";
const GOOGLE_MODEL = normalizeEnv(process.env.GOOGLE_MODEL) || DEFAULT_GOOGLE_MODEL;
const OLLAMA_MODEL =
  normalizeEnv(process.env.LOCAL_LLM_MODEL) ||
  normalizeEnv(process.env.OLLAMA_MODEL) ||
  DEFAULT_OLLAMA_MODEL;
const OLLAMA_BASE_URL =
  normalizeEnv(process.env.LOCAL_LLM_URL) ||
  normalizeEnv(process.env.OLLAMA_BASE_URL) ||
  DEFAULT_OLLAMA_URL;
const AI_PROVIDER = normalizeEnv(process.env.AI_PROVIDER) || "ollama";
const DEBUG_AGENT_MODE =
  isTruthyEnv(normalizeEnv(process.env.DEBUG_AGENT_MODE)) ||
  isTruthyEnv(normalizeEnv(process.env.ADMIN_AGENT_MODE));

type ChatPayload = {
  message?: string;
  context?: string;
  caseName?: string;
};

type ProviderResult = {
  ok: boolean;
  reply?: string;
  error?: string;
  detail?: string;
  status?: number;
};

function buildPrompt(payload: ChatPayload) {
  const message = (payload.message ?? "").trim();
  const context = (payload.context ?? "").trim();
  const caseName = (payload.caseName ?? "").trim();

  return [
    FOUNDATION_ASSISTANT_SYSTEM_PROMPT,
    caseName ? `Active case: ${caseName}` : "",
    context ? `Case context:\n${context}` : "",
    `User message:\n${message}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extractGoogleText(responseJson: unknown) {
  const typed = responseJson as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const parts = typed?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return null;
  }

  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

  return text || null;
}

function extractOpenAiText(responseJson: unknown) {
  const typed = responseJson as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = typed?.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

function extractOllamaText(responseJson: unknown) {
  const typed = responseJson as {
    response?: string;
    message?: {
      content?: string;
    };
  };

  const fromMessage = typed?.message?.content;
  if (typeof fromMessage === "string" && fromMessage.trim()) {
    return fromMessage.trim();
  }

  const fromGenerate = typed?.response;
  if (typeof fromGenerate === "string" && fromGenerate.trim()) {
    return fromGenerate.trim();
  }

  return null;
}

async function callGoogleProvider(prompt: string, apiKey: string): Promise<ProviderResult> {
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 420,
        },
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: "Google API request failed",
        detail: await response.text(),
        status: response.status,
      };
    }

    const reply = extractGoogleText(await response.json());
    if (!reply) {
      return { ok: false, error: "No text returned by Google API" };
    }

    return { ok: true, reply };
  } catch {
    return { ok: false, error: "Unable to reach Google API" };
  }
}

async function callOpenAiProvider(prompt: string, apiKey: string): Promise<ProviderResult> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        max_tokens: 420,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: "OpenAI API request failed",
        detail: await response.text(),
        status: response.status,
      };
    }

    const reply = extractOpenAiText(await response.json());
    if (!reply) {
      return { ok: false, error: "No text returned by OpenAI API" };
    }

    return { ok: true, reply };
  } catch {
    return { ok: false, error: "Unable to reach OpenAI API" };
  }
}

async function callOllamaProvider(prompt: string): Promise<ProviderResult> {
  const endpoint = `${OLLAMA_BASE_URL.replace(/\/+$/, "")}/api/generate`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 420,
        },
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: "Ollama API request failed",
        detail: await response.text(),
        status: response.status,
      };
    }

    const reply = extractOllamaText(await response.json());
    if (!reply) {
      return { ok: false, error: "No text returned by Ollama API" };
    }

    return { ok: true, reply };
  } catch {
    return { ok: false, error: "Unable to reach Ollama API" };
  }
}

function providerOrder() {
  if (AI_PROVIDER === "openai") {
    return ["openai", "ollama", "google"] as const;
  }

  if (AI_PROVIDER === "google") {
    return ["google", "ollama", "openai"] as const;
  }

  return ["ollama", "google", "openai"] as const;
}

function summarizeProviderFailures(errors: ProviderResult[]) {
  return errors
    .map((entry) =>
      [entry.error, entry.status ? `status ${entry.status}` : null]
        .filter(Boolean)
        .join(" | "),
    )
    .join(" ; ");
}

function normalizeReplyText(reply: string) {
  return reply
    .trim()
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```$/i, "")
    .trim()
    .replace(/^"+|"+$/g, "");
}

function deScaffold(reply: string) {
  if (DEBUG_AGENT_MODE) {
    return reply;
  }

  const hasScaffold =
    /\bSTATUS:\b|\bPRIMARY_ACTION:\b|\bOWNER:\b|\bREQUIRED_INPUTS:\b|\bRATIONALE:\b/i.test(reply);

  if (!hasScaffold) {
    return reply;
  }

  return reply
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*STATUS:\s*/i, "")
        .replace(/^\s*PRIMARY_ACTION:\s*/i, "Next step: ")
        .replace(/^\s*OWNER:\s*/i, "")
        .replace(/^\s*REQUIRED_INPUTS:\s*/i, "Required: ")
        .replace(/^\s*RATIONALE:\s*/i, "Why: ")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");
}

function sanitizeReply(reply: string) {
  return deScaffold(normalizeReplyText(reply));
}

export async function POST(request: NextRequest) {
  // Require an authenticated session for chat (prevents anonymous LLM abuse).
  const { getServerAuthSession } = await import("@/lib/auth-server");
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // 30 chats / minute per user.
  const { consumeRateLimit } = await import("@/lib/rate-limit");
  const limit = await consumeRateLimit({
    scope: "chat",
    key: session.email,
    limit: 30,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Chat rate limit exceeded. Slow down and try again." },
      { status: 429 },
    );
  }

  const googleApiKey = normalizeEnv(process.env.GOOGLE_API_KEY);
  const openAiApiKey = normalizeEnv(process.env.OPENAI_API_KEY);
  // In production we never use the local Ollama loopback (unreachable from
  // serverless); a hosted provider is required.
  const hasOllamaConfig =
    process.env.NODE_ENV !== "production" &&
    Boolean(
      normalizeEnv(process.env.LOCAL_LLM_URL) ||
        normalizeEnv(process.env.OLLAMA_BASE_URL) ||
        normalizeEnv(process.env.LOCAL_LLM_MODEL) ||
        normalizeEnv(process.env.OLLAMA_MODEL) ||
        AI_PROVIDER === "ollama" ||
        AI_PROVIDER === "local",
    );

  if (process.env.NODE_ENV === "production" && !googleApiKey && !openAiApiKey) {
    return NextResponse.json(
      { error: "Chat unavailable: no hosted LLM provider configured." },
      { status: 503 },
    );
  }

  let payload: ChatPayload;
  try {
    payload = (await request.json()) as ChatPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = payload.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const prompt = buildPrompt(payload);
  const failures: ProviderResult[] = [];

  for (const provider of providerOrder()) {
    if (provider === "google" && googleApiKey) {
      const result = await callGoogleProvider(prompt, googleApiKey);
      if (result.ok && result.reply) {
        return NextResponse.json({
          reply: sanitizeReply(result.reply),
          source: "google",
        });
      }
      failures.push(result);
    }

    if (provider === "openai" && openAiApiKey) {
      const result = await callOpenAiProvider(prompt, openAiApiKey);
      if (result.ok && result.reply) {
        return NextResponse.json({
          reply: sanitizeReply(result.reply),
          source: "openai",
        });
      }
      failures.push(result);
    }

    if (provider === "ollama" && hasOllamaConfig) {
      const result = await callOllamaProvider(prompt);
      if (result.ok && result.reply) {
        return NextResponse.json({
          reply: sanitizeReply(result.reply),
          source: "ollama",
        });
      }
      failures.push(result);
    }
  }

  return NextResponse.json({
    reply:
      "I could not get a model response right now. Please retry in a moment and I will continue from the same context.",
    source: "fallback",
    degraded: true,
    providerFailureSummary: failures.length > 0 ? summarizeProviderFailures(failures) : null,
  });
}
