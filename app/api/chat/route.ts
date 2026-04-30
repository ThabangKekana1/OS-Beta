import { NextRequest, NextResponse } from "next/server";
import { FOUNDATION_ASSISTANT_SYSTEM_PROMPT } from "@/lib/assistant/system-prompt";
import { loadAgentConfig, composeSystemPrompt, type AgentConfig } from "@/lib/assistant/agent-config";
import type { AdminLead } from "@/lib/admin-types";
import { getLatestExtractedText } from "@/lib/case-documents";
import { resolveClientOnboardingLead } from "@/lib/client-onboarding";
import { buildClientEoiSigningUrl } from "@/lib/eoi-signing";
import {
  advanceRegistration,
  buildRegistrationReply,
  loadRegistrationDraft,
  type RegistrationDraft,
} from "@/lib/registration-agent";

export const runtime = "nodejs";

function normalizeEnv(value?: string) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

function isTruthyEnv(value?: string) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const DEFAULT_GOOGLE_MODEL = "gemini-2.5-flash";
const GOOGLE_MODEL = normalizeEnv(process.env.GOOGLE_MODEL) || DEFAULT_GOOGLE_MODEL;
const DEBUG_AGENT_MODE =
  isTruthyEnv(normalizeEnv(process.env.DEBUG_AGENT_MODE)) ||
  isTruthyEnv(normalizeEnv(process.env.ADMIN_AGENT_MODE));

type ChatPayload = {
  message?: string;
  context?: string;
  caseName?: string;
  workspaceId?: string;
  caseId?: string;
  mode?: string;
  history?: Array<{ role?: string; content?: string }>;
};

type ChatTurn = { role: "user" | "assistant"; content: string };

type GoogleCallSuccess = {
  ok: true;
  reply: string;
  finishReason: string | null;
};

type GoogleCallFailure = {
  ok: false;
  error: string;
  status?: number;
};

function normalizeModeValue(mode?: string | null) {
  const normalized = (mode ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function messageMatches(message: string, pattern: RegExp) {
  return pattern.test(message);
}

function looksLikeRegistrationIntent(message: string) {
  return messageMatches(
    message,
    /\b(register|registration|sign\s*up|signup|enrol|enroll|apply|onboard)\b/i,
  );
}

function looksLikeRequirementsQuestion(message: string) {
  return messageMatches(
    message,
    /\b(what do you need|what do i need|what is needed|what's needed|what information|what details|what else|what still|what more|required|requirements?)\b/i,
  );
}

function looksLikeQualificationIntent(message: string) {
  return messageMatches(
    message,
    /\b(do i qualify|qualif(?:y|ies|ication)|eligible|eligibility)\b/i,
  );
}

function looksLikeProposalIntent(message: string) {
  return messageMatches(message, /\bproposal\b/i);
}

function looksLikeTermSheetIntent(message: string) {
  return messageMatches(message, /\bterm sheet\b/i);
}

function looksLikeDocumentIntent(message: string) {
  return messageMatches(
    message,
    /\b(document|documents|expression of interest|eoi|utility bill|upload|signed proposal|signed term sheet)\b/i,
  );
}

function inferConversationMode(input: {
  explicitMode: string | null;
  message: string;
  registrationDraftStatus: "in_progress" | "submitted" | "disqualified" | "abandoned" | null;
}) {
  const explicitMode = normalizeModeValue(input.explicitMode);

  if (explicitMode && explicitMode !== "Migrate") {
    return explicitMode;
  }

  if (input.registrationDraftStatus === "in_progress") {
    return "Register";
  }

  if (
    (input.registrationDraftStatus === "submitted" || input.registrationDraftStatus === "disqualified") &&
    (looksLikeRegistrationIntent(input.message) ||
      looksLikeRequirementsQuestion(input.message) ||
      /\b(next step|status|expression of interest|eoi)\b/i.test(input.message))
  ) {
    return "Register";
  }

  if (looksLikeRegistrationIntent(input.message)) {
    return "Register";
  }

  if (looksLikeQualificationIntent(input.message)) {
    return "Qualify";
  }

  if (looksLikeProposalIntent(input.message)) {
    return "Proposal Support";
  }

  if (looksLikeTermSheetIntent(input.message)) {
    return "Term Sheet Support";
  }

  if (looksLikeDocumentIntent(input.message)) {
    return "Review Documents";
  }

  return explicitMode ?? "Migrate";
}

function buildSystemPrompt(
  payload: ChatPayload,
  memorySummary: string | null,
  memoryFacts: string[],
  agentConfig: AgentConfig,
  docExcerpts: { proposal: string | null; termSheet: string | null },
  clientProfileNote: string | null,
  onboardingNote: string | null,
) {
  const sections = [composeSystemPrompt(agentConfig, payload.mode ?? null)];
  void FOUNDATION_ASSISTANT_SYSTEM_PROMPT;
  const caseName = (payload.caseName ?? "").trim();
  const context = (payload.context ?? "").trim();

  if (caseName) sections.push(`Active case: ${caseName}`);
  if (context) sections.push(`Current case context:\n${context}`);
  if (clientProfileNote) sections.push(clientProfileNote);
  if (onboardingNote) sections.push(onboardingNote);

  if (docExcerpts.proposal) {
    sections.push(
      `UPLOADED PROPOSAL DOCUMENT (verbatim extract — quote from this when explaining the proposal):\n${docExcerpts.proposal}`,
    );
  }
  if (docExcerpts.termSheet) {
    sections.push(
      `UPLOADED TERM SHEET DOCUMENT (verbatim extract — quote from this when explaining the term sheet):\n${docExcerpts.termSheet}`,
    );
  }

  if (memoryFacts.length > 0) {
    sections.push(
      `Long-term customer memory (durable facts about this client across all conversations — treat as known background, do not re-ask):\n- ${memoryFacts
        .slice(-40)
        .join("\n- ")}`,
    );
  }
  if (memorySummary) {
    sections.push(`Prior conversation summary: ${memorySummary}`);
  }
  sections.push(
    "Use the conversation history to maintain continuity. If the user refers to something said earlier, find it in history. Never claim to have no memory of the case — you have full access to it.",
  );
  return sections.filter(Boolean).join("\n\n");
}

function normalizeProfileText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeProfileBoolean(value?: boolean | null) {
  return typeof value === "boolean" ? (value ? "yes" : "no") : null;
}

function normalizeProfileCurrency(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? `R${Math.round(value).toLocaleString("en-ZA")}`
    : null;
}

function buildAuthoritativeClientProfileNote(
  registrationDraft: RegistrationDraft | null,
  onboardingLead: AdminLead | null,
) {
  const fields = registrationDraft?.fields ?? {};
  const registrationStatus = normalizeProfileText(registrationDraft?.status)
    ?? (onboardingLead ? "submitted" : null);
  const onboardingStage = normalizeProfileText(onboardingLead?.stage);
  const caseReference =
    normalizeProfileText(registrationDraft?.completedLeadId) ?? normalizeProfileText(onboardingLead?.id);
  const businessName =
    normalizeProfileText(onboardingLead?.company) ?? normalizeProfileText(fields.businessName);
  const businessRegistrationNumber =
    normalizeProfileText(onboardingLead?.businessRegistrationNumber)
    ?? normalizeProfileText(fields.businessRegistrationNumber);
  const industry =
    normalizeProfileText(onboardingLead?.industry) ?? normalizeProfileText(fields.industry);
  const contactFirstName =
    normalizeProfileText(onboardingLead?.contactFirstName) ?? normalizeProfileText(fields.contactFirstName);
  const contactSurname =
    normalizeProfileText(onboardingLead?.contactSurname) ?? normalizeProfileText(fields.contactSurname);
  const contactPosition =
    normalizeProfileText(onboardingLead?.contactPosition) ?? normalizeProfileText(fields.contactPosition);
  const contactEmail =
    normalizeProfileText(onboardingLead?.userProfile.email) ?? normalizeProfileText(fields.contactEmail);
  const contactNumber =
    normalizeProfileText(onboardingLead?.userProfile.phone) ?? normalizeProfileText(fields.contactNumber);
  const monthlyElectricitySpendEstimate =
    normalizeProfileCurrency(onboardingLead?.monthlyElectricitySpendEstimateZar)
    ?? normalizeProfileCurrency(fields.monthlyElectricitySpendEstimateZar);
  const isBusinessRegistered =
    normalizeProfileBoolean(onboardingLead?.isBusinessRegistered) ?? normalizeProfileBoolean(fields.isBusinessRegistered);
  const isBusinessOperational =
    normalizeProfileBoolean(onboardingLead?.isBusinessOperational) ?? normalizeProfileBoolean(fields.isBusinessOperational);
  const hasSixMonthUtilityBill =
    normalizeProfileBoolean(onboardingLead?.hasSixMonthUtilityBill) ?? normalizeProfileBoolean(fields.hasSixMonthUtilityBill);
  const physicalAddress =
    normalizeProfileText(onboardingLead?.physicalAddress) ?? normalizeProfileText(fields.physicalAddress);
  const city = normalizeProfileText(onboardingLead?.city) ?? normalizeProfileText(fields.city);
  const province = normalizeProfileText(onboardingLead?.province) ?? normalizeProfileText(fields.province);

  const lines = [
    registrationStatus ? `- registration status: ${registrationStatus}` : null,
    onboardingStage ? `- onboarding stage: ${onboardingStage}` : null,
    caseReference ? `- case reference: ${caseReference}` : null,
    businessName ? `- business name: ${businessName}` : null,
    businessRegistrationNumber
      ? `- company registration number: ${businessRegistrationNumber}`
      : null,
    industry ? `- industry: ${industry}` : null,
    contactFirstName ? `- contact first name: ${contactFirstName}` : null,
    contactSurname ? `- contact surname: ${contactSurname}` : null,
    contactPosition ? `- contact position: ${contactPosition}` : null,
    contactEmail ? `- contact email: ${contactEmail}` : null,
    contactNumber ? `- contact number: ${contactNumber}` : null,
    monthlyElectricitySpendEstimate
      ? `- monthly electricity spend estimate: ${monthlyElectricitySpendEstimate}`
      : null,
    isBusinessRegistered ? `- business registered with CIPC: ${isBusinessRegistered}` : null,
    isBusinessOperational ? `- business operational: ${isBusinessOperational}` : null,
    hasSixMonthUtilityBill
      ? `- has at least six months of utility bills: ${hasSixMonthUtilityBill}`
      : null,
    physicalAddress ? `- physical address: ${physicalAddress}` : null,
    city ? `- city: ${city}` : null,
    province ? `- province: ${province}` : null,
  ].filter((line): line is string => line !== null);

  if (lines.length === 0) {
    return null;
  }

  return [
    "Authoritative saved client profile (from the server-side registration and onboarding record — use this as the source of truth for client details and answer directly from it when asked):",
    ...lines,
  ].join("\n");
}

function normalizeTurns(
  raw: Array<{ role?: string; content?: string }> | undefined,
): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const role =
        entry.role === "assistant" || entry.role === "user" ? entry.role : null;
      const content = typeof entry.content === "string" ? entry.content.trim() : "";
      if (!role || !content) return null;
      return { role, content } as ChatTurn;
    })
    .filter((t): t is ChatTurn => t !== null);
}

function mergeTurns(persisted: ChatTurn[], clientHistory: ChatTurn[]): ChatTurn[] {
  const seen = new Set(persisted.map((t) => `${t.role}::${t.content}`));
  const extra = clientHistory.filter((t) => !seen.has(`${t.role}::${t.content}`));
  return [...persisted, ...extra].slice(-30);
}

function extractGoogleText(responseJson: unknown) {
  const typed = responseJson as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
  };
  const parts = typed?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part) =>
      part?.thought === true ? "" : typeof part?.text === "string" ? part.text : "",
    )
    .join("")
    .trim();
  return text || null;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGoogle(
  system: string,
  turns: ChatTurn[],
  apiKey: string,
): Promise<GoogleCallSuccess | GoogleCallFailure> {
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${apiKey}`;
    const contents = turns.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    }));
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
      40_000,
    );

    if (!response.ok) {
      return {
        ok: false,
        error: `Google API ${response.status}: ${(await response.text()).slice(0, 200)}`,
        status: response.status,
      };
    }

    const responseJson = (await response.json()) as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    };
    const reply = extractGoogleText(responseJson);
    if (!reply) return { ok: false, error: "Empty response from Google API" };
    return {
      ok: true,
      reply,
      finishReason:
        typeof responseJson.candidates?.[0]?.finishReason === "string"
          ? responseJson.candidates[0].finishReason
          : null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to reach Google API",
    };
  }
}

function replyLooksTruncated(reply: string) {
  const trimmed = reply.trim();
  if (trimmed.length === 0 || /[.!?]"?$/.test(trimmed)) {
    return false;
  }

  const tail = trimmed.split(/\n+/).at(-1)?.trim() ?? trimmed;
  const tailWords = tail.split(/\s+/).filter(Boolean);

  return trimmed.length < 220 && tailWords.length <= 6;
}

function mergeContinuedReply(initial: string, continuation: string) {
  const left = initial.trimEnd();
  const right = continuation.trimStart();

  if (!right) {
    return left;
  }

  return `${left}${/^[,.;:!?)]/.test(right) ? "" : " "}${right}`.trim();
}

async function continueGoogleReply(
  system: string,
  turns: ChatTurn[],
  partialReply: string,
  apiKey: string,
) {
  const continuationTurns: ChatTurn[] = [
    ...turns,
    { role: "assistant", content: partialReply },
    {
      role: "user",
      content:
        "Continue your previous answer from exactly where you stopped. Do not restart or repeat the opening.",
    },
  ];

  return callGoogle(system, continuationTurns, apiKey);
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
  if (DEBUG_AGENT_MODE) return reply;
  const hasScaffold =
    /\bSTATUS:\b|\bPRIMARY_ACTION:\b|\bOWNER:\b|\bREQUIRED_INPUTS:\b|\bRATIONALE:\b/i.test(reply);
  if (!hasScaffold) return reply;
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
  const { getServerAuthSession } = await import("@/lib/auth-server");
  const session = await getServerAuthSession();

  if (!session) {
    return NextResponse.json(
      { error: "Sign in or create an account to chat with Dawn." },
      { status: 401 },
    );
  }

  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "anonymous";
  const rateLimitKey = session.email;

  const { consumeRateLimit } = await import("@/lib/rate-limit");
  const limit = await consumeRateLimit({
    scope: "chat",
    key: rateLimitKey,
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
  if (!googleApiKey) {
    return NextResponse.json(
      { error: "Chat unavailable: GOOGLE_API_KEY is not configured." },
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

  const workspaceId = (payload.workspaceId ?? "").trim();
  const caseId = (payload.caseId ?? "").trim() || null;
  const caseName = (payload.caseName ?? "").trim() || null;
  const requestedMode = normalizeModeValue(payload.mode);

  const { loadChatMemory, loadRecentTranscript, logChatTurn, scheduleMemoryMaintenance } =
    await import("@/lib/assistant/chat-memory");

  const [memory, persistedTurns, agentConfig, proposalText, termSheetText, onboardingLead, registrationDraft] =
    await Promise.all([
      workspaceId ? loadChatMemory(workspaceId) : Promise.resolve(null),
      workspaceId
        ? loadRecentTranscript(workspaceId, caseId, 24)
        : Promise.resolve([] as ChatTurn[]),
      loadAgentConfig(),
      workspaceId && caseId ? getLatestExtractedText(workspaceId, caseId, "proposal") : Promise.resolve(null),
      workspaceId && caseId ? getLatestExtractedText(workspaceId, caseId, "term_sheet") : Promise.resolve(null),
      resolveClientOnboardingLead({
        sessionEmail: session.email,
        workspaceId,
        caseName,
      }),
      workspaceId ? loadRegistrationDraft(workspaceId) : Promise.resolve(null),
    ]);

  const effectiveMode = inferConversationMode({
    explicitMode: requestedMode,
    message,
    registrationDraftStatus: registrationDraft?.status ?? null,
  });

  const onboardingNote = onboardingLead
    ? onboardingLead.eoiSignedAt
      ? `Current onboarding status: the client's Expression of Interest has already been signed by ${onboardingLead.eoiSignedBy ?? onboardingLead.contactName} on ${onboardingLead.eoiSignedAt}. You may proceed with qualification and document collection.`
      : `Current onboarding status: the client must sign their Expression of Interest before qualification can continue. Direct them to sign it here: ${buildClientEoiSigningUrl(onboardingLead.eoiSigningToken)}. Tell them to come back once it is signed.`
    : null;
  const clientProfileNote = buildAuthoritativeClientProfileNote(registrationDraft, onboardingLead);

  const clientHistory = normalizeTurns(payload.history);
  const history = mergeTurns(persistedTurns ?? [], clientHistory);

  if (workspaceId) {
    void logChatTurn({
      workspaceId,
      caseId,
      caseName,
      mode: effectiveMode,
      role: "user",
      content: message,
      context: payload.context ?? null,
      sessionEmail: session?.email ?? null,
      clientIp,
    });
  }

  if (effectiveMode === "Register") {
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Registration requires a workspace context. Refresh and try again." },
        { status: 400 },
      );
    }

    const startedAt = Date.now();
    const advanced = await advanceRegistration({
      workspaceId,
      apiKey: googleApiKey,
      model: GOOGLE_MODEL,
      recentHistory: history,
      latestUser: message,
      prequal: agentConfig.prequalification,
    });
    const reply = buildRegistrationReply({
      draft: advanced.draft,
      extracted: advanced.extracted,
      prequal: agentConfig.prequalification,
      submittedLeadId: advanced.submittedLeadId,
      fallbackNote: advanced.noteForUser,
      latestUser: message,
    });
    const latencyMs = Date.now() - startedAt;
    const registrationStatus = advanced.draft
      ? {
          status: advanced.draft.status,
          leadId: advanced.draft.completedLeadId,
        }
      : null;

    void logChatTurn({
      workspaceId,
      caseId,
      caseName,
      mode: effectiveMode,
      role: "assistant",
      content: reply,
      provider: "registration",
      latencyMs,
      sessionEmail: session?.email ?? null,
      clientIp,
    });

    void scheduleMemoryMaintenance({
      workspaceId,
      caseId,
      caseName,
      googleApiKey,
      googleModel: GOOGLE_MODEL,
      latestUser: message,
      latestAssistant: reply,
    });

    return NextResponse.json({
      reply,
      source: "registration",
      latencyMs,
      registration: registrationStatus,
    });
  }

  const system = buildSystemPrompt(
    { ...payload, mode: effectiveMode },
    memory?.summary ?? null,
    memory?.facts ?? [],
    agentConfig,
    { proposal: proposalText, termSheet: termSheetText },
    clientProfileNote,
    onboardingNote,
  );
  const turns: ChatTurn[] = [...history, { role: "user", content: message }];

  const startedAt = Date.now();
  const result = await callGoogle(system, turns, googleApiKey);

  if (!result.ok) {
    return NextResponse.json({
      reply:
        "I could not get a model response right now. Please retry in a moment and I will continue from the same context.",
      source: "fallback",
      degraded: true,
      providerFailureSummary: result.error,
    });
  }

  let reply = sanitizeReply(result.reply);
  if (result.finishReason === "MAX_TOKENS" || replyLooksTruncated(reply)) {
    const continuation = await continueGoogleReply(system, turns, reply, googleApiKey);
    if (continuation.ok) {
      reply = sanitizeReply(mergeContinuedReply(reply, continuation.reply));
    }
  }
  const latencyMs = Date.now() - startedAt;

  if (workspaceId) {
    void logChatTurn({
      workspaceId,
      caseId,
      caseName,
      mode: effectiveMode,
      role: "assistant",
      content: reply,
      provider: "google",
      latencyMs,
      sessionEmail: session?.email ?? null,
      clientIp,
    });

    // Fire-and-forget: extract durable facts and roll up summary in background.
    void scheduleMemoryMaintenance({
      workspaceId,
      caseId,
      caseName,
      googleApiKey,
      googleModel: GOOGLE_MODEL,
      latestUser: message,
      latestAssistant: reply,
    });
  }

  return NextResponse.json({ reply, source: "google", latencyMs, registration: null });
}
