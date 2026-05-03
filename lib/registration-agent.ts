import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildClientEoiSigningPath } from "@/lib/eoi-signing";
import { createNotification } from "@/lib/notifications";

const TABLE = "oneos_registration_drafts";

type RegistrationFields = {
  businessName?: string;
  businessRegistrationNumber?: string;
  industry?: string;
  contactFirstName?: string;
  contactSurname?: string;
  contactPosition?: string;
  contactEmail?: string;
  contactNumber?: string;
  monthlyElectricitySpendEstimateZar?: number;
  isBusinessRegistered?: boolean;
  isBusinessOperational?: boolean;
  hasSixMonthUtilityBill?: boolean;
  physicalAddress?: string;
  city?: string;
  province?: string;
};

export type RegistrationDraft = {
  draftKey: string;
  workspaceId: string;
  caseId: string | null;
  fields: RegistrationFields;
  status: "in_progress" | "submitted" | "disqualified" | "abandoned";
  completedLeadId: string | null;
  disqualificationReason: string | null;
  updatedAt: string;
};

type RegistrationConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

type Prequalification = {
  minMonthlySpendZar: number;
  requireRegistered: boolean;
  requireOperational: boolean;
  requireSixMonthHistory: boolean;
  softDisqualifyMessage: string;
};

const PREQUAL_FIELDS = [
  "isBusinessRegistered",
  "isBusinessOperational",
  "monthlyElectricitySpendEstimateZar",
  "hasSixMonthUtilityBill",
] as const;

const REQUIRED_FIELDS: (keyof RegistrationFields)[] = [
  ...PREQUAL_FIELDS,
  "businessName",
  "businessRegistrationNumber",
  "industry",
  "contactFirstName",
  "contactSurname",
  "contactPosition",
  "contactEmail",
  "contactNumber",
  "physicalAddress",
  "city",
  "province",
];

const FIELD_PROMPTS: Record<keyof RegistrationFields, string> = {
  businessName: "the registered business name",
  businessRegistrationNumber: "the CIPC business registration number (e.g. 2018/123456/07)",
  industry: "the industry sector",
  contactFirstName: "the primary contact's first name",
  contactSurname: "the primary contact's surname",
  contactPosition: "the contact's position/role at the business",
  contactEmail: "the contact's email address",
  contactNumber: "the contact's phone number",
  monthlyElectricitySpendEstimateZar:
    "the average monthly electricity spend in Rand (minimum R10,000 to proceed)",
  isBusinessRegistered: "whether the business is officially registered with CIPC (yes/no)",
  isBusinessOperational: "whether the business is currently operational (yes/no)",
  hasSixMonthUtilityBill:
    "whether they have at least 6 months of utility bills or prepaid electricity receipts available (yes/no)",
  physicalAddress: "the physical street address of the business",
  city: "the city",
  province: "the South African province",
};

const FIELD_QUESTIONS: Record<keyof RegistrationFields, string> = {
  businessName: "What is the registered business name?",
  businessRegistrationNumber:
    "What is the CIPC business registration number? It usually looks like 2018/123456/07.",
  industry: "What industry sector does the business operate in?",
  contactFirstName: "What is the first name of the primary contact?",
  contactSurname: "What is the surname of the primary contact?",
  contactPosition: "What is the contact's position or role at the business?",
  contactEmail: "What is the contact's email address?",
  contactNumber: "What is the contact's phone number?",
  monthlyElectricitySpendEstimateZar:
    "What is the average monthly electricity spend in Rand? Please give a clear figure, e.g. \"R15,000 per month\" or \"R10k–R20k\". We need at least R10,000 per month to proceed.",
  isBusinessRegistered: "Is the business officially registered with CIPC?",
  isBusinessOperational: "Is the business currently operational?",
  hasSixMonthUtilityBill:
    "Do you have access to at least 6 months of utility bills or prepaid electricity receipts?",
  physicalAddress: "What is the full physical street address of the business?",
  city: "What city is the business located in?",
  province: "Which South African province is the business located in?",
};

function buildDraftKey(workspaceId: string, caseId?: string | null) {
  const normalizedWorkspaceId = workspaceId.trim();
  const normalizedCaseId = caseId?.trim() ?? "";
  return normalizedCaseId ? `${normalizedWorkspaceId}::${normalizedCaseId}` : normalizedWorkspaceId;
}

function parseDraftKey(draftKey: string) {
  const [workspaceId, ...rest] = draftKey.split("::");
  return {
    draftKey,
    workspaceId: workspaceId ?? "",
    caseId: rest.length > 0 ? rest.join("::") : null,
  };
}

export async function loadRegistrationDraft(
  input: { workspaceId: string; caseId?: string | null },
): Promise<RegistrationDraft | null> {
  const client = getSupabaseAdminClient();
  const draftKey = buildDraftKey(input.workspaceId, input.caseId);
  if (!client || !draftKey) return null;
  const { data } = await client
    .from(TABLE)
    .select("*")
    .eq("workspace_id", draftKey)
    .maybeSingle();
  if (!data) return null;
  const scope = parseDraftKey(String(data.workspace_id));
  return {
    draftKey: scope.draftKey,
    workspaceId: scope.workspaceId,
    caseId: scope.caseId,
    fields: (data.fields ?? {}) as RegistrationFields,
    status: data.status as RegistrationDraft["status"],
    completedLeadId: data.completed_lead_id ? String(data.completed_lead_id) : null,
    disqualificationReason: data.disqualification_reason ? String(data.disqualification_reason) : null,
    updatedAt: String(data.updated_at),
  };
}

export async function listRegistrationDrafts(
  status?: RegistrationDraft["status"],
): Promise<RegistrationDraft[]> {
  const client = getSupabaseAdminClient();
  if (!client) return [];

  let query = client
    .from(TABLE)
    .select("*")
    .order("updated_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data } = await query;
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) => ({
    ...parseDraftKey(String(row.workspace_id)),
    fields: (row.fields ?? {}) as RegistrationFields,
    status: row.status as RegistrationDraft["status"],
    completedLeadId: row.completed_lead_id ? String(row.completed_lead_id) : null,
    disqualificationReason: row.disqualification_reason ? String(row.disqualification_reason) : null,
    updatedAt: String(row.updated_at),
  }));
}

async function saveRegistrationDraft(
  input: { workspaceId: string; caseId?: string | null },
  fields: RegistrationFields,
): Promise<void> {
  const client = getSupabaseAdminClient();
  const draftKey = buildDraftKey(input.workspaceId, input.caseId);
  if (!client || !draftKey) return;
  await client
    .from(TABLE)
    .upsert(
      {
        workspace_id: draftKey,
        fields,
        status: "in_progress",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" },
    );
}

async function markDraftStatus(
  input: { workspaceId: string; caseId?: string | null },
  status: RegistrationDraft["status"],
  extras: { completedLeadId?: string; reason?: string } = {},
): Promise<void> {
  const client = getSupabaseAdminClient();
  const draftKey = buildDraftKey(input.workspaceId, input.caseId);
  if (!client || !draftKey) return;
  await client
    .from(TABLE)
    .update({
      status,
      completed_lead_id: extras.completedLeadId ?? null,
      completed_at: status === "submitted" || status === "disqualified" ? new Date().toISOString() : null,
      disqualification_reason: extras.reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", draftKey);
}

function missingFields(fields: RegistrationFields): (keyof RegistrationFields)[] {
  return REQUIRED_FIELDS.filter((key) => {
    const value = fields[key];
    if (value === undefined || value === null) return true;
    if (typeof value === "string" && value.trim().length === 0) return true;
    return false;
  });
}

function missingPrequalificationFields(fields: RegistrationFields) {
  return PREQUAL_FIELDS.filter((key) => {
    const value = fields[key];
    return value === undefined || value === null;
  });
}

function nextRequiredField(fields: RegistrationFields): keyof RegistrationFields | null {
  const pendingPrequal = missingPrequalificationFields(fields);
  if (pendingPrequal.length > 0) {
    return pendingPrequal[0];
  }

  const pendingFields = missingFields(fields);
  return pendingFields[0] ?? null;
}

function isDraftComplete(fields: RegistrationFields): boolean {
  return missingFields(fields).length === 0;
}

function looksLikeRegistrationConfirmation(message?: string | null) {
  if (!message) {
    return false;
  }

  return /\b(confirm|confirmed|that'?s correct|that is correct|looks good|all correct|go ahead|proceed|submit it|submit)\b/i.test(
    message,
  );
}

function formatFieldValue(field: keyof RegistrationFields, value: RegistrationFields[keyof RegistrationFields]) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (field === "monthlyElectricitySpendEstimateZar" && typeof value === "number") {
    return `R${Math.round(value).toLocaleString("en-ZA")}`;
  }

  return String(value);
}

function buildRegistrationConfirmationPrompt(fields: RegistrationFields) {
  const summary = REQUIRED_FIELDS.map((field) => {
    const value = fields[field];
    return value === undefined || value === null || value === ""
      ? null
      : `- ${FIELD_PROMPTS[field]}: ${formatFieldValue(field, value)}`;
  })
    .filter((line): line is string => line !== null)
    .join("\n");

  return [
    `I have all the registration details for ${fields.businessName?.trim() || "your business"}. Please confirm these details before I submit them into 1OS:`,
    summary,
    "",
    "Reply with `confirm` to submit, or send the correction if anything is wrong.",
  ].join("\n");
}

export function buildRegistrationStatePrompt(draft: RegistrationDraft | null): string {
  const fields = draft?.fields ?? {};
  const collected = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  const missing = missingFields(fields);

  const lines = [
    "REGISTRATION MODE — you are Dawn, the conversational onboarding agent for 1OS / Nedbank Generocity.",
    "Follow the six-step onboarding sequence in this exact order. Do not skip ahead.",
    "  Step 1 — INTRODUCE Foundation-1's zero-capex solar solution, name BOTH products (Generocity and Lumen-1), state that solutions are 100% financed by Nedbank, and mention Lumen-1 is backed by the Green Share VPP 56 MW Solar Farm in the Free State province. Only do this on the very first message of a new session.",
    "  Step 2 — EXPLAIN THE PROCESS: registration → EOI signature in the Documents tab → upload 6 months of utility bills → proposal showing savings and site infrastructure. Do this on the first message too if you have not already.",
    "  Step 3 — PRE-QUALIFY: confirm (1) company is CIPC-registered, (2) currently operational, (3) average monthly electricity spend ≥ R10,000, (4) has access to last 6 months of utility bills or prepaid receipts. The business qualifies only if all four are yes.",
    "  Step 4 — REGISTER: collect the full business profile, then direct the user to sign the auto-generated EOI in the Documents tab. The EOI is NOT emailed; it is generated and stored in the Documents section of their workspace.",
    "  Step 5 — UTILITY BILLS: once EOI is signed, ask for the last 6 months of utility bills/prepaid receipts uploaded in the Documents tab so Nedbank can prepare the Generocity proposal.",
    "  Step 6 — KYC HANDOVER: once all 6 utility bills are uploaded, explain that the KYC documentation pack will be handled with their allocated Foundation-1 sales account manager who will reach out to them directly. Do not start collecting KYC docs yourself.",
    "Stay focused on the current step. Do not advance until the current step is complete.",
    `Status: ${draft?.status ?? "not started"}`,
    collected.length > 0
      ? `Already collected:\n- ${collected.join("\n- ")}`
      : "Nothing collected yet.",
    missingPrequalificationFields(fields).length > 0
      ? `Pre-qualification still needed first (Step 3 — ask for ONE at a time, naturally — do NOT list these to the user):\n- ${missingPrequalificationFields(fields).map((k) => FIELD_PROMPTS[k]).join("\n- ")}`
      : missing.length > 0
        ? `Eligibility is confirmed. Still needed for full registration (Step 4 — ask for ONE at a time, naturally — do NOT list these to the user):\n- ${missing.map((k) => FIELD_PROMPTS[k]).join("\n- ")}`
        : "All required fields are collected. Summarise the captured details and ask the user to confirm or correct them. Do not submit until they clearly confirm.",
    "Rules:",
    "- On the very first turn of a new session (no fields collected yet, no draft history), open with Step 1 + Step 2 in a single concise greeting before asking the first pre-qualification question.",
    "- Always complete the pre-qualification questions before moving on to the rest of the registration details.",
    "- Ask for ONE missing field per message, in a natural, friendly way.",
    "- Acknowledge what they just told you before asking the next question.",
    "- If they provide multiple things in one message, that's fine — extraction handles it.",
    "- Never invent or assume values.",
    "- If you DO NOT understand the user's reply, or it is ambiguous, vague, or off-topic, you MUST say so plainly and ask again with a concrete example of the format you need. Examples you should use:",
    "    • Spend: \"I'm not sure I caught that — please give me the average monthly Rand figure, e.g. 'R15,000 per month' or 'R10k–R20k per month'.\"",
    "    • CIPC number: \"I need the CIPC number in the format YYYY/NNNNNN/NN, e.g. 2018/123456/07.\"",
    "    • Yes/no: \"Just to confirm — please reply yes or no.\"",
    "    • Email: \"Please share an email address in the format name@company.co.za.\"",
    "    • Phone: \"Please share a South African phone number, e.g. 0821234567 or +27821234567.\"",
    "  Do not move on until they answer that specific field with a concrete, parseable value.",
    "- If the spend the user gave looks suspiciously small (e.g. they typed '10' or 'R10' with no 'k', no 'thousand', and no thousands separator), assume they meant a larger figure and ask: \"Did you mean R10,000 per month? Please confirm the full Rand amount, e.g. 'R10,000' or 'R10k'.\" Do NOT silently accept tiny figures.",
    "- If they ask what you need, summarise the missing items in plain language.",
    "- Once all fields are collected, pause for an explicit confirmation before submission.",
    "- After submission (Step 4 complete), the EOI is generated automatically. Direct the client to sign it in the Documents tab and tell them the next step after signing is uploading 6 months of utility bills (Step 5) so Nedbank can prepare their Generocity proposal.",
    "- After all 6 utility bills are uploaded (Step 5 complete), advance to Step 6: tell them KYC documentation will be handled by their allocated Foundation-1 sales account manager who will reach out directly. Do not begin collecting KYC documents yourself.",
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Per-turn extractor
// ---------------------------------------------------------------------------

type ExtractInput = {
  apiKey: string;
  model: string;
  currentFields: RegistrationFields;
  recentHistory: RegistrationConversationTurn[];
  latestUser: string;
};

const EXTRACT_SYSTEM = `You extract South African business registration data from a customer's reply.
Return STRICT JSON matching this TypeScript type. Include EVERY field that is present anywhere in the user transcript below, even if multiple fields appear in one sentence. Omit ONLY fields you cannot infer from the user's statements (do not invent).

{
  "businessName"?: string,
  "businessRegistrationNumber"?: string,
  "industry"?: string,
  "contactFirstName"?: string,
  "contactSurname"?: string,
  "contactPosition"?: string,
  "contactEmail"?: string,
  "contactNumber"?: string,
  "monthlyElectricitySpendEstimateZar"?: number,
  "isBusinessRegistered"?: boolean,
  "isBusinessOperational"?: boolean,
  "hasSixMonthUtilityBill"?: boolean,
  "physicalAddress"?: string,
  "city"?: string,
  "province"?: string
}

Rules:
- Numbers are plain numbers, not strings. Convert k/K to thousands and m/M to millions: "R12,500/month" -> 12500; "about R28,500" -> 28500; "R10k" -> 10000; "R1.5m" -> 1500000; "R10 000" -> 10000.
- For ranges like "R15k-R20k" or "between R15,000 and R20,000" or "R15 to R20 thousand", return the LOWER bound (e.g. 15000) — pre-qualification is conservative.
- DO NOT extract monthlyElectricitySpendEstimateZar if the user's number is below R1,000 unless they explicitly state a sub-R1,000 figure with the "R" prefix or "per month" suffix. Bare numbers like "10" most likely mean "R10,000" — omit the field so the agent can ask for clarification.
- Use ONLY the user's statements as facts. You may use assistant questions only to resolve short replies like "yes", "no", "I do", or "same address".
- Booleans ONLY when the user explicitly states the fact about their business. Phrases like "I want to register" or "I'd like to sign up" or "register me" are NOT statements about CIPC registration status — omit isBusinessRegistered in that case.
- isBusinessRegistered=true ONLY if the user explicitly says the business is registered, or supplies a CIPC number, or affirms "yes" / "yeah" / "yep" / "correct" / "we are" to the assistant's most recent direct registration question.
- isBusinessRegistered=false ONLY if the user explicitly says the business is NOT registered, or replies "no" / "nope" / "not yet" to the assistant's most recent direct registration question.
- isBusinessOperational=true ONLY if the user explicitly says the business is operational/trading, or affirms "yes" / "yeah" / "yep" / "correct" / "we are" to the assistant's most recent direct operational question. isBusinessOperational=false ONLY if they explicitly say it is not operational, or reply "no" / "not yet" to that question.
- hasSixMonthUtilityBill=true ONLY if the user says they have at least 6 months of utility bills/prepaid receipts, or affirms "yes" / "yeah" to the assistant's most recent direct question about 6 months of utility bills/prepaid receipts. hasSixMonthUtilityBill=false ONLY if they explicitly say they don't have 6 months, or reply "no" to that question.
- A short user reply such as "yes", "yeah", "yep", "correct", "we are", "no", "nope", or "not yet" MUST be resolved against the assistant's most recent question in the transcript above and mapped to the corresponding boolean field.
- "physicalAddress" is the street line only (e.g. "12 Long Street"); "city" and "province" are separate. South African provinces: Gauteng, Western Cape, KwaZulu-Natal, Eastern Cape, Free State, Limpopo, Mpumalanga, North West, Northern Cape.
- "hasSixMonthUtilityBill" is true if they have 6 OR MORE months of utility bills OR prepaid electricity receipts.
- Output ONLY the raw JSON object. No markdown fences, no preamble. If nothing can be extracted, return {}.`;

function parseCurrencyNumber(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Math.max(0, Number.parseInt(digits, 10)) : null;
}

/**
 * Parse a single Rand amount token, honouring k/K (thousands) and m/M
 * (millions) suffixes. Examples:
 *   "R10k"        -> 10000
 *   "R10 000"     -> 10000
 *   "R12,500"     -> 12500
 *   "R1.5m"       -> 1500000
 *   "R10.5k"      -> 10500
 *   "10"          -> 10        (caller decides if this is plausible)
 */
function parseRandAmount(token: string): number | null {
  const trimmed = token.trim().toLowerCase().replace(/^r\s*/, "");
  const match = trimmed.match(/^(\d+(?:[\s,.]\d+)*)\s*([km])?$/i);
  if (!match) return parseCurrencyNumber(token);
  const numericPart = match[1].replace(/[\s,]/g, "");
  // Decide if the dot is a decimal point (single dot, ≤3 trailing digits) or a
  // thousands separator. Accountants in SA use both; default to decimal when
  // the suffix is k/m, otherwise treat as thousands separator.
  const suffix = match[2]?.toLowerCase();
  let value: number;
  if (suffix) {
    value = Number.parseFloat(numericPart);
    if (!Number.isFinite(value)) return null;
    value *= suffix === "m" ? 1_000_000 : 1_000;
  } else {
    value = Number.parseInt(numericPart.replace(/\./g, ""), 10);
    if (!Number.isFinite(value)) return null;
  }
  return Math.max(0, Math.round(value));
}

/**
 * Find Rand amounts in a free-text reply. Returns the LOWER bound when a
 * range like "R15k-R20k" or "between R15,000 and R20,000" is detected, since
 * pre-qualification should be conservative.
 */
function extractMonthlyRandAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const tokenPattern = /\bR?\s?\d+(?:[\s,.]\d+)*\s*[km]?\b/gi;
  const tokens = trimmed.match(tokenPattern) ?? [];
  // Drop tokens that are obviously not currency (years, phone fragments).
  const amounts = tokens
    .map((tok) => ({ raw: tok, value: parseRandAmount(tok) }))
    .filter((entry): entry is { raw: string; value: number } => {
      if (entry.value === null) return false;
      // Reject 4-digit numbers that look like a year (1900-2099) unless they
      // explicitly carry an R prefix or k/m suffix.
      if (/^\d{4}$/.test(entry.raw.trim()) && entry.value >= 1900 && entry.value <= 2099) {
        return false;
      }
      return true;
    });

  if (amounts.length === 0) return null;

  // Prefer tokens that explicitly carried an R prefix or k/m suffix.
  const explicit = amounts.filter((entry) => /^R/i.test(entry.raw.trim()) || /[km]\b/i.test(entry.raw.trim()));
  const candidates = explicit.length > 0 ? explicit : amounts;

  // If two amounts appear and the message looks like a range, take the lower.
  const isRange =
    /\b(?:between|from)\b/i.test(trimmed) ||
    /[-–—]/.test(trimmed) ||
    /\bto\b/i.test(trimmed);
  if (candidates.length >= 2 && isRange) {
    return Math.min(...candidates.map((c) => c.value));
  }

  return candidates[0].value;
}

/**
 * Treat any value below R1,000/month as ambiguous. People type "10" when they
 * mean "R10,000", and we should not silently disqualify them — the agent
 * should ask for clarification with an example.
 */
const SUSPICIOUSLY_LOW_SPEND_ZAR = 1_000;

function normalizeBusinessRegistrationNumber(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return /^\d{4}\/\d{6}\/\d{2}$/i.test(normalized) ? normalized : null;
}

function captureLabelValue(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:\\-]\\s*([^\\n.]+)`, "i");
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function extractDeterministicRegistrationFields(
  text: string,
  lastAssistantMessage?: string | null,
): RegistrationFields {
  const extracted: RegistrationFields = {};

  // Resolve short yes/no replies against the assistant's most recent question.
  // This is critical for booleans like isBusinessOperational, where a bare "yes"
  // is otherwise ignored by both this regex extractor and (sometimes) the LLM.
  const trimmed = text.trim().toLowerCase();
  const yesPattern = /^(?:y|ya|ye|yes|yeah|yep|yup|yess+|sure|correct|affirmative|definitely|absolutely|of course|we are|we do|i am|i do|it is|that'?s right|that is right|right|ok|okay|👍|✅)[!.\s]*$/i;
  const noPattern = /^(?:n|no|nope|nah|not yet|negative|we are not|we don'?t|i don'?t|it is not|it isn'?t|not really)[!.\s]*$/i;
  const isShortYes = yesPattern.test(trimmed);
  const isShortNo = noPattern.test(trimmed);
  if ((isShortYes || isShortNo) && lastAssistantMessage) {
    const lastQ = lastAssistantMessage.toLowerCase();
    const value = isShortYes;
    if (/\b(cipc|registered with cipc|officially registered|business registered|registration with cipc)\b/.test(lastQ)) {
      extracted.isBusinessRegistered = value;
    } else if (/\b(operational|currently trading|trading|in operation|active business)\b/.test(lastQ)) {
      extracted.isBusinessOperational = value;
    } else if (/\b(6 months|six months|utility bills?|prepaid (?:electricity )?receipts?|prepaid slips?)\b/.test(lastQ)) {
      extracted.hasSixMonthUtilityBill = value;
    }
  }

  const businessName = captureLabelValue(text, ["business name", "registered business name"]);
  if (businessName) extracted.businessName = businessName;

  const businessRegistrationNumber = normalizeBusinessRegistrationNumber(
    captureLabelValue(text, [
      "business registration number",
      "registration number",
      "cipc business registration number",
    ]) ?? text.match(/\b\d{4}\/\d{6}\/\d{2}\b/i)?.[0],
  );
  if (businessRegistrationNumber) {
    extracted.businessRegistrationNumber = businessRegistrationNumber.trim();
    extracted.isBusinessRegistered = true;
  }

  const industry = captureLabelValue(text, ["industry", "industry sector", "industry of business"]);
  if (industry) extracted.industry = industry;

  const contactFirstName = captureLabelValue(text, ["contact first name", "first name"]);
  if (contactFirstName) extracted.contactFirstName = contactFirstName;

  const contactSurname = captureLabelValue(text, ["contact surname", "surname", "last name"]);
  if (contactSurname) extracted.contactSurname = contactSurname;

  const contactPosition = captureLabelValue(text, ["contact position", "position", "role"]);
  if (contactPosition) extracted.contactPosition = contactPosition;

  const contactEmail =
    text.match(
      /(?:contact email|email address|email)\s*[:\-]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
    )?.[1]
    ?? text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
    ?? null;
  if (contactEmail) extracted.contactEmail = contactEmail.trim().toLowerCase();

  const contactNumber =
    captureLabelValue(text, ["contact number", "phone number", "mobile number", "phone"])
    ?? text.match(/\b(?:\+27|0)\d(?:[\d\s-]{7,}\d)\b/)?.[0]
    ?? null;
  if (contactNumber) extracted.contactNumber = contactNumber.trim();

  const spendRaw = captureLabelValue(text, [
    "monthly electricity spend",
    "average monthly electricity spend",
    "monthly spend",
  ]);
  const spendCandidate = spendRaw ? parseRandAmount(spendRaw) : extractMonthlyRandAmount(text);
  if (spendCandidate !== null && spendCandidate >= SUSPICIOUSLY_LOW_SPEND_ZAR) {
    extracted.monthlyElectricitySpendEstimateZar = spendCandidate;
  }

  const physicalAddress = captureLabelValue(text, ["physical address", "street address", "address"]);
  if (physicalAddress) extracted.physicalAddress = physicalAddress;

  const city = captureLabelValue(text, ["city"]);
  if (city) extracted.city = city;

  const province = captureLabelValue(text, ["province"]);
  if (province) extracted.province = province;

  if (/\b(?:the business is registered|business is registered|officially registered|registered and operational)\b/i.test(text)) {
    extracted.isBusinessRegistered = true;
  } else if (/\b(?:business is not registered|not registered)\b/i.test(text)) {
    extracted.isBusinessRegistered = false;
  }

  if (/\b(?:registered and operational|business is operational|currently operational)\b/i.test(text)) {
    extracted.isBusinessOperational = true;
  } else if (/\b(?:business is not operational|not operational)\b/i.test(text)) {
    extracted.isBusinessOperational = false;
  }

  if (/\b(?:have 6 months of utility bills|have six months of utility bills|6 months of utility bills available|at least 6 months of utility bills|have 6 months of prepaid receipts|have six months of prepaid receipts|prepaid receipts for 6 months|prepaid electricity receipts)\b/i.test(text)) {
    extracted.hasSixMonthUtilityBill = true;
  } else if (/\b(?:do not have 6 months of utility bills|don't have 6 months of utility bills|no 6 months of utility bills|do not have 6 months of prepaid receipts|don't have 6 months of prepaid receipts|no prepaid receipts)\b/i.test(text)) {
    extracted.hasSixMonthUtilityBill = false;
  }

  return sanitizeExtracted(extracted);
}

async function extractRegistrationFields(
  input: ExtractInput,
): Promise<RegistrationFields> {
  const lastAssistant = [...input.recentHistory].reverse().find((t) => t.role === "assistant")?.content ?? null;
  const deterministic = extractDeterministicRegistrationFields(input.latestUser, lastAssistant);
  const transcript = [...input.recentHistory, { role: "user", content: input.latestUser }]
    .slice(-40)
    .map((turn) => `${turn.role === "assistant" ? "Assistant" : "User"}: ${turn.content}`)
    .join("\n");
  const prompt = `${EXTRACT_SYSTEM}\n\ncurrentFields: ${JSON.stringify(input.currentFields)}\n\nConversation transcript:\n${transcript}\n\nReturn the extracted JSON object.`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${input.apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 800,
          responseMimeType: "application/json",
        },
      }),
    }).finally(() => clearTimeout(timer));

    if (!response.ok) return deterministic;
    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return deterministic;
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as RegistrationFields;
    const llmExtracted = sanitizeExtracted(parsed);
    return mergeFields(llmExtracted, deterministic);
  } catch {
    return deterministic;
  }
}

function sanitizeExtracted(raw: RegistrationFields): RegistrationFields {
  const out: RegistrationFields = {};
  if (typeof raw.businessName === "string") out.businessName = raw.businessName.trim();
  if (typeof raw.businessRegistrationNumber === "string") {
    const normalizedRegistrationNumber = normalizeBusinessRegistrationNumber(
      raw.businessRegistrationNumber,
    );
    if (normalizedRegistrationNumber) {
      out.businessRegistrationNumber = normalizedRegistrationNumber;
    }
  }
  if (typeof raw.industry === "string") out.industry = raw.industry.trim();
  if (typeof raw.contactFirstName === "string") out.contactFirstName = raw.contactFirstName.trim();
  if (typeof raw.contactSurname === "string") out.contactSurname = raw.contactSurname.trim();
  if (typeof raw.contactPosition === "string") out.contactPosition = raw.contactPosition.trim();
  if (typeof raw.contactEmail === "string") out.contactEmail = raw.contactEmail.trim().toLowerCase();
  if (typeof raw.contactNumber === "string") out.contactNumber = raw.contactNumber.trim();
  if (typeof raw.monthlyElectricitySpendEstimateZar === "number" && Number.isFinite(raw.monthlyElectricitySpendEstimateZar)) {
    const rounded = Math.max(0, Math.round(raw.monthlyElectricitySpendEstimateZar));
    // Reject obviously-too-small values (e.g. user typed "10" meaning R10,000).
    // The agent will ask for clarification with an example.
    if (rounded >= SUSPICIOUSLY_LOW_SPEND_ZAR) {
      out.monthlyElectricitySpendEstimateZar = rounded;
    }
  }
  if (typeof raw.isBusinessRegistered === "boolean") out.isBusinessRegistered = raw.isBusinessRegistered;
  if (typeof raw.isBusinessOperational === "boolean") out.isBusinessOperational = raw.isBusinessOperational;
  if (typeof raw.hasSixMonthUtilityBill === "boolean") out.hasSixMonthUtilityBill = raw.hasSixMonthUtilityBill;
  if (typeof raw.physicalAddress === "string") out.physicalAddress = raw.physicalAddress.trim();
  if (typeof raw.city === "string") out.city = raw.city.trim();
  if (typeof raw.province === "string") out.province = raw.province.trim();
  return out;
}

function mergeFields(
  current: RegistrationFields,
  incoming: RegistrationFields,
): RegistrationFields {
  return { ...current, ...incoming };
}

// ---------------------------------------------------------------------------
// Pre-qualification + submission
// ---------------------------------------------------------------------------

function evaluatePrequalification(
  fields: RegistrationFields,
  prequal: Prequalification,
): { ok: true } | { ok: false; reason: string } {
  if (prequal.requireRegistered && fields.isBusinessRegistered === false) {
    return { ok: false, reason: "Business is not officially registered with CIPC." };
  }
  if (prequal.requireOperational && fields.isBusinessOperational === false) {
    return { ok: false, reason: "Business is not currently operational." };
  }
  if (prequal.requireSixMonthHistory && fields.hasSixMonthUtilityBill === false) {
    return {
      ok: false,
      reason: "Client does not have 6 months of utility bills or prepaid electricity receipts available.",
    };
  }
  if (
    typeof fields.monthlyElectricitySpendEstimateZar === "number" &&
    fields.monthlyElectricitySpendEstimateZar < prequal.minMonthlySpendZar
  ) {
    return {
      ok: false,
      reason: `Monthly electricity spend (R${fields.monthlyElectricitySpendEstimateZar.toLocaleString("en-ZA")}) is below the minimum (R${prequal.minMonthlySpendZar.toLocaleString("en-ZA")}).`,
    };
  }
  return { ok: true };
}

/**
 * Try to advance the registration flow after the latest assistant reply.
 * Returns a system note to append to the next assistant message (or null).
 */
export async function advanceRegistration(input: {
  workspaceId: string;
  caseId?: string | null;
  apiKey: string;
  model: string;
  recentHistory: RegistrationConversationTurn[];
  latestUser: string;
  prequal: Prequalification;
  sessionEmail?: string | null;
}): Promise<{
  draft: RegistrationDraft | null;
  noteForUser: string | null;
  submittedLeadId?: string;
  submittedEoiSigningToken?: string | null;
  disqualified?: { reason: string };
  extracted: RegistrationFields;
}> {
  if (!input.workspaceId) return { draft: null, noteForUser: null, extracted: {} };

  const scope = { workspaceId: input.workspaceId, caseId: input.caseId };
  const existing = await loadRegistrationDraft(scope);

  // Submitted is final — we never want to recreate the lead.
  if (existing && existing.status === "submitted") {
    let noteForUser: string | null = null;
    let submittedEoiSigningToken: string | null = null;

    if (existing.completedLeadId) {
      const { readAdminStateSnapshot } = await import("@/lib/admin-state-store");
      const { snapshot } = await readAdminStateSnapshot();
      const lead = snapshot.leads.find((entry) => entry.id === existing.completedLeadId) ?? null;
      submittedEoiSigningToken = lead?.eoiSigningToken ?? null;
      if (submittedEoiSigningToken) {
        noteForUser = `You're registered. Your case reference is ${existing.completedLeadId}. Your Expression of Interest is ready in Documents. Sign it there, or use this signing link: ${buildClientEoiSigningPath(submittedEoiSigningToken)}. Once it's signed, come back here so we can continue into qualification.`;
      }
    }

    return {
      draft: existing,
      noteForUser,
      submittedEoiSigningToken,
      extracted: {},
    };
  }

  // Disqualified is RECOVERABLE: if the user clarifies (e.g. "sorry, I meant
  // R20k not R10") and the corrected facts pass pre-qualification, we resume
  // the draft instead of stonewalling them.
  let workingDraft = existing;
  if (workingDraft && workingDraft.status === "disqualified") {
    const recheckExtracted = await extractRegistrationFields({
      apiKey: input.apiKey,
      model: input.model,
      currentFields: workingDraft.fields,
      recentHistory: input.recentHistory,
      latestUser: input.latestUser,
    });
    const candidateFields = mergeFields(workingDraft.fields, recheckExtracted);
    const recheck = evaluatePrequalification(candidateFields, input.prequal);
    if (recheck.ok) {
      await saveRegistrationDraft(scope, candidateFields);
      workingDraft = await loadRegistrationDraft(scope);
    } else {
      return {
        draft: workingDraft,
        noteForUser: `${input.prequal.softDisqualifyMessage}\n\nReason: ${workingDraft.disqualificationReason ?? recheck.reason}`,
        disqualified: { reason: workingDraft.disqualificationReason ?? recheck.reason },
        extracted: recheckExtracted,
      };
    }
  }

  const currentFields = workingDraft?.fields ?? {};
  const extracted = await extractRegistrationFields({
    apiKey: input.apiKey,
    model: input.model,
    currentFields,
    recentHistory: input.recentHistory,
    latestUser: input.latestUser,
  });

  const merged = mergeFields(currentFields, extracted);

  // Pre-check for hard disqualification: only fire once we have ENOUGH explicit signal
  // (avoid disqualifying on a single ambiguous extraction).
  const haveAllPrequalSignals =
    merged.isBusinessRegistered !== undefined &&
    merged.isBusinessOperational !== undefined &&
    typeof merged.monthlyElectricitySpendEstimateZar === "number" &&
    merged.hasSixMonthUtilityBill !== undefined;
  const prequalCheck = evaluatePrequalification(merged, input.prequal);
  if (!prequalCheck.ok && haveAllPrequalSignals) {
    await saveRegistrationDraft(scope, merged);
    await markDraftStatus(scope, "disqualified", { reason: prequalCheck.reason });
    void createNotification({
      audience: "admin",
      kind: "system",
      title: `Conversational registration disqualified: ${merged.businessName ?? "unknown business"}`,
      body: `Reason: ${prequalCheck.reason}\nCollected so far: ${JSON.stringify(merged)}`,
      link: "/admin/leads",
      metadata: { workspaceId: input.workspaceId, fields: merged, reason: prequalCheck.reason },
    });
    return {
      draft: {
        ...(existing ?? {
          draftKey: buildDraftKey(scope.workspaceId, scope.caseId),
          workspaceId: scope.workspaceId,
          caseId: scope.caseId ?? null,
          fields: {},
          status: "in_progress",
          completedLeadId: null,
          disqualificationReason: null,
          updatedAt: "",
        }),
        fields: merged,
        status: "disqualified",
        disqualificationReason: prequalCheck.reason,
      },
      noteForUser: `${input.prequal.softDisqualifyMessage}\n\nReason: ${prequalCheck.reason}`,
      disqualified: { reason: prequalCheck.reason },
      extracted,
    };
  }

  await saveRegistrationDraft(scope, merged);

  if (!isDraftComplete(merged)) {
    return {
      draft: {
        draftKey: buildDraftKey(scope.workspaceId, scope.caseId),
        workspaceId: input.workspaceId,
        caseId: input.caseId ?? null,
        fields: merged,
        status: "in_progress",
        completedLeadId: null,
        disqualificationReason: null,
        updatedAt: new Date().toISOString(),
      },
      noteForUser: null,
      extracted,
    };
  }

  if (!looksLikeRegistrationConfirmation(input.latestUser)) {
    return {
      draft: {
        draftKey: buildDraftKey(scope.workspaceId, scope.caseId),
        workspaceId: input.workspaceId,
        caseId: input.caseId ?? null,
        fields: merged,
        status: "in_progress",
        completedLeadId: null,
        disqualificationReason: null,
        updatedAt: new Date().toISOString(),
      },
      noteForUser: buildRegistrationConfirmationPrompt(merged),
      extracted,
    };
  }

  // All fields present + passes prequal — submit.
  const submitted = await submitConversationalRegistration(input.workspaceId, merged, input.sessionEmail ?? null);
  if (!submitted) {
    void createNotification({
      audience: "admin",
      kind: "system",
      title: `Registration submit FAILED: ${merged.businessName ?? "unknown business"}`,
      body: `Conversational registration could not be persisted for ${merged.contactEmail ?? "unknown contact"} (workspace ${input.workspaceId}). Check Vercel logs for [registration-agent] submit failed.\nCollected: ${JSON.stringify(merged)}`,
      link: "/admin/leads",
      metadata: { workspaceId: input.workspaceId, fields: merged },
    });
    return {
      draft: {
        draftKey: buildDraftKey(scope.workspaceId, scope.caseId),
        workspaceId: input.workspaceId,
        caseId: input.caseId ?? null,
        fields: merged,
        status: "in_progress",
        completedLeadId: null,
        disqualificationReason: null,
        updatedAt: new Date().toISOString(),
      },
      noteForUser:
        "I have all your details, but I could not save the registration on the server. The admin team has been alerted and will follow up shortly. Please do not start over — your information is preserved.",
      extracted,
    };
  }

  await markDraftStatus(scope, "submitted", { completedLeadId: submitted.leadId });

  void createNotification({
    audience: "admin",
    kind: "system",
    title: `New registration via agent: ${merged.businessName}`,
    body: `${merged.contactFirstName ?? ""} ${merged.contactSurname ?? ""} (${merged.contactEmail ?? "no email"}) registered ${merged.businessName} through conversational onboarding. Monthly electricity spend ~R${(merged.monthlyElectricitySpendEstimateZar ?? 0).toLocaleString("en-ZA")}.`,
    link: `/admin/leads/${submitted.leadId}`,
    metadata: {
      workspaceId: input.workspaceId,
      leadId: submitted.leadId,
      clientProfileId: submitted.clientProfileId,
    },
  });

  return {
    draft: {
      draftKey: buildDraftKey(scope.workspaceId, scope.caseId),
      workspaceId: input.workspaceId,
      caseId: input.caseId ?? null,
      fields: merged,
      status: "submitted",
      completedLeadId: submitted.leadId,
      disqualificationReason: null,
      updatedAt: new Date().toISOString(),
    },
    noteForUser: `You're registered. Your case reference is ${submitted.leadId}. Your Expression of Interest is ready in Documents. Sign it there, or use this signing link: ${buildClientEoiSigningPath(submitted.eoiSigningToken)}. Once it's signed, come back here so we can continue into qualification.`,
    submittedLeadId: submitted.leadId,
    submittedEoiSigningToken: submitted.eoiSigningToken,
    extracted,
  };
}

function businessNameFromDraft(draft: RegistrationDraft | null) {
  const name = draft?.fields.businessName?.trim();
  return name && name.length > 0 ? name : "your business";
}

function looksLikeRequirementsQuestion(message?: string | null) {
  if (!message) {
    return false;
  }

  return /\b(what do you need|what do i need|what is needed|what's needed|what information|what details|what else|what still|what more|required|requirements?)\b/i.test(
    message,
  );
}

function formatMissingFieldSummary(fields: RegistrationFields) {
  const pendingPrequal = missingPrequalificationFields(fields);
  const pendingFields = pendingPrequal.length > 0 ? pendingPrequal : missingFields(fields);
  return pendingFields.map((field) => `- ${FIELD_PROMPTS[field]}`).join("\n");
}

export function buildRegistrationReply(input: {
  draft: RegistrationDraft | null;
  extracted: RegistrationFields;
  prequal: Prequalification;
  submittedLeadId?: string;
  fallbackNote?: string | null;
  latestUser?: string | null;
}): string {
  const { draft, extracted, fallbackNote, latestUser, submittedLeadId } = input;

  if (!draft) {
    return "I couldn't access your registration state right now. Please send that again and I'll continue.";
  }

  if (draft.status === "disqualified") {
    const base = fallbackNote?.trim() || input.prequal.softDisqualifyMessage;
    const reason = draft.disqualificationReason?.trim();
    if (reason && !base.includes(reason)) {
      return `${base}\n\nReason: ${reason}`;
    }
    return base;
  }

  if (draft.status === "submitted") {
    const leadId = submittedLeadId ?? draft.completedLeadId;
    return (
      fallbackNote?.trim() ||
      `You're registered. Your case reference is ${leadId ?? "pending"}. Your Expression of Interest is the next step before qualification can continue.`
    );
  }

  const pendingFields = missingFields(draft.fields);
  const pendingPrequalFields = missingPrequalificationFields(draft.fields);
  const nextField = nextRequiredField(draft.fields);
  if (!nextField) {
    return fallbackNote?.trim() || `I have all the information I need for ${businessNameFromDraft(draft)}. I'm saving it now.`;
  }

  const acknowledgedFields = Object.keys(extracted);
  if (looksLikeRequirementsQuestion(latestUser)) {
    return `I can handle the registration here for ${businessNameFromDraft(draft)}. To complete it, I still need:\n${formatMissingFieldSummary(
      draft.fields,
    )}\n\nLet's start with this: ${FIELD_QUESTIONS[nextField]}`;
  }

  if (acknowledgedFields.length === 0 && pendingFields.length === REQUIRED_FIELDS.length) {
    return [
      `I can handle the registration here for ${businessNameFromDraft(draft)} and save it directly into 1OS.`,
      "Before I collect the full registration details, I need to confirm four qualifying points:",
      "- whether the business is CIPC-registered",
      "- whether it is currently operational",
      "- whether it spends at least R10,000 per month on electricity",
      "- whether you have 6 months of utility bills or prepaid receipts",
      "",
      `First question: ${FIELD_QUESTIONS[nextField]}`,
    ].join("\n");
  }

  const preface =
    acknowledgedFields.length > 0
      ? pendingPrequalFields.length > 0
        ? `Noted for ${businessNameFromDraft(draft)}. I still need to finish the pre-qualification checks first.`
        : `Noted for ${businessNameFromDraft(draft)}.`
      : `To continue registering ${businessNameFromDraft(draft)}, I still need one detail.`;

  return `${preface}\n\n${FIELD_QUESTIONS[nextField]}`;
}

async function submitConversationalRegistration(
  _workspaceId: string,
  fields: RegistrationFields,
  sessionEmail: string | null = null,
): Promise<{ leadId: string; clientProfileId: string; eoiSigningToken: string | null } | null> {
  try {
    const {
      buildAdminLeadFromClientRegistration,
      defaultOwnerIdForRegistration,
      findSignupShellLeadByEmail,
      promoteSignupLeadToClientRegistration,
    } = await import("@/lib/client-registration");
    const { readAdminStateSnapshot, writeAdminStateSnapshot } = await import("@/lib/admin-state-store");

    const registrationInput = {
      businessName: fields.businessName ?? "",
      businessRegistrationNumber: fields.businessRegistrationNumber ?? "",
      industry: fields.industry ?? "",
      contactFirstName: fields.contactFirstName ?? "",
      contactSurname: fields.contactSurname ?? "",
      contactPosition: fields.contactPosition ?? "",
      contactEmail: fields.contactEmail ?? "",
      contactNumber: fields.contactNumber ?? "",
      monthlyElectricitySpendEstimateZar: fields.monthlyElectricitySpendEstimateZar ?? 0,
      isBusinessRegistered: fields.isBusinessRegistered === true,
      isBusinessOperational: fields.isBusinessOperational === true,
      hasSixMonthUtilityBill: fields.hasSixMonthUtilityBill === true,
      physicalAddress: fields.physicalAddress ?? "",
      city: fields.city ?? "",
      province: fields.province ?? "",
      source: "Migrate Portal",
      origin: "website",
      ownerId: defaultOwnerIdForRegistration(null),
      registrationSource: null,
    } as const;

    const { snapshot } = await readAdminStateSnapshot();
    const existingSignupShell =
      findSignupShellLeadByEmail(snapshot.leads, fields.contactEmail ?? "")
      ?? (sessionEmail ? findSignupShellLeadByEmail(snapshot.leads, sessionEmail) : null);

    const created = existingSignupShell
      ? promoteSignupLeadToClientRegistration(existingSignupShell, registrationInput)
      : buildAdminLeadFromClientRegistration(registrationInput);

    if (!created) {
      console.error("[registration-agent] buildAdminLeadFromClientRegistration returned null", { fields });
      return null;
    }

    await writeAdminStateSnapshot(
      {
        ...snapshot,
        leads: existingSignupShell
          ? [created.lead, ...snapshot.leads.filter((lead) => lead.id !== existingSignupShell.id)]
          : [created.lead, ...snapshot.leads],
        activeLeadId: created.leadId,
      },
      "agent-conversational-registration",
    );

    return {
      leadId: created.leadId,
      clientProfileId: created.clientProfileId,
      eoiSigningToken: created.lead.eoiSigningToken,
    };
  } catch (err) {
    console.error("[registration-agent] submit failed", err);
    return null;
  }
}
