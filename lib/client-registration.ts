import { ADMIN_AGENTS } from "@/lib/admin-mock-data";
import { DEAL_VALUE_ZAR } from "@/lib/admin-kpis";
import {
  isValidSouthAfricanCompanyRegistration,
} from "@/lib/company-registration";
import { makeId, timelineLabel } from "@/lib/formatting";
import type {
  AdminLead,
  AdminLeadOrigin,
  AdminLeadPartner,
  AdminLeadRegistrationSource,
} from "@/lib/admin-types";

export type ClientRegistrationInput = {
  businessName: string;
  businessRegistrationNumber: string;
  industry: string;
  contactFirstName: string;
  contactSurname: string;
  contactPosition: string;
  contactEmail: string;
  contactNumber: string;
  monthlyElectricitySpendEstimateZar: number;
  isBusinessRegistered: boolean;
  isBusinessOperational: boolean;
  hasSixMonthUtilityBill: boolean;
  physicalAddress: string;
  city: string;
  province: string;
  source: AdminLead["source"];
  origin?: AdminLeadOrigin;
  partner?: AdminLeadPartner | null;
  partnerOrgId?: string | null;
  ownerId: string;
  registrationSource: AdminLeadRegistrationSource | null;
};

export type ClientRegistrationResult = {
  lead: AdminLead;
  leadId: string;
  clientProfileId: string;
};

export type ClientSignupShellInput = {
  name: string;
  email: string;
  ownerId: string;
};

const SIGNUP_PENDING_BUSINESS_NAME = "Business details pending";
const SIGNUP_COMPLETE_REGISTRATION_TASK = "Complete business registration";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function fallbackNameFromEmail(email: string) {
  return normalizeEmail(email).split("@")[0] ?? "Client";
}

function buildAccountIdFromBusinessName(businessName: string) {
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);

  return `acct-${slug || "client"}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildEoiSigningToken(companyName: string) {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  return `eoi-${slug || "client"}-${Math.random().toString(36).slice(2, 8)}`;
}

function setTaskStatus(
  lead: AdminLead,
  title: string,
  done: boolean,
): AdminLead["tasks"] {
  return lead.tasks.map((task) =>
    task.title === title
      ? {
          ...task,
          status: done ? ("done" as const) : ("open" as const),
        }
      : task,
  );
}

function mergeLeadTasks(
  primary: AdminLead["tasks"],
  secondary: AdminLead["tasks"],
): AdminLead["tasks"] {
  const seenTitles = new Set(primary.map((task) => task.title));
  const carryForward = secondary.filter(
    (task) =>
      task.title !== SIGNUP_COMPLETE_REGISTRATION_TASK &&
      !seenTitles.has(task.title),
  );

  return [...primary, ...carryForward];
}

function buildRegistrationEventDetail(
  registrationSource: AdminLeadRegistrationSource | null,
) {
  if (!registrationSource) {
    return "Business registered in dashboard onboarding profile.";
  }

  if (registrationSource.channel === "dashboard") {
    return `Registered by ${registrationSource.profileName} in the ${registrationSource.profileRole} dashboard.`;
  }

  return `Registered through ${registrationSource.profileName}'s unique ${registrationSource.profileRole} link.`;
}

export function splitContactName(contactName: string) {
  const parts = contactName.trim().split(/\s+/).filter(Boolean);

  return {
    contactFirstName: parts[0] ?? contactName.trim(),
    contactSurname: parts.slice(1).join(" "),
  };
}

export function defaultOwnerIdForRegistration(source: AdminLeadRegistrationSource | null) {
  if (source?.profileAgentId) {
    return source.profileAgentId;
  }

  return ADMIN_AGENTS[0]?.id ?? "";
}

export function buildAdminLeadFromClientRegistration(
  input: ClientRegistrationInput,
): ClientRegistrationResult | null {
  const businessName = input.businessName.trim();
  const businessRegistrationNumber = input.businessRegistrationNumber.trim();
  const industry = input.industry.trim();
  const contactFirstName = input.contactFirstName.trim();
  const contactSurname = input.contactSurname.trim();
  const contactPosition = input.contactPosition.trim();
  const contactEmail = input.contactEmail.trim().toLowerCase();
  const contactNumber = input.contactNumber.trim();
  const physicalAddress = input.physicalAddress.trim();
  const city = input.city.trim();
  const province = input.province.trim();
  const ownerId = input.ownerId.trim();
  const contactName = [contactFirstName, contactSurname].filter(Boolean).join(" ");
  const monthlyElectricitySpendEstimateZar = Number.isFinite(
    input.monthlyElectricitySpendEstimateZar,
  )
    ? Math.max(0, Math.round(input.monthlyElectricitySpendEstimateZar))
    : 0;
  const migrateAccountName = businessName;
  const migrateAccountId = buildAccountIdFromBusinessName(businessName);

  if (
    !businessName ||
    !isValidSouthAfricanCompanyRegistration(businessRegistrationNumber) ||
    !industry ||
    !contactFirstName ||
    !contactSurname ||
    !contactPosition ||
    !contactEmail ||
    !contactNumber ||
    !physicalAddress ||
    !city ||
    !province ||
    !ownerId ||
    monthlyElectricitySpendEstimateZar <= 0
  ) {
    return null;
  }

  const newLeadId = makeId("lead");
  const clientProfileId = makeId("profile");
  const eoiSigningToken = buildEoiSigningToken(businessName);
  const registrationDetail = buildRegistrationEventDetail(input.registrationSource);

  const nextLead: AdminLead = {
    id: newLeadId,
    clientProfileId,
    company: businessName,
    businessRegistrationNumber,
    industry,
    contactFirstName,
    contactSurname,
    contactPosition,
    contactName,
    monthlyElectricitySpendEstimateZar,
    isBusinessRegistered: input.isBusinessRegistered,
    isClientRegistered: true,
    isBusinessOperational: input.isBusinessOperational,
    hasSixMonthUtilityBill: input.hasSixMonthUtilityBill,
    physicalAddress,
    city,
    province,
    source: input.source,
    origin: input.origin ?? "created",
    partner: input.partner ?? null,
    partnerOrgId: input.partnerOrgId ?? null,
    stage: "EOI Generated",
    contactStatus: "Not Contacted",
    priority: "Standard",
    ownerId,
    linkedSalesLeadId: null,
    registrationSource: input.registrationSource,
    readinessScore: input.hasSixMonthUtilityBill ? 45 : 40,
    estimatedValueZar: DEAL_VALUE_ZAR,
    lastTouched: "Just now",
    nextAction: "Submit signed EOI for this client to begin onboarding.",
    migrateAccountName,
    migrateAccountId,
    userProfile: {
      id: makeId("usr"),
      fullName: contactName,
      email: contactEmail,
      phone: contactNumber,
      role: contactPosition,
      joinedAt: new Date().toISOString().slice(0, 10),
    },
    eoiSigningToken,
    eoiSignatureId: null,
    eoiSignedBy: null,
    eoiSignedAt: null,
    eoiAcceptedTermsAt: null,
    onboardingCompletedAt: null,
    disqualification: null,
    tasks: [
      {
        id: makeId("task"),
        title: "Submit signed EOI",
        owner: "Client",
        dueLabel: "Today",
        status: "open",
      },
      {
        id: makeId("task"),
        title: "Upload 6-month utility bill pack",
        owner: "Agent",
        dueLabel: "Today",
        status: "open",
      },
      {
        id: makeId("task"),
        title: "Submit signed proposal",
        owner: "Agent",
        dueLabel: "Today",
        status: "open",
      },
      {
        id: makeId("task"),
        title: "Submit signed term sheet",
        owner: "Agent",
        dueLabel: "Today",
        status: "open",
      },
    ],
    documents: [],
    notes: [],
    events: [
      {
        id: makeId("event"),
        title: "Lead created",
        detail: registrationDetail,
        createdAt: timelineLabel(),
        tone: "system",
      },
    ],
  };

  if (input.hasSixMonthUtilityBill) {
    nextLead.tasks = setTaskStatus(nextLead, "Upload 6-month utility bill pack", true);
  }

  return {
    lead: nextLead,
    leadId: newLeadId,
    clientProfileId,
  };
}

export function buildAdminLeadShellFromSignup(
  input: ClientSignupShellInput,
): ClientRegistrationResult | null {
  const email = normalizeEmail(input.email);
  const ownerId = input.ownerId.trim();
  const contactName = input.name.trim() || fallbackNameFromEmail(email);

  if (!email || !ownerId || !contactName) {
    return null;
  }

  const { contactFirstName, contactSurname } = splitContactName(contactName);
  const leadId = makeId("lead");
  const clientProfileId = makeId("profile");
  const joinedAt = new Date().toISOString().slice(0, 10);

  const lead: AdminLead = {
    id: leadId,
    clientProfileId,
    company: SIGNUP_PENDING_BUSINESS_NAME,
    businessRegistrationNumber: "",
    industry: "",
    contactFirstName,
    contactSurname,
    contactPosition: "",
    contactName,
    monthlyElectricitySpendEstimateZar: 0,
    isBusinessRegistered: false,
    isClientRegistered: true,
    isBusinessOperational: false,
    hasSixMonthUtilityBill: false,
    physicalAddress: "",
    city: "",
    province: "",
    source: "Migrate Portal",
    origin: "website",
    partner: null,
    stage: "Client Registered",
    contactStatus: "Not Contacted",
    priority: "Standard",
    ownerId,
    linkedSalesLeadId: null,
    registrationSource: null,
    readinessScore: 15,
    estimatedValueZar: DEAL_VALUE_ZAR,
    lastTouched: "Just now",
    nextAction:
      "Client account created. Dawn must complete pre-qualification, then full business registration to generate the EOI.",
    migrateAccountName: SIGNUP_PENDING_BUSINESS_NAME,
    migrateAccountId: buildAccountIdFromBusinessName(`signup-${contactName}`),
    userProfile: {
      id: makeId("usr"),
      fullName: contactName,
      email,
      phone: "",
      role: "",
      joinedAt,
    },
    eoiSigningToken: null,
    eoiSignatureId: null,
    eoiSignedBy: null,
    eoiSignedAt: null,
    eoiAcceptedTermsAt: null,
    onboardingCompletedAt: null,
    disqualification: null,
    tasks: [
      {
        id: makeId("task"),
        title: SIGNUP_COMPLETE_REGISTRATION_TASK,
        owner: "Client",
        dueLabel: "Now",
        status: "open",
      },
    ],
    documents: [],
    notes: [],
    events: [
      {
        id: makeId("event"),
        title: "Client account created",
        detail:
          "Client signed up in 1OS. Name and email are visible in admin. Dawn must complete pre-qualification before full registration and EOI generation.",
        createdAt: timelineLabel(),
        tone: "system",
      },
    ],
  };

  return {
    lead,
    leadId,
    clientProfileId,
  };
}

export function isSignupShellLead(lead: AdminLead | null | undefined) {
  if (!lead) {
    return false;
  }

  return (
    lead.stage === "Client Registered" &&
    lead.source === "Migrate Portal" &&
    lead.origin === "website" &&
    lead.eoiSigningToken === null &&
    lead.company.trim() === SIGNUP_PENDING_BUSINESS_NAME &&
    lead.businessRegistrationNumber.trim().length === 0 &&
    lead.industry.trim().length === 0 &&
    lead.contactPosition?.trim().length === 0 &&
    lead.userProfile.phone.trim().length === 0 &&
    lead.physicalAddress.trim().length === 0 &&
    lead.city.trim().length === 0 &&
    lead.province.trim().length === 0
  );
}

export function findSignupShellLeadByEmail(
  leads: AdminLead[],
  email: string,
): AdminLead | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  return (
    leads.find(
      (lead) =>
        isSignupShellLead(lead) &&
        normalizeEmail(lead.userProfile.email) === normalizedEmail,
    ) ?? null
  );
}

export function promoteSignupLeadToClientRegistration(
  existingLead: AdminLead,
  input: ClientRegistrationInput,
): ClientRegistrationResult | null {
  const created = buildAdminLeadFromClientRegistration({
    ...input,
    ownerId: existingLead.ownerId || input.ownerId,
    origin: existingLead.origin,
    partner: existingLead.partner,
  });

  if (!created) {
    return null;
  }

  const upgradedLead: AdminLead = {
    ...created.lead,
    id: existingLead.id,
    clientProfileId: existingLead.clientProfileId,
    ownerId: existingLead.ownerId || created.lead.ownerId,
    linkedSalesLeadId: existingLead.linkedSalesLeadId,
    partnerOrgId: existingLead.partnerOrgId ?? created.lead.partnerOrgId ?? null,
    contactStatus: existingLead.contactStatus,
    priority: existingLead.priority,
    lastTouched: "Just now",
    userProfile: {
      ...created.lead.userProfile,
      id: existingLead.userProfile.id,
      joinedAt: existingLead.userProfile.joinedAt || created.lead.userProfile.joinedAt,
    },
    tasks: mergeLeadTasks(created.lead.tasks, existingLead.tasks),
    documents: existingLead.documents,
    notes: existingLead.notes,
    events: [
      {
        id: makeId("event"),
        title: "Client registration completed",
        detail: buildRegistrationEventDetail(input.registrationSource),
        createdAt: timelineLabel(),
        tone: "client",
      },
      ...existingLead.events,
    ],
  };

  return {
    lead: upgradedLead,
    leadId: upgradedLead.id,
    clientProfileId: upgradedLead.clientProfileId,
  };
}

export type SalesLeadStubInput = {
  contactName: string;
  company: string;
  email: string;
  ownerId: string;
  origin?: AdminLeadOrigin;
  registrationSource?: AdminLeadRegistrationSource | null;
};

export function buildAdminLeadStubFromSalesLead(
  input: SalesLeadStubInput,
): ClientRegistrationResult | null {
  const company = input.company.trim();
  const contactName = input.contactName.trim();
  const email = input.email.trim().toLowerCase();
  const ownerId = input.ownerId.trim();

  if (!company || !contactName || !email || !ownerId) {
    return null;
  }

  const { contactFirstName, contactSurname } = splitContactName(contactName);
  const newLeadId = makeId("lead");
  const clientProfileId = makeId("profile");
  const migrateAccountId = buildAccountIdFromBusinessName(company);

  const nextLead: AdminLead = {
    id: newLeadId,
    clientProfileId,
    company,
    businessRegistrationNumber: "",
    industry: "",
    contactFirstName,
    contactSurname,
    contactPosition: "",
    contactName,
    monthlyElectricitySpendEstimateZar: 0,
    isBusinessRegistered: false,
    isClientRegistered: false,
    isBusinessOperational: false,
    hasSixMonthUtilityBill: false,
    physicalAddress: "",
    city: "",
    province: "",
    source: "Outbound",
    origin: input.origin ?? "created",
    partner: null,
    stage: "Client Registered",
    contactStatus: "Not Contacted",
    priority: "Standard",
    ownerId,
    linkedSalesLeadId: null,
    registrationSource: input.registrationSource ?? null,
    readinessScore: 10,
    estimatedValueZar: DEAL_VALUE_ZAR,
    lastTouched: "Just now",
    nextAction: "Qualify lead and capture full registration details.",
    migrateAccountName: company,
    migrateAccountId,
    userProfile: {
      id: makeId("usr"),
      fullName: contactName,
      email,
      phone: "",
      role: "",
      joinedAt: new Date().toISOString().slice(0, 10),
    },
    eoiSigningToken: null,
    eoiSignatureId: null,
    eoiSignedBy: null,
    eoiSignedAt: null,
    eoiAcceptedTermsAt: null,
    onboardingCompletedAt: null,
    disqualification: null,
    tasks: [],
    documents: [],
    notes: [],
    events: [
      {
        id: makeId("event"),
        title: "Lead created",
        detail: "Lead added from sales/admin Leads board.",
        createdAt: timelineLabel(),
        tone: "system",
      },
    ],
  };

  return {
    lead: nextLead,
    leadId: newLeadId,
    clientProfileId,
  };
}
