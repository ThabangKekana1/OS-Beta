/**
 * Hosted VLM adapter — env-keyed, provider-agnostic, DORMANT until funded.
 *
 * No funded hosted-VLM API key exists yet. This adapter is implemented fully
 * so that funding a key + setting three env vars activates machine reading of
 * scanned bill packs with zero code changes:
 *
 *   DOCUMENT_READER_VLM_PROVIDER   "openai" (any OpenAI-compatible
 *                                  /chat/completions endpoint) | "anthropic"
 *   DOCUMENT_READER_VLM_API_KEY    the funded key
 *   DOCUMENT_READER_VLM_MODEL      e.g. "gpt-5.2" / "claude-opus-4-6"
 *   DOCUMENT_READER_VLM_BASE_URL   optional override (self-hosted vLLM etc.)
 *   DOCUMENT_READER_VLM_MAX_PAGES  optional, default 12
 *   DOCUMENT_READER_VLM_TIMEOUT_MS optional, default 120000
 *
 * Design rule (07/08 architecture): the model TRANSCRIBES; it never writes
 * case state. Its primary output is a faithful plain-text transcript of the
 * statement, which is then fed to the EXISTING deterministic parser
 * (`analyseUtilityBillText`) whose ±0.2% reconciliation accepts or rejects
 * it. A hallucinated transcript fails reconciliation and is self-detecting.
 * The secondary structured JSON is carried along for the operator's review
 * screen — it is never trusted directly.
 */
import { createPdfParser } from "@/lib/pdf-parse-runtime";
import type { AdapterAttempt } from "./types";

function env(name: string): string {
  const value = process.env[name];
  return value ? value.trim().replace(/^["']|["']$/g, "") : "";
}

export type VlmConfig = {
  provider: "openai" | "anthropic";
  apiKey: string;
  model: string;
  baseUrl: string;
  maxPages: number;
  timeoutMs: number;
};

export function getVlmConfig(): VlmConfig | null {
  const apiKey = env("DOCUMENT_READER_VLM_API_KEY");
  const model = env("DOCUMENT_READER_VLM_MODEL");
  if (!apiKey || !model) return null;
  const provider = env("DOCUMENT_READER_VLM_PROVIDER") === "anthropic" ? "anthropic" : "openai";
  const baseUrl =
    env("DOCUMENT_READER_VLM_BASE_URL") ||
    (provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1");
  const maxPages = Number.parseInt(env("DOCUMENT_READER_VLM_MAX_PAGES"), 10) || 12;
  const timeoutMs = Number.parseInt(env("DOCUMENT_READER_VLM_TIMEOUT_MS"), 10) || 120_000;
  return { provider, apiKey, model, baseUrl: baseUrl.replace(/\/$/, ""), maxPages, timeoutMs };
}

export function isVlmConfigured(): boolean {
  return getVlmConfig() !== null;
}

const TRANSCRIPTION_SYSTEM_PROMPT = [
  "You are a document transcription engine for South African electricity",
  "statements (Eskom, municipal, landlord/HOA recoveries).",
  "Transcribe the supplied statement pages into plain text EXACTLY as printed:",
  "keep every label (e.g. PREMISE ID NUMBER, TARIFF NAME:, NOTIFIED MAX",
  "DEMAND, CONSUMPTION DETAILS), every charge line with its description,",
  "quantity, unit, rate and rand amount, every date, and every total/VAT/",
  "amount-due figure. Preserve reading order. Never invent, round, or omit",
  "figures. If a value is illegible write [ILLEGIBLE].",
].join(" ");

/** Strict response schema: transcript is authoritative; fields are advisory. */
const BILL_JSON_SCHEMA = {
  name: "utility_bill_read",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["transcript", "fields"],
    properties: {
      transcript: { type: "string", description: "Verbatim plain-text transcript of all pages." },
      fields: {
        type: "object",
        additionalProperties: false,
        required: [
          "accountNumber", "taxInvoiceNumber", "premiseId", "periodStart",
          "periodEnd", "billingDays", "tariffName", "totalKwh",
          "totalChargesExVat", "vatAmount", "totalChargesInclVat", "chargeLines",
        ],
        properties: {
          accountNumber: { type: ["string", "null"] },
          taxInvoiceNumber: { type: ["string", "null"] },
          premiseId: { type: ["string", "null"] },
          periodStart: { type: ["string", "null"], description: "YYYY-MM-DD" },
          periodEnd: { type: ["string", "null"], description: "YYYY-MM-DD" },
          billingDays: { type: ["number", "null"] },
          tariffName: { type: ["string", "null"] },
          totalKwh: { type: ["number", "null"] },
          totalChargesExVat: { type: ["number", "null"] },
          vatAmount: { type: ["number", "null"] },
          totalChargesInclVat: { type: ["number", "null"] },
          chargeLines: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["description", "amountExVat", "quantity", "unit", "rate"],
              properties: {
                description: { type: "string" },
                amountExVat: { type: "number" },
                quantity: { type: ["number", "null"] },
                unit: { type: ["string", "null"] },
                rate: { type: ["number", "null"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

async function renderPageDataUrls(bytes: Uint8Array, maxPages: number): Promise<string[]> {
  // pdf.js detaches the buffer it is given — always render from a copy.
  const parser = await createPdfParser(Uint8Array.from(bytes));
  try {
    const shot = await parser.getScreenshot({
      first: maxPages,
      scale: 2,
      imageDataUrl: true,
      imageBuffer: false,
    });
    return shot.pages.map((page) => page.dataUrl).filter(Boolean);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type VlmPayload = { transcript: string; structuredJson: string };

async function callOpenAiCompatible(
  config: VlmConfig,
  bytes: Uint8Array,
): Promise<VlmPayload> {
  const pages = await renderPageDataUrls(bytes, config.maxPages);
  if (pages.length === 0) throw new Error("No pages could be rendered for the vision model.");
  const response = await timedFetch(
    `${config.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_schema", json_schema: BILL_JSON_SCHEMA },
        messages: [
          { role: "system", content: TRANSCRIPTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe this utility statement and fill the JSON schema." },
              ...pages.map((dataUrl) => ({ type: "image_url", image_url: { url: dataUrl } })),
            ],
          },
        ],
      }),
    },
    config.timeoutMs,
  );
  if (!response.ok) {
    throw new Error(`VLM endpoint returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("VLM response carried no content.");
  const parsed = JSON.parse(content) as { transcript?: string };
  if (typeof parsed.transcript !== "string" || parsed.transcript.length === 0) {
    throw new Error("VLM response missing transcript.");
  }
  return { transcript: parsed.transcript, structuredJson: content };
}

async function callAnthropic(config: VlmConfig, bytes: Uint8Array): Promise<VlmPayload> {
  const response = await timedFetch(
    `${config.baseUrl}/v1/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 16_000,
        system: `${TRANSCRIPTION_SYSTEM_PROMPT} Respond ONLY with JSON matching this schema: ${JSON.stringify(BILL_JSON_SCHEMA.schema)}`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: toBase64(bytes) },
              },
              { type: "text", text: "Transcribe this utility statement and fill the JSON schema." },
            ],
          },
        ],
      }),
    },
    config.timeoutMs,
  );
  if (!response.ok) {
    throw new Error(`VLM endpoint returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const body = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = body.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("VLM response carried no text block.");
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(jsonText) as { transcript?: string };
  if (typeof parsed.transcript !== "string" || parsed.transcript.length === 0) {
    throw new Error("VLM response missing transcript.");
  }
  return { transcript: parsed.transcript, structuredJson: jsonText };
}

/**
 * Attempt a vision read of a scanned/photographed statement.
 * Returns `skipped` (never throws) when no key is configured — the adapter
 * chain then falls through to local OCR / the operator desk.
 */
export async function readWithVlm(bytes: Uint8Array): Promise<AdapterAttempt> {
  const config = getVlmConfig();
  if (!config) {
    return {
      ok: false,
      method: "vlm",
      skipped: true,
      reason:
        "No hosted VLM key configured (DOCUMENT_READER_VLM_API_KEY / DOCUMENT_READER_VLM_MODEL unset). Adapter dormant until a key is funded.",
    };
  }
  try {
    const payload =
      config.provider === "anthropic"
        ? await callAnthropic(config, bytes)
        : await callOpenAiCompatible(config, bytes);
    return { ok: true, method: "vlm", text: payload.transcript, structuredJson: payload.structuredJson };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown VLM failure.";
    return { ok: false, method: "vlm", skipped: false, reason: message };
  }
}
