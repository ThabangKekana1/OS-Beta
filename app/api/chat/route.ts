import { NextRequest, NextResponse } from "next/server";
import { FOUNDATION_ASSISTANT_SYSTEM_PROMPT } from "@/lib/assistant/system-prompt";
import { loadAgentConfig, composeSystemPrompt, type AgentConfig } from "@/lib/assistant/agent-config";
import {
  callOpenRouterChat,
  resolveOpenRouterApiKey,
  resolveOpenRouterModel,
  type OpenRouterCallFailure,
  type OpenRouterCallSuccess,
  type LlmProvider,
} from "@/lib/assistant/openrouter";
import type { AdminLead } from "@/lib/admin-types";
import { getLatestExtractedText } from "@/lib/case-documents";
import { resolveClientOnboardingLead } from "@/lib/client-onboarding";
import { isSignupShellLead } from "@/lib/client-registration";
import { buildClientEoiSigningPath } from "@/lib/eoi-signing";
import {
  advanceRegistration,
  buildRegistrationStatePrompt,
  buildRegistrationReply,
  loadRegistrationDraft,
  type RegistrationDraft,
} from "@/lib/registration-agent";

export const runtime = "nodejs";
// Allow up to 60s on Vercel Pro so model calls (and registration extractor)
// have time to finish. On Hobby this is silently capped at 10s — if you see
// the fallback message in production with no provider error logged, the plan
// tier is the cause. Upgrade to Pro or shorten the model timeouts below.
export const maxDuration = 60;

function normalizeEnv(value?: string) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

function isTruthyEnv(value?: string) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const DEBUG_AGENT_MODE =
  isTruthyEnv(normalizeEnv(process.env.DEBUG_AGENT_MODE)) ||
  isTruthyEnv(normalizeEnv(process.env.ADMIN_AGENT_MODE));

type LlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  model: string;
};

type ChatPayload = {
  message?: string;
  context?: string;
  caseName?: string;
  workspaceId?: string;
  caseId?: string;
  history?: Array<{ role?: string; content?: string }>;
};

type ChatTurn = { role: "user" | "assistant"; content: string };

type LlmCallResult = OpenRouterCallSuccess | OpenRouterCallFailure;

function resolvePrimaryLlmConfig(): LlmConfig | null {
  const openRouterApiKey = resolveOpenRouterApiKey();
  if (openRouterApiKey) {
    return {
      provider: "openrouter",
      apiKey: openRouterApiKey,
      model: resolveOpenRouterModel(),
    };
  }

  return null;
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

function looksLikeRegistrationData(message: string) {
  const patterns = [
    /\b\d{4}\/\d{6}\/\d{2}\b/i,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /\b(?:\+27|0)\d{9}\b/,
    /\bR\s?\d[\d,.]*/i,
    /\b(?:registered|operational|cipc)\b/i,
    /\b(?:utility bill|utility bills|prepaid receipt|prepaid receipts|electricity spend|monthly spend|6 months?)\b/i,
    /\b(?:gauteng|western cape|kwazulu-natal|eastern cape|free state|limpopo|mpumalanga|north west|northern cape)\b/i,
    /\b(?:registration number|industry|contact email|contact number|physical address|city|province)\b/i,
    /\b(?:founder|director|owner|manager|operations|ceo|cfo)\b/i,
  ];
  const signalCount = patterns.reduce(
    (count, pattern) => count + (pattern.test(message) ? 1 : 0),
    0,
  );
  const separatorCount = (message.match(/[;,]/g) ?? []).length;

  return signalCount >= 2 || (signalCount >= 1 && separatorCount >= 3);
}

function assistantRecentlyAskedForRegistration(turns: ChatTurn[]) {
  const lastAssistantMessage =
    [...turns].reverse().find((turn) => turn.role === "assistant")?.content ?? "";

  return /\b(register|registration|expression of interest|eoi|cipc|registered|operational|business registration number|industry|contact email|contact number|physical address|city|province|monthly electricity spend|prepaid receipts|utility bills)\b/i.test(
    lastAssistantMessage,
  );
}

function recentConversationLooksLikeRegistration(turns: ChatTurn[]) {
  const recentTurns = turns.slice(-6);
  const assistantAsked = recentTurns.some(
    (turn) => turn.role === "assistant" && assistantRecentlyAskedForRegistration([turn]),
  );
  const userProvidedData = recentTurns.some(
    (turn) => turn.role === "user" && looksLikeRegistrationData(turn.content),
  );

  return assistantAsked && userProvidedData;
}

function shouldRunRegistrationFlow(input: {
  message: string;
  registrationDraftStatus: "in_progress" | "submitted" | "disqualified" | "abandoned" | null;
  history: ChatTurn[];
  onboardingLead: AdminLead | null;
}) {
  // Once the EOI has been signed in admin, registration is conclusively done —
  // never re-enter the registration extractor flow. Utility-bill collection and
  // beyond are handled by the general chat path with a tailored onboarding note.
  if (input.onboardingLead?.eoiSignedAt) {
    return false;
  }

  const hasRegistrationData = looksLikeRegistrationData(input.message);
  const registrationContinuation =
    hasRegistrationData && assistantRecentlyAskedForRegistration(input.history);
  const statusFollowUpAfterRegistration =
    recentConversationLooksLikeRegistration(input.history) &&
    /\b(is it ready|ready|next step|status|what now|continue|done|submitted)\b/i.test(
      input.message,
    );

  // Force the registration extractor for any client whose admin record is still
  // a signup shell (pre-qualification has not even started). This guarantees
  // Dawn's very first reply asks the prequal questions instead of small talk.
  if (input.onboardingLead && isSignupShellLead(input.onboardingLead)) {
    return true;
  }

  if (input.registrationDraftStatus === "in_progress") {
    return true;
  }

  if (
    (input.registrationDraftStatus === "submitted" || input.registrationDraftStatus === "disqualified") &&
    (looksLikeRegistrationIntent(input.message) ||
      looksLikeRequirementsQuestion(input.message) ||
      /\b(next step|status|expression of interest|eoi)\b/i.test(input.message))
  ) {
    return true;
  }

  if (
    looksLikeRegistrationIntent(input.message) ||
    registrationContinuation ||
    hasRegistrationData ||
    statusFollowUpAfterRegistration
  ) {
    return true;
  }

  if (
    input.onboardingLead &&
    !input.onboardingLead.eoiSignedAt &&
    /\b(eoi|expression of interest|sign|signed|ready|documents|document section|utility bill|upload)\b/i.test(
      input.message,
    )
  ) {
    return true;
  }

  if (
    input.onboardingLead &&
    isSignupShellLead(input.onboardingLead) &&
    /\b(next step|what now|continue|start|get started)\b/i.test(input.message)
  ) {
    return true;
  }

  return false;
}

function buildSystemPrompt(agentConfig: AgentConfig) {
  const sections = [composeSystemPrompt(agentConfig)];
  void FOUNDATION_ASSISTANT_SYSTEM_PROMPT;
  sections.push(
    [
      "Primary operational objective:",
      "- Successfully onboard the client.",
      "- Educate the client about Foundation-1's products whenever they ask, especially Generocity and Lumen-1.",
      "- Explain proposals and term sheets clearly in plain English when those documents are available or the client asks about them.",
      "- Before collecting full registration details, confirm one pre-qualification item at a time: CIPC-registered, operational, spending at least R10,000 per month on electricity, and access to 6 months of utility bills or prepaid receipts.",
      "- Collect and save the registration details one field at a time, clarifying any ambiguous answer before moving on.",
      "- Once registration is complete, direct the client to sign the EOI generated by the system in their documents flow.",
      "- Once the EOI is signed, collect the latest 6 months of utility bills.",
      "- After utility bills are in, explain that the allocated sales agent will handle the remaining documentation.",
      "- Answer the client's questions directly, then bring them back to the next onboarding step.",
      "- Never talk about internal conversation modes or switch the workflow away from this onboarding sequence.",
    ].join("\n"),
  );

  return sections.join("\n\n");
}

function buildPromptContext(
  payload: ChatPayload,
  memorySummary: string | null,
  memoryFacts: string[],
  agentConfig: AgentConfig,
  docExcerpts: { proposal: string | null; termSheet: string | null },
  clientProfileNote: string | null,
  onboardingNote: string | null,
) {
  const sections = [
    buildSystemPrompt(agentConfig),
  ];
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
  sections.push(
    "If the user asks about products, educate them clearly before returning to onboarding. If the user asks about a proposal or term sheet and a document extract is available, ground the explanation in that document rather than giving a generic answer.",
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

function pickProfileText(
  leadValue: string | null | undefined,
  draftValue: string | null | undefined,
  preferDraft: boolean,
) {
  return preferDraft
    ? normalizeProfileText(draftValue) ?? normalizeProfileText(leadValue)
    : normalizeProfileText(leadValue) ?? normalizeProfileText(draftValue);
}

function pickProfileBoolean(
  leadValue: boolean | null | undefined,
  draftValue: boolean | null | undefined,
  preferDraft: boolean,
) {
  return preferDraft
    ? normalizeProfileBoolean(draftValue) ?? normalizeProfileBoolean(leadValue)
    : normalizeProfileBoolean(leadValue) ?? normalizeProfileBoolean(draftValue);
}

function pickProfileCurrency(
  leadValue: number | null | undefined,
  draftValue: number | null | undefined,
  preferDraft: boolean,
) {
  return preferDraft
    ? normalizeProfileCurrency(draftValue) ?? normalizeProfileCurrency(leadValue)
    : normalizeProfileCurrency(leadValue) ?? normalizeProfileCurrency(draftValue);
}

function deriveRegistrationStatus(
  registrationDraft: RegistrationDraft | null,
  onboardingLead: AdminLead | null,
) {
  const fromDraft = normalizeProfileText(registrationDraft?.status);
  if (fromDraft) {
    return fromDraft;
  }

  if (!onboardingLead) {
    return null;
  }

  if (isSignupShellLead(onboardingLead)) {
    return "account created";
  }

  if (onboardingLead.stage === "Disqualified") {
    return "disqualified";
  }

  return "submitted";
}

function buildAuthoritativeClientProfileNote(
  registrationDraft: RegistrationDraft | null,
  onboardingLead: AdminLead | null,
) {
  const fields = registrationDraft?.fields ?? {};
  const preferDraft = isSignupShellLead(onboardingLead);
  const registrationStatus = deriveRegistrationStatus(registrationDraft, onboardingLead);
  const onboardingStage = normalizeProfileText(onboardingLead?.stage);
  const caseReference =
    normalizeProfileText(registrationDraft?.completedLeadId) ?? normalizeProfileText(onboardingLead?.id);
  const businessName = pickProfileText(onboardingLead?.company, fields.businessName, preferDraft);
  const businessRegistrationNumber = pickProfileText(
    onboardingLead?.businessRegistrationNumber,
    fields.businessRegistrationNumber,
    preferDraft,
  );
  const industry = pickProfileText(onboardingLead?.industry, fields.industry, preferDraft);
  const contactFirstName = pickProfileText(
    onboardingLead?.contactFirstName,
    fields.contactFirstName,
    preferDraft,
  );
  const contactSurname = pickProfileText(
    onboardingLead?.contactSurname,
    fields.contactSurname,
    preferDraft,
  );
  const contactPosition = pickProfileText(
    onboardingLead?.contactPosition,
    fields.contactPosition,
    preferDraft,
  );
  const contactEmail = pickProfileText(
    onboardingLead?.userProfile.email,
    fields.contactEmail,
    preferDraft,
  );
  const contactNumber = pickProfileText(
    onboardingLead?.userProfile.phone,
    fields.contactNumber,
    preferDraft,
  );
  const monthlyElectricitySpendEstimate = pickProfileCurrency(
    onboardingLead?.monthlyElectricitySpendEstimateZar,
    fields.monthlyElectricitySpendEstimateZar,
    preferDraft,
  );
  const isBusinessRegistered = pickProfileBoolean(
    onboardingLead?.isBusinessRegistered,
    fields.isBusinessRegistered,
    preferDraft,
  );
  const isBusinessOperational = pickProfileBoolean(
    onboardingLead?.isBusinessOperational,
    fields.isBusinessOperational,
    preferDraft,
  );
  const hasSixMonthUtilityBill = pickProfileBoolean(
    onboardingLead?.hasSixMonthUtilityBill,
    fields.hasSixMonthUtilityBill,
    preferDraft,
  );
  const physicalAddress = pickProfileText(
    onboardingLead?.physicalAddress,
    fields.physicalAddress,
    preferDraft,
  );
  const city = pickProfileText(onboardingLead?.city, fields.city, preferDraft);
  const province = pickProfileText(onboardingLead?.province, fields.province, preferDraft);

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
      ? `- has at least six months of utility bills or prepaid receipts: ${hasSixMonthUtilityBill}`
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

async function callLlm(
  system: string,
  turns: ChatTurn[],
  config: LlmConfig,
): Promise<LlmCallResult> {
  void config.provider;
  return callOpenRouterChat({
    apiKey: config.apiKey,
    model: config.model,
    system,
    turns,
    maxOutputTokens: 1200,
    temperature: 0.2,
  });
}

async function continueLlmReply(
  system: string,
  turns: ChatTurn[],
  partialReply: string,
  config: LlmConfig,
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

  return callLlm(system, continuationTurns, config);
}

function isTokenLimitFinishReason(finishReason: string | null) {
  return /MAX_TOKENS|length|max_tokens/i.test(finishReason ?? "");
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

  const llmConfig = resolvePrimaryLlmConfig();
  if (!llmConfig) {
    console.error("[chat] OPENROUTER_API_KEY is not configured");
    return NextResponse.json(
      { error: "Chat unavailable: OPENROUTER_API_KEY is not configured." },
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
  const conversationMode = "Onboarding";

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
      workspaceId ? loadRegistrationDraft({ workspaceId, caseId }) : Promise.resolve(null),
    ]);

  const clientHistory = normalizeTurns(payload.history);
  const history = mergeTurns(persistedTurns ?? [], clientHistory);

  const runRegistrationFlow = shouldRunRegistrationFlow({
    message,
    registrationDraftStatus: registrationDraft?.status ?? null,
    history,
    onboardingLead,
  });

  const onboardingNote = onboardingLead
    ? onboardingLead.eoiSignedAt
      ? (() => {
          const stagesPastUtilityBills = new Set([
            "Utility Bills Uploaded",
            "Compliance Pack Uploaded",
            "Term Sheet Uploaded",
            "Onboarding Complete",
          ]);
          const utilityBillsAlreadyDone = stagesPastUtilityBills.has(onboardingLead.stage);
          if (utilityBillsAlreadyDone) {
            return `Current onboarding status: the EOI is signed and utility bills are uploaded. Stage is "${onboardingLead.stage}". Confirm the next step (compliance pack or term sheet review depending on stage) and answer questions about the proposal/term sheet when asked.`;
          }
          return [
            `Current onboarding status: the EOI is SIGNED (signed by ${onboardingLead.eoiSignedBy ?? onboardingLead.contactName} on ${onboardingLead.eoiSignedAt}). Stage is "${onboardingLead.stage}". The next mandatory step is collecting the last 6 months of utility bills or prepaid electricity receipts.`,
            "ACTIVE TASK: in your reply you must explicitly request the 6 monthly utility bills.",
            "Tell the client:",
            "- Nedbank uses the last 6 months of usage data to prepare the Generocity proposal, so these documents are required before we can move on.",
            "- They should upload the files in the Documents tab of their workspace, in the \"Utility Bills (last 6 months)\" section.",
            "- One file per month (municipal utility bill OR prepaid electricity slip) for the last 6 calendar months.",
            "- After all 6 are uploaded they should reply here so you can confirm and move to the next step.",
            "Do not advance to compliance pack, term sheet, or proposal explanation until all 6 utility bills are uploaded.",
            "If the client says they have uploaded some bills, ask how many are in and which months are still missing.",
          ].join("\n");
        })()
      : onboardingLead.eoiSigningToken
        ? `Current onboarding status: the client must sign their Expression of Interest before qualification can continue. Direct them to open Documents and sign it there, or send this signing path: ${buildClientEoiSigningPath(onboardingLead.eoiSigningToken)}. Tell them to come back once it is signed so you can request their 6 months of utility bills for Nedbank's proposal.`
        : "Current onboarding status: the client account exists, but business registration is not complete yet. Start pre-qualification with only the first missing question (CIPC-registered), then collect the remaining checks one by one: operational, ≥R10,000/month spend, and 6 months of utility bills or prepaid receipts. Do not greet without asking the first prequal question."
    : null;
  const clientProfileNote = buildAuthoritativeClientProfileNote(registrationDraft, onboardingLead);

  if (workspaceId) {
    void logChatTurn({
      workspaceId,
      caseId,
      caseName,
      mode: conversationMode,
      role: "user",
      content: message,
      context: payload.context ?? null,
      sessionEmail: session?.email ?? null,
      clientIp,
    });
  }

  if (runRegistrationFlow) {
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Registration requires a workspace context. Refresh and try again." },
        { status: 400 },
      );
    }

    const startedAt = Date.now();
    const advanced = await advanceRegistration({
      workspaceId,
      caseId,
      provider: llmConfig.provider,
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      recentHistory: history,
      latestUser: message,
      prequal: agentConfig.prequalification,
      sessionEmail: session?.email ?? null,
    });
    const fallbackReply = buildRegistrationReply({
      draft: advanced.draft,
      extracted: advanced.extracted,
      prequal: agentConfig.prequalification,
      submittedLeadId: advanced.submittedLeadId,
      fallbackNote: advanced.noteForUser,
      latestUser: message,
    });
    let reply = fallbackReply;

    // When the deterministic flow has produced an authoritative next-step
    // message (confirmation prompt, submission notice, disqualification
    // notice, or any noteForUser), use it verbatim. Letting the LLM rewrite
    // these has caused hallucinated "go sign your EOI in Documents" replies
    // even when the registration was never actually submitted.
    const hasAuthoritativeNote = Boolean(advanced.noteForUser?.trim());

    if (advanced.draft?.status === "in_progress" && !hasAuthoritativeNote) {
      const registerSystem = [
        buildPromptContext(
          payload,
          memory?.summary ?? null,
          memory?.facts ?? [],
          agentConfig,
          { proposal: proposalText, termSheet: termSheetText },
          clientProfileNote,
          onboardingNote,
        ),
        buildRegistrationStatePrompt(advanced.draft),
        `Latest extracted registration fields from the user's last message:\n${JSON.stringify(advanced.extracted)}`,
        `Fallback next-step reply if you cannot improve it:\n${fallbackReply}`,
        "Use the registration state as the source of truth for what is still missing.",
        "Ask for only one next thing at a time unless the user explicitly asks for a requirements summary.",
        "Answer clarification questions directly, then return the user to the next onboarding step.",
        "Do not restart the process, do not list irrelevant steps, and do not contradict the saved registration state.",
      ].join("\n\n");

      const registerTurns: ChatTurn[] = [...history, { role: "user", content: message }];
      const registerResult = await callLlm(registerSystem, registerTurns, llmConfig);

      if (registerResult.ok) {
        reply = sanitizeReply(registerResult.reply);
        if (isTokenLimitFinishReason(registerResult.finishReason) || replyLooksTruncated(reply)) {
          const continuation = await continueLlmReply(
            registerSystem,
            registerTurns,
            reply,
            llmConfig,
          );
          if (continuation.ok) {
            reply = sanitizeReply(mergeContinuedReply(reply, continuation.reply));
          }
        }
      }
    }

    const latencyMs = Date.now() - startedAt;
    const registrationStatus = advanced.draft
      ? {
          status: advanced.draft.status,
          leadId: advanced.draft.completedLeadId,
          businessName: advanced.draft.fields.businessName ?? null,
          eoiSigningPath: buildClientEoiSigningPath(advanced.submittedEoiSigningToken),
        }
      : null;

    void logChatTurn({
      workspaceId,
      caseId,
      caseName,
      mode: conversationMode,
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
      provider: llmConfig.provider,
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
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

  const system = buildPromptContext(
    payload,
    memory?.summary ?? null,
    memory?.facts ?? [],
    agentConfig,
    { proposal: proposalText, termSheet: termSheetText },
    clientProfileNote,
    onboardingNote,
  );
  const turns: ChatTurn[] = [...history, { role: "user", content: message }];

  const startedAt = Date.now();
  const result = await callLlm(system, turns, llmConfig);

  if (!result.ok) {
    // Always log the underlying provider error to Vercel logs so it can be
    // diagnosed without poking around the network tab.
    console.error(`[chat] ${llmConfig.provider} API call failed:`, result.error);
    const showDetails = DEBUG_AGENT_MODE || session.role === "admin";
    const detailSuffix = showDetails ? `\n\n(debug: ${result.error})` : "";
    return NextResponse.json({
      reply:
        `I could not get a model response right now. Please retry in a moment and I will continue from the same context.${detailSuffix}`,
      source: "fallback",
      degraded: true,
      providerFailureSummary: result.error,
    });
  }

  let reply = sanitizeReply(result.reply);
  if (isTokenLimitFinishReason(result.finishReason) || replyLooksTruncated(reply)) {
    const continuation = await continueLlmReply(system, turns, reply, llmConfig);
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
      mode: conversationMode,
      role: "assistant",
      content: reply,
      provider: llmConfig.provider,
      latencyMs,
      sessionEmail: session?.email ?? null,
      clientIp,
    });

    // Fire-and-forget: extract durable facts and roll up summary in background.
    void scheduleMemoryMaintenance({
      workspaceId,
      caseId,
      caseName,
      provider: llmConfig.provider,
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      latestUser: message,
      latestAssistant: reply,
    });
  }

  return NextResponse.json({ reply, source: llmConfig.provider, latencyMs, registration: null });
}
