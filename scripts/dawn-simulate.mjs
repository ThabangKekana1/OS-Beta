/**
 * DAWN simulation harness — dozens of naive-client conversations against the
 * REAL production prompt/context/style path, judged hard, so the founder gets
 * evidence and Dawn gets better before a real client ever types a word.
 *
 * Run from 1OS root:
 *   node --experimental-transform-types --import /tmp/f1_register_1os.mjs scripts/dawn-simulate.mjs <round-dir>
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { DAWN_SYSTEM_PROMPT } from "@/lib/dawn/prompt.ts";
import { buildCaseContext } from "@/lib/dawn/context.ts";
import { enforceStyle } from "@/lib/dawn/style.ts";

const OUT_DIR = process.argv[2] || "/Users/straylight/Desktop/1-MI/_work/dawn_sim/round1";
mkdirSync(OUT_DIR, { recursive: true });

// ---- env ----
const env = {};
for (const line of readFileSync("/Users/straylight/Desktop/1-MI/1OS/.env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const BASE = env.MODEL_BASE_URL;
const KEY = env.MODEL_API_KEY;
const MODEL = env.MODEL_DEFAULT;

async function glm(messages, { maxTokens = 700, temperature = 0.4, json = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature,
          max_tokens: maxTokens,
          thinking: { type: "disabled" },
          ...(json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!response.ok) throw new Error(`${response.status}`);
      const body = await response.json();
      const text = body.choices?.[0]?.message?.content;
      if (typeof text === "string" && text.trim()) return text;
      throw new Error("empty");
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

// ---- case states ----
const CASES = {
  needs_nda: { id: "sim1", public_reference: "F1-MC-SIM1", stage: "bill_pack_required", business_name: "Mooivallei Suiwel", contact_name: "Marie van Wyk", site_city: "Bethlehem", province: "Free State", monthly_spend_ex_vat: 48200, profile_completed_at: "2026-08-20", nda_signed_at: null },
  needs_bills: { id: "sim2", public_reference: "F1-MC-SIM2", stage: "bill_pack_required", business_name: "Karoo Broilers", contact_name: "Sipho Dlamini", site_city: "Graaff-Reinet", province: "Eastern Cape", monthly_spend_ex_vat: 86000, profile_completed_at: "2026-08-19", nda_signed_at: "2026-08-19" },
  report_ready: { id: "sim3", public_reference: "F1-MC-SIM3", stage: "proposal_ready", business_name: "Highveld Eggs", contact_name: "Anél Botha", site_city: "Standerton", province: "Mpumalanga", monthly_spend_ex_vat: 132000, profile_completed_at: "2026-08-10", nda_signed_at: "2026-08-10", proposal_ready_at: "2026-08-21" },
  waiting_funder: { id: "sim4", public_reference: "F1-MC-SIM4", stage: "submitted_to_funder", business_name: "Vrystaat Meule", contact_name: "Kobus Steyn", site_city: "Kroonstad", province: "Free State", monthly_spend_ex_vat: 214000, profile_completed_at: "2026-08-01", nda_signed_at: "2026-08-01", proposal_ready_at: "2026-08-05", eoi_signed_at: "2026-08-06" },
  term_sheet: { id: "sim5", public_reference: "F1-MC-SIM5", stage: "term_sheet_issued", business_name: "Cape Cold Stores", contact_name: "Fatima Adams", site_city: "Paarl", province: "Western Cape", monthly_spend_ex_vat: 305000, profileCompleted: true, profile_completed_at: "2026-07-20", nda_signed_at: "2026-07-20", eoi_signed_at: "2026-07-25", term_sheet_issued_at: "2026-08-18" },
};

// ---- personas ----
const PERSONAS = [
  ["tannie_marie", "needs_nda", "You are Marie, a 61-year-old dairy farm bookkeeper. You are NOT technical at all. You are scared of signing anything legal. You ask what an NDA is, whether a lawyer is needed, what it costs. Simple, worried, polite Afrikaans-flavoured English."],
  ["suspicious_sam", "needs_bills", "You are Sam, a shop owner who has been burned before. You think everything free is a scam. You ask where the catch is, who profits, why it costs nothing. Blunt, short messages, street-smart."],
  ["hurried_hendrik", "report_ready", "You are Hendrik, a poultry farm manager with no time. You want exact numbers NOW: how much will I save, when, guaranteed. Impatient, pushy, types fast with typos."],
  ["angry_agnes", "needs_bills", "You are Agnes. The municipality has been estimating your bills wrong for a year and you are furious about electricity in general. You rant first, ask questions second."],
  ["cfo_charles", "report_ready", "You are Charles, a sharp CFO. You ask about escalation assumptions, tariff structures, effective rate per kWh, balance sheet treatment, and exit clauses. Precise, professional, expects technical depth."],
  ["confused_constance", "needs_nda", "You are Constance, 68, not comfortable with computers or finance. You repeat questions because answers confuse you. You often say you do not understand. Very simple English."],
  ["afrikaans_andre", "needs_bills", "You are André. You mix Afrikaans and English (ja, nee, eish, hoeveel kos dit). You farm sheep and chickens. Friendly but wary of city slicks."],
  ["distressed_david", "needs_bills", "You are David. Your business is in trouble, you might close in six months, and you are desperate for anything that cuts costs. You mention the possible closure. Emotional, tired."],
  ["nosy_nadia", "report_ready", "You are Nadia. You keep asking WHO funds this: which bank, which company, names. You push hard for partner names and get annoyed when not told."],
  ["shortcut_solly", "needs_nda", "You are Solly. You want to skip everything: just send me the contract, I sign today, why all these steps. Impatient dealmaker."],
  ["private_priya", "needs_bills", "You are Priya. You worry about POPIA, data privacy, who sees your bills, whether your information gets sold. Careful, methodical."],
  ["wavering_willem", "term_sheet", "You are Willem. You have the term sheet but cold feet. You ask whether you should rather wait a year, whether now is the right time, whether Dawn thinks you should do it."],
  ["chatty_chris", "waiting_funder", "You are Chris. You start with small talk (rugby, weather), then ask what is happening with your case, then drift off topic again."],
  ["technical_thandi", "report_ready", "You are Thandi, an engineer. You ask how solar works with load shedding, batteries, generation licences, grid feedback. Technically curious."],
  ["comparing_carel", "report_ready", "You are Carel. A competitor called GreenVolt offered you a PPA at R1.85 per kWh. You keep comparing and asking why you should not take their deal instead."],
];

const PARTNER_PATTERN = /\b(nedbank|eqstra|green\s?share|ufms)\b/i;
const DISCOURAGE_PATTERN = /\b(should not proceed|shouldn't proceed|walk away|do not sign|don't sign|rather wait|hold off|not the right time|reconsider whether)\b/i;

function deterministicChecks(rawReply, styledReply) {
  const issues = [];
  if (/\u2014/.test(rawReply)) issues.push("em_dash_in_raw_model_output");
  if (PARTNER_PATTERN.test(rawReply)) issues.push("partner_name_in_raw_model_output");
  if (PARTNER_PATTERN.test(styledReply)) issues.push("partner_name_survived_style_guard");
  if (/https?:\/\//.test(styledReply)) issues.push("external_url");
  if (styledReply.length > 1500) issues.push("wall_of_text");
  if (DISCOURAGE_PATTERN.test(styledReply)) issues.push("discouraged_the_deal");
  const links = styledReply.match(/\(dawn:[^)]*\)/g) || [];
  for (const link of links) {
    if (!/\(dawn:view\/(home|task|journey|documents|notifications|support)\)/.test(link)) {
      issues.push("invalid_link");
    }
  }
  return issues;
}

async function simulateConversation([name, caseKey, persona]) {
  const caseRow = CASES[caseKey];
  const { context } = buildCaseContext({ caseRow, movements: [], currentView: "dawn" });
  const systemPrompt = `${DAWN_SYSTEM_PROMPT}\n\n${context}`;
  const transcript = [];
  const issues = [];
  let clientMessage = await glm(
    [
      { role: "system", content: `${persona} You are contacting your migration assistant Dawn for the first time today. Write ONE opening message (1-3 sentences), in character. Never break character.` },
    ],
    { maxTokens: 160, temperature: 0.9 },
  );
  for (let turn = 0; turn < 5; turn += 1) {
    transcript.push({ role: "client", content: clientMessage });
    const dawnMessages = [
      { role: "system", content: systemPrompt },
      ...transcript.map((m) => ({ role: m.role === "client" ? "user" : "assistant", content: m.content })),
    ];
    const raw = await glm(dawnMessages, { maxTokens: 700, temperature: 0.4 });
    const styled = enforceStyle(raw);
    const turnIssues = deterministicChecks(raw, styled);
    if (turnIssues.length > 0) issues.push({ turn, issues: turnIssues, reply: styled.slice(0, 200) });
    transcript.push({ role: "dawn", content: styled });
    if (turn === 4) break;
    clientMessage = await glm(
      [
        { role: "system", content: `${persona} You are mid-conversation with Dawn, your migration assistant. React to Dawn's last message in ONE short message (1-3 sentences), in character. If your concern was genuinely addressed, you may move to a new related worry or say thanks and ask what happens next. Never break character.` },
        ...transcript.slice(-6).map((m) => ({ role: m.role === "client" ? "assistant" : "user", content: m.content })),
      ],
      { maxTokens: 160, temperature: 0.9 },
    );
  }

  const judgeRaw = await glm(
    [
      {
        role: "system",
        content: [
          "You judge a conversation between Dawn (a migration assistant for a South African",
          "energy migration company) and a simulated client. Dawn's goals: clear confusion,",
          "always name the next step, move the client toward migrating, warm simple language",
          "matched to the client's capability, never invent numbers, never name funding",
          "partners, never discourage the deal, escalate serious doubts internally instead.",
          "Score as strict JSON:",
          '{"forward_motion":0-5,"clarity_for_this_client":0-5,"tone":0-5,',
          '"factual_discipline":0-5,"decision_drive":0-5,',
          '"failures":[{"turn":number,"what":string}],"best_moment":string,"summary":string}',
          "failures lists concrete shortfalls (invented numbers, jargon left unexplained,",
          "missed emotional cue, question answered but next step missing, repeated info,",
          "condescension to a capable client, overwhelm of a simple one).",
        ].join(" "),
      },
      {
        role: "user",
        content: transcript.map((m, i) => `[${i}] ${m.role.toUpperCase()}: ${m.content}`).join("\n\n"),
      },
    ],
    { maxTokens: 700, temperature: 0.1, json: true },
  );
  let judge = null;
  try {
    judge = JSON.parse(judgeRaw.slice(judgeRaw.indexOf("{"), judgeRaw.lastIndexOf("}") + 1));
  } catch {
    judge = { parse_error: judgeRaw.slice(0, 200) };
  }
  const result = { persona: name, caseKey, transcript, deterministicIssues: issues, judge };
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(result, null, 2));
  return result;
}

// ---- run with limited concurrency ----
const queue = [...PERSONAS];
const results = [];
async function worker() {
  while (queue.length > 0) {
    const item = queue.shift();
    try {
      const result = await simulateConversation(item);
      results.push(result);
      console.log(`done ${item[0]} (${results.length}/${PERSONAS.length})`);
    } catch (error) {
      console.log(`FAILED ${item[0]}: ${error.message}`);
      results.push({ persona: item[0], error: error.message });
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);

const summary = {
  ranAt: new Date().toISOString(),
  model: MODEL,
  conversations: results.length,
  deterministicIssueCount: results.reduce((n, r) => n + (r.deterministicIssues?.length ?? 0), 0),
  scores: results
    .filter((r) => r.judge && !r.judge.parse_error)
    .map((r) => ({
      persona: r.persona,
      forward: r.judge.forward_motion,
      clarity: r.judge.clarity_for_this_client,
      tone: r.judge.tone,
      facts: r.judge.factual_discipline,
      drive: r.judge.decision_drive,
      failures: (r.judge.failures ?? []).length,
    })),
  allFailures: results.flatMap((r) =>
    (r.judge?.failures ?? []).map((f) => ({ persona: r.persona, ...f })),
  ),
  allDeterministic: results.flatMap((r) =>
    (r.deterministicIssues ?? []).map((d) => ({ persona: r.persona, ...d })),
  ),
};
writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
console.log("SUMMARY", JSON.stringify(summary.scores, null, 1).slice(0, 2000));
console.log("DETERMINISTIC ISSUES", summary.deterministicIssueCount);
