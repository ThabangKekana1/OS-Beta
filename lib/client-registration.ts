import { ADMIN_AGENTS } from "@/lib/admin-mock-data";
import { DEAL_VALUE_ZAR } from "@/lib/admin-kpis";
import {
  isValidSouthAfricanCompanyRegistration,
} from "@/lib/company-registration";
import { makeId, timelineLabel } from "@/lib/formatting";
import type {
  AdminLead,
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
  ownerId: string;
  registrationSource: AdminLeadRegistrationSource | null;
};

export type ClientRegistrationResult = {
  lead: AdminLead;
  leadId: string;
  clientProfileId: string;
};

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
  const registrationDetail = input.registrationSource
    ? `Registered through ${input.registrationSource.profileName}'s unique ${input.registrationSource.profileRole} link.`
    : "Business registered in dashboard onboarding profile.";

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
    isBusinessOperational: input.isBusinessOperational,
    hasSixMonthUtilityBill: input.hasSixMonthUtilityBill,
    physicalAddress,
    city,
    province,
    source: input.source,
    stage: "EOI Generated",
    contactStatus: "Not Contacted",
    priority: "Standard",
    ownerId,
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
