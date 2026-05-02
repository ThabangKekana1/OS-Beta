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
    "What is the average monthly electricity spend in Rand? We need at least R10,000 per month to proceed.",
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
    "REGISTRATION MODE — you are conversationally collecting business registration details.",
    `Status: ${draft?.status ?? "not started"}`,
    collected.length > 0
      ? `Already collected:\n- ${collected.join("\n- ")}`
      : "Nothing collected yet.",
    missingPrequalificationFields(fields).length > 0
      ? `Pre-qualification still needed first (ask for ONE at a time, naturally — do NOT list these to the user):\n- ${missingPrequalificationFields(fields).map((k) => FIELD_PROMPTS[k]).join("\n- ")}`
      : missing.length > 0
        ? `Eligibility is confirmed. Still needed for full registration (ask for ONE at a time, naturally — do NOT list these to the user):\n- ${missing.map((k) => FIELD_PROMPTS[k]).join("\n- ")}`
        : "All required fields are collected. Summarise the captured details and ask the user to confirm or correct them. Do not submit until they clearly confirm.",
    "Rules:",
    "- Always complete the pre-qualification questions before moving on to the rest of the registration details.",
    "- Ask for ONE missing field per message, in a natural, friendly way.",
    "- Acknowledge what they just told you before asking the next question.",
    "- If they provide multiple things in one message, that's fine — extraction handles it.",
    "- Never invent or assume values.",
    "- If the user's last reply was vague, off-topic, or did not contain the exact value for the field you just asked about, ask again EXPLICITLY for that exact value, with an example of the format you need (e.g. \"I need a clear yes or no\", \"I need the CIPC number in format YYYY/NNNNNN/NN like 2018/123456/07\", \"I need a Rand figure like R12,500 per month\", \"I need a valid email like name@business.co.za\"). Do not move on until they answer that specific field with a concrete value.",
    "- If they ask what you need, summarise the missing items in plain language.",
    "- Once all fields are collected, pause for an explicit confirmation before submission.",
    "- After submission, the EOI is generated automatically. Direct the client to sign it in the Documents tab and tell them the next step after signing is uploading 6 months of utility bills so Nedbank can prepare their Generocity proposal.",
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
- Numbers are plain numbers, not strings (e.g. "R12,500/month" -> 12500; "about R28,500" -> 28500).
- Use ONLY the user's statements as facts. You may use assistant questions only to resolve short replies like "yes", "no", "I do", or "same address".
- Booleans ONLY when the user explicitly states the fact about their business. Phrases like "I want to register" or "I'd like to sign up" or "register me" are NOT statements about CIPC registration status — omit isBusinessRegistered in that case.
- isBusinessRegistered=true ONLY if the user explicitly says the business is registered, or supplies a CIPC number, or affirms "yes" to a direct registration question.
- isBusinessRegistered=false ONLY if the user explicitly says the business is NOT registered.
- Same strictness for isBusinessOperational and hasSixMonthUtilityBill — only set them when the user makes a direct statement about the business.
- "physicalAddress" is the street line only (e.g. "12 Long Street"); "city" and "province" are separate. South African provinces: Gauteng, Western Cape, KwaZulu-Natal, Eastern Cape, Free State, Limpopo, Mpumalanga, North West, Northern Cape.
- "hasSixMonthUtilityBill" is true if they have 6 OR MORE months of utility bills OR prepaid electricity receipts.
- Output ONLY the raw JSON object. No markdown fences, no preamble. If nothing can be extracted, return {}.`;

function parseCurrencyNumber(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Math.max(0, Number.parseInt(digits, 10)) : null;
}

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

function extractDeterministicRegistrationFields(text: string): RegistrationFields {
  const extracted: RegistrationFields = {};

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
  const spendNaturalMatch =
    text.match(/\b(?:spend|spending|pay|paying)\b[^.\n]*?\bR\s?[\d,.]+/i)?.[0]
    ?? text.match(/\bR\s?[\d,.]+\s*(?:per month|monthly)[^.\n]*/i)?.[0]
    ?? null;
  const parsedSpendSource = spendRaw ?? spendNaturalMatch;
  if (parsedSpendSource) {
    const parsedSpend = parseCurrencyNumber(parsedSpendSource);
    if (parsedSpend !== null) extracted.monthlyElectricitySpendEstimateZar = parsedSpend;
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
  const deterministic = extractDeterministicRegistrationFields(input.latestUser);
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
  if (typeof raw.monthlyElectricitySpendEstimateZar === "number" && Number.isFinite(raw.monthlyElectricitySpendEstimateZar))
    out.monthlyElectricitySpendEstimateZar = Math.max(0, Math.round(raw.monthlyElectricitySpendEstimateZar));
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
  if (existing && (existing.status === "submitted" || existing.status === "disqualified")) {
    let noteForUser: string | null = null;
    let submittedEoiSigningToken: string | null = null;

    if (existing.status === "submitted" && existing.completedLeadId) {
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

  const currentFields = existing?.fields ?? {};
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
      noteForUser: input.prequal.softDisqualifyMessage,
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
  const submitted = await submitConversationalRegistration(input.workspaceId, merged);
  if (!submitted) {
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
        "I have all your details, but the registration could not be saved on the server. A specialist will contact you shortly.",
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
    return fallbackNote?.trim() || input.prequal.softDisqualifyMessage;
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
    const existingSignupShell = findSignupShellLeadByEmail(
      snapshot.leads,
      fields.contactEmail ?? "",
    );

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
