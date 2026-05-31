import { NextRequest, NextResponse } from "next/server";
import {
  calculateMigrationAssessment,
  type MigrationAssessmentInput,
} from "@/lib/calculateMigrationAssessment";
import {
  buildAdminLeadFromMigrationIntake,
  defaultOwnerIdForRegistration,
  updateExistingLeadFromMigrationIntake,
} from "@/lib/client-registration";
import { makeId } from "@/lib/formatting";
import { cleanMigrationProfileId, isValidMigrationProfileId } from "@/lib/migration-profile-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { documentUploadLinkIdForLead } from "@/lib/registration-links";
import {
  findLeadByMigrationLinkFromDatabase,
  findLeadsByEmailFromDatabase,
  upsertSingleLeadToDatabase,
} from "@/lib/supabase-db-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications";
import type { AdminLead, AdminLeadRegistrationSource } from "@/lib/admin-types";

export const runtime = "nodejs";

const MIGRATION_INTAKE_SOURCE: AdminLeadRegistrationSource = {
  linkId: "migration-intake",
  profileName: "Migration Report",
  profileRole: "admin",
  profileAgentId: null,
  partnerOrgId: null,
  channel: "public_link",
};

function leadMigrationSource(lead: AdminLead, linkId: string): AdminLeadRegistrationSource {
  return {
    linkId,
    profileName: lead.company || lead.contactName || lead.userProfile.email || "Linked lead",
    profileRole: "sales",
    profileAgentId: lead.ownerId || null,
    partnerOrgId: lead.partnerOrgId ?? null,
    channel: "public_link",
  };
}

type IntakePayload = {
  input?: Partial<MigrationAssessmentInput>;
  profileId?: unknown;
  businessName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  preferredContactMethod?: unknown;
  leadLinkId?: unknown;
  sourceCampaign?: unknown;
  referrer?: unknown;
};

const CONTACT_METHODS = new Set(["email", "whatsapp", "phone"]);

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function isMissingMigrationTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("migration_assessments");
}

function findExistingIntakeLead(leads: AdminLead[], email: string, businessName: string) {
  const normalizedEmail = normalize(email);
  const normalizedBusiness = normalize(businessName);

  return (
    leads.find((lead) => {
      if (normalize(lead.userProfile.email) !== normalizedEmail) return false;
      const leadCompany = normalize(lead.company);
      return (
        leadCompany === normalizedBusiness ||
        leadCompany === "business details pending" ||
        (lead.source === "Outbound" && !leadCompany)
      );
    }) ?? null
  );
}

export async function POST(request: NextRequest) {
  let payload: IntakePayload;

  try {
    payload = (await request.json()) as IntakePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const input = payload.input;
  const monthlySpend = Number(input?.monthlyElectricitySpend ?? input?.monthlySpend);
  const profileId = cleanMigrationProfileId(payload.profileId);
  const submittedBusinessName = cleanString(payload.businessName);
  const submittedContactName = cleanString(payload.contactName);
  const submittedEmail = cleanString(payload.email).toLowerCase();
  const submittedPhone = cleanString(payload.phone);
  const submittedPreferredContactMethod = cleanString(payload.preferredContactMethod).toLowerCase();
  const leadLinkId = cleanString(payload.leadLinkId);
  const sourceCampaign = cleanString(payload.sourceCampaign) || null;
  const referrer = cleanString(payload.referrer) || null;

  if (!Number.isFinite(monthlySpend) || monthlySpend <= 0) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid monthly electricity spend greater than zero." },
      { status: 400 },
    );
  }

  if (!isValidMigrationProfileId(profileId)) {
    return NextResponse.json({ ok: false, error: "Enter a valid Migration Profile ID." }, { status: 400 });
  }

  const linkedLead = leadLinkId ? await findLeadByMigrationLinkFromDatabase(leadLinkId) : null;
  if (leadLinkId && !linkedLead) {
    return NextResponse.json({ ok: false, error: "Migration lead link not found." }, { status: 404 });
  }

  const businessName = submittedBusinessName || linkedLead?.company || "";
  const contactName = submittedContactName || linkedLead?.contactName || linkedLead?.userProfile.fullName || "";
  const email = submittedEmail || linkedLead?.userProfile.email.trim().toLowerCase() || "";
  const phone = submittedPhone || linkedLead?.userProfile.phone || "";
  const preferredContactMethod = submittedPreferredContactMethod || (linkedLead ? "email" : "");

  if (!businessName || !contactName || !email || (!linkedLead && !phone)) {
    return NextResponse.json(
      { ok: false, error: "Business name, contact person, email, and phone number are required." },
      { status: 400 },
    );
  }

  if (!isEmail(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (!CONTACT_METHODS.has(preferredContactMethod)) {
    return NextResponse.json({ ok: false, error: "Choose a valid preferred mode of contact." }, { status: 400 });
  }

  const limit = await consumeRateLimit({
    scope: "migration-intake-profile",
    key: `${requestIp(request)}:${email}`,
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many profile requests. Try again later." },
      { status: 429 },
    );
  }

  const result = calculateMigrationAssessment({ monthlyElectricitySpend: monthlySpend });
  const baseSolar = result.ufmsSolar.scenarios[1];
  const bestTenYearSaving = Math.max(
    ...result.ufmsSolar.scenarios.map((scenario) => scenario.tenYearSavingAgainstEskom),
    result.wheeling.conservative.tenYearSavingAgainstEskom,
    result.wheeling.photovoltaicOnlyReference.tenYearSavingAgainstEskom,
    ...result.combinedScenarios.map((scenario) => scenario.combinedTenYearSavingAgainstEskom),
  );
  const generatedAt = new Date().toISOString();
  const assessmentSummary = {
    profileId,
    qualificationStatus: result.qualificationStatus,
    recommendedPathway: result.recommendedPathway,
    monthlySpend: result.currentUtilityProjection.currentMonthlySpend,
    annualSpend: result.currentUtilityProjection.currentAnnualSpend,
    tenYearSpend: result.currentUtilityProjection.tenYearSpend,
    bestTenYearSaving,
    preferredContactMethod,
    sourceCampaign,
    referrer,
    generatedAt,
  };

  const existingLeads = linkedLead ? [] : await findLeadsByEmailFromDatabase(email);
  const existingLead = linkedLead ?? findExistingIntakeLead(existingLeads, email, businessName);
  const registrationSource = linkedLead
    ? leadMigrationSource(linkedLead, leadLinkId)
    : MIGRATION_INTAKE_SOURCE;
  const intakeInput = {
    businessName,
    contactName,
    contactEmail: email,
    contactNumber: phone,
    preferredContactMethod,
    monthlyElectricitySpendEstimateZar: result.currentUtilityProjection.currentMonthlySpend,
    ownerId: existingLead?.ownerId || defaultOwnerIdForRegistration(registrationSource),
    registrationSource,
    assessmentSummary,
    preserveRegistrationState: Boolean(linkedLead),
  };

  const created = existingLead
    ? updateExistingLeadFromMigrationIntake(existingLead, intakeInput)
    : buildAdminLeadFromMigrationIntake(intakeInput);

  if (!created) {
    return NextResponse.json(
      { ok: false, error: "Business name, contact details, and monthly spend are required." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const persistedLead = await upsertSingleLeadToDatabase(created.lead, `migration-intake:${profileId}`);
  if (supabase && !persistedLead) {
    return NextResponse.json(
      { ok: false, error: "Unable to create the admin client profile." },
      { status: 500 },
    );
  }

  const backend = persistedLead ? "supabase" : "local";
  const linkedLeadId = persistedLead ? created.leadId : null;
  const linkedClientProfileId = persistedLead ? created.clientProfileId : null;

  if (persistedLead && !existingLead) {
    const savingsZar = Math.round(bestTenYearSaving ?? 0);
    void createNotification({
      audience: "admin",
      kind: "new_lead",
      title: `New migration lead: ${businessName}`,
      body: `${contactName} just generated a migration estimate. Monthly spend ~R ${Math.round(result.currentUtilityProjection.currentMonthlySpend).toLocaleString("en-ZA")}. 10-yr best saving R ${savingsZar.toLocaleString("en-ZA")}.`,
      link: `/admin/leads/${created.clientProfileId}`,
      metadata: {
        leadId: created.leadId,
        clientProfileId: created.clientProfileId,
        company: businessName,
        contactEmail: email,
        contactPhone: phone,
        monthlySpend: result.currentUtilityProjection.currentMonthlySpend,
        sourceCampaign,
        referrer,
      },
    });
  } else if (persistedLead && linkedLead) {
    const savingsZar = Math.round(bestTenYearSaving ?? 0);
    void createNotification({
      audience: "admin",
      kind: "client_registered",
      title: `Linked migration estimate: ${businessName}`,
      body: `${contactName} used their dedicated migration link. Monthly spend ~R ${Math.round(result.currentUtilityProjection.currentMonthlySpend).toLocaleString("en-ZA")}. 10-yr best saving R ${savingsZar.toLocaleString("en-ZA")}.`,
      link: `/admin/leads/${created.clientProfileId}`,
      metadata: {
        leadId: created.leadId,
        clientProfileId: created.clientProfileId,
        company: businessName,
        contactEmail: email,
        contactPhone: phone,
        monthlySpend: result.currentUtilityProjection.currentMonthlySpend,
        leadLinkId,
        sourceCampaign,
        referrer,
      },
    });
  }
  const fallbackAssessmentId = makeId("migration");
  let assessmentId = fallbackAssessmentId;
  let assessmentBackend: "supabase" | "local" = "local";

  if (supabase) {
    const assessmentRow = {
      profile_id: profileId,
      lead_id: linkedLeadId,
      client_profile_id: linkedClientProfileId,
      business_name: businessName,
      contact_name: contactName,
      email,
      phone,
      company_registration_number: null,
      monthly_spend: result.currentUtilityProjection.currentMonthlySpend,
      monthly_kwh: result.wheeling.estimatedMonthlyKilowattHours,
      annual_spend: result.currentUtilityProjection.currentAnnualSpend,
      ten_year_spend: result.currentUtilityProjection.tenYearSpend,
      business_type: null,
      province: null,
      utility_provider: null,
      pain_point: null,
      qualification_status: result.qualificationStatus,
      recommended_pathway: result.recommendedPathway,
      solar_monthly_saving: baseSolar.monthlySaving,
      solar_annual_saving: baseSolar.annualSaving,
      solar_ten_year_saving: baseSolar.tenYearSavingAgainstEskom,
      solar_saving_percentage: baseSolar.savingPercentage,
      wheeling_conservative_monthly_saving: result.wheeling.conservative.monthlySaving,
      wheeling_conservative_annual_saving: result.wheeling.conservative.annualSaving,
      wheeling_conservative_ten_year_saving: result.wheeling.conservative.tenYearSavingAgainstEskom,
      wheeling_conservative_percentage: result.wheeling.conservative.savingPercentage,
      wheeling_best_monthly_saving: result.wheeling.photovoltaicOnlyReference.monthlySaving,
      wheeling_best_annual_saving: result.wheeling.photovoltaicOnlyReference.annualSaving,
      wheeling_best_ten_year_saving: result.wheeling.photovoltaicOnlyReference.tenYearSavingAgainstEskom,
      wheeling_best_percentage: result.wheeling.photovoltaicOnlyReference.savingPercentage,
      status: "registered",
    };

    const { data, error } = await supabase
      .from("migration_assessments")
      .upsert(assessmentRow, { onConflict: "profile_id" })
      .select("id")
      .single();

    if (error && !isMissingMigrationTable(error)) {
      return NextResponse.json(
        { ok: false, error: error.message ?? "Unable to save Migration Assessment." },
        { status: 500 },
      );
    }

    if (data?.id) {
      assessmentId = data.id;
      assessmentBackend = "supabase";
    }
  }

  return NextResponse.json({
    ok: true,
    backend,
    assessmentBackend,
    assessmentId,
    leadId: created.leadId,
    clientProfileId: created.clientProfileId,
    uploadToken: documentUploadLinkIdForLead({
      leadId: created.leadId,
      clientProfileId: created.clientProfileId,
      email,
    }),
  });
}
