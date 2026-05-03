import { extractDeterministicRegistrationFields, detectAskedField } from "../lib/registration-agent";

type Case = { ask: string; reply: string; expect: Record<string, unknown> };

const cases: Case[] = [
  // Industry — bare answers
  { ask: "What industry sector does the business operate in?", reply: "Technology!", expect: { industry: "Technology" } },
  { ask: "What industry sector does the business operate in?", reply: "Mining", expect: { industry: "Mining" } },
  { ask: "What industry sector does the business operate in?", reply: "fintech", expect: { industry: "fintech" } },
  // Industry — sentences
  { ask: "What industry sector does the business operate in?", reply: "we operate in the mining sector", expect: { industry: "mining" } },
  { ask: "What industry sector does the business operate in?", reply: "We are in fintech.", expect: { industry: "fintech" } },
  { ask: "What industry sector does the business operate in?", reply: "our industry is hospitality", expect: { industry: "hospitality" } },
  { ask: "What industry sector does the business operate in?", reply: "manufacturing industry", expect: { industry: "manufacturing" } },

  // Position
  { ask: "What is the contact's position or role at the business?", reply: "CFO", expect: { contactPosition: "CFO" } },
  { ask: "What is the contact's position or role at the business?", reply: "I'm the Head of Operations", expect: { contactPosition: "Head of Operations" } },
  { ask: "What is the contact's position or role at the business?", reply: "i am the managing director", expect: { contactPosition: "managing director" } },

  // Names
  { ask: "What is the first name of the primary contact?", reply: "Karman", expect: { contactFirstName: "Karman" } },
  { ask: "What is the surname of the primary contact?", reply: "my surname is Kekana", expect: { contactSurname: "Kekana" } },

  // Business name
  { ask: "What is the registered business name?", reply: "Metasapien", expect: { businessName: "Metasapien" } },
  { ask: "What is the registered business name?", reply: "the company is Foundation-1 (Pty) Ltd", expect: { businessName: "Foundation-1 (Pty) Ltd" } },

  // CIPC
  { ask: "What is the CIPC business registration number?", reply: "2018/123456/07", expect: { businessRegistrationNumber: "2018/123456/07", isBusinessRegistered: true } },
  { ask: "What is the CIPC business registration number?", reply: "our reg number is 2024/567890/12", expect: { businessRegistrationNumber: "2024/567890/12", isBusinessRegistered: true } },

  // Email
  { ask: "What is the contact's email address?", reply: "karman@foundation-1.co.za", expect: { contactEmail: "karman@foundation-1.co.za" } },
  { ask: "What is the contact's email address?", reply: "you can reach me at karman@foundation-1.co.za", expect: { contactEmail: "karman@foundation-1.co.za" } },

  // Phone
  { ask: "What is the contact's phone number?", reply: "0821234567", expect: { contactNumber: "0821234567" } },
  { ask: "What is the contact's phone number?", reply: "+27 82 123 4567", expect: { contactNumber: "+27821234567" } },

  // Address
  { ask: "What is the full physical street address of the business?", reply: "618 thrush street, East bank", expect: { physicalAddress: "618 thrush street, East bank" } },
  { ask: "What is the full physical street address of the business?", reply: "12 Long Street", expect: { physicalAddress: "12 Long Street" } },
  { ask: "What is the full physical street address of the business?", reply: "my address is 5 Park Lane, Sandton", expect: { physicalAddress: "5 Park Lane, Sandton" } },

  // City
  { ask: "What city is the business located in?", reply: "Cape Town", expect: { city: "Cape Town" } },
  { ask: "What city is the business located in?", reply: "we are based in Johannesburg", expect: { city: "Johannesburg" } },

  // Province
  { ask: "Which South African province is the business located in?", reply: "Gauteng", expect: { province: "Gauteng" } },
  { ask: "Which South African province is the business located in?", reply: "we operate in the Western Cape", expect: { province: "Western Cape" } },
  { ask: "Which South African province is the business located in?", reply: "kwazulu-natal", expect: { province: "KwaZulu-Natal" } },

  // Yes/no booleans
  { ask: "Is the business officially registered with CIPC?", reply: "yes", expect: { isBusinessRegistered: true } },
  { ask: "Is the business officially registered with CIPC?", reply: "no", expect: { isBusinessRegistered: false } },
  { ask: "Is the business currently operational?", reply: "yes we are", expect: { isBusinessOperational: true } },
  { ask: "Is the business currently operational?", reply: "not yet", expect: { isBusinessOperational: false } },
  { ask: "Do you have access to at least 6 months of utility bills or prepaid electricity receipts?", reply: "yep", expect: { hasSixMonthUtilityBill: true } },

  // Edge: negative replies with extra text
  { ask: "Is the business officially registered with CIPC?", reply: "no, not yet", expect: { isBusinessRegistered: false } },
  { ask: "Is the business currently operational?", reply: "Yes, definitely", expect: { isBusinessOperational: true } },

  // Edge: punctuation and capitalization
  { ask: "What industry sector does the business operate in?", reply: "TECHNOLOGY.", expect: { industry: "TECHNOLOGY" } },
  { ask: "What is the registered business name?", reply: "Metasapien.", expect: { businessName: "Metasapien" } },

  // Edge: position with company suffix
  { ask: "What is the contact's position or role at the business?", reply: "I am the CEO of the company", expect: { contactPosition: "CEO" } },

  // Edge: spend (not exhaustively tested here — handled by parseRandAmount tests)
];

let passed = 0;
let failed = 0;
const failures: Array<{ ask: string; reply: string; askedField: string | null; got: Record<string, unknown>; mismatches: string[] }> = [];

for (const c of cases) {
  const got = extractDeterministicRegistrationFields(c.reply, c.ask) as Record<string, unknown>;
  const mismatches: string[] = [];
  for (const [key, expectedValue] of Object.entries(c.expect)) {
    const actual = got[key];
    if (actual !== expectedValue) {
      mismatches.push(`${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actual)}`);
    }
  }
  if (mismatches.length === 0) {
    passed++;
  } else {
    failed++;
    failures.push({ ask: c.ask, reply: c.reply, askedField: detectAskedField(c.ask), got, mismatches });
  }
}

console.log(`\n${passed} passed, ${failed} failed of ${cases.length}\n`);
for (const f of failures) {
  console.log(`FAIL — asked: "${f.ask}"`);
  console.log(`  reply: "${f.reply}"`);
  console.log(`  detectedField: ${f.askedField}`);
  console.log(`  got: ${JSON.stringify(f.got)}`);
  for (const m of f.mismatches) console.log(`  ${m}`);
  console.log();
}
process.exit(failed > 0 ? 1 : 0);
