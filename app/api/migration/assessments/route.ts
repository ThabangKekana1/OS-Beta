import { NextRequest, NextResponse } from "next/server";
import {
  calculateMigrationAssessment,
  type MigrationAssessmentInput,
} from "@/lib/calculateMigrationAssessment";
import { makeId } from "@/lib/formatting";
import { cleanMigrationProfileId, isValidMigrationProfileId } from "@/lib/migration-profile-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type AssessmentPayload = {
  input?: Partial<MigrationAssessmentInput>;
  businessName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  companyRegistrationNumber?: unknown;
  profileId?: unknown;
  leadId?: unknown;
  clientProfileId?: unknown;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isMissingMigrationTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("migration_assessments");
}

export async function POST(request: NextRequest) {
  let payload: AssessmentPayload;

  try {
    payload = (await request.json()) as AssessmentPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const input = payload.input;
  const monthlySpend = Number(input?.monthlyElectricitySpend ?? input?.monthlySpend);
  const businessName = cleanString(payload.businessName);
  const contactName = cleanString(payload.contactName);
  const email = cleanString(payload.email).toLowerCase();
  const phone = cleanString(payload.phone);
  const companyRegistrationNumber = cleanString(payload.companyRegistrationNumber);
  const profileId = cleanMigrationProfileId(payload.profileId);
  const leadId = cleanString(payload.leadId) || null;
  const clientProfileId = cleanString(payload.clientProfileId) || null;

  if (!Number.isFinite(monthlySpend) || monthlySpend <= 0) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid monthly electricity spend greater than zero." },
      { status: 400 },
    );
  }
  if (!businessName || !contactName || !email || !phone) {
    return NextResponse.json(
      { ok: false, error: "Business name, contact person, email, and phone number are required." },
      { status: 400 },
    );
  }
  if (!isEmail(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (profileId && !isValidMigrationProfileId(profileId)) {
    return NextResponse.json({ ok: false, error: "Enter a valid Migration Profile ID." }, { status: 400 });
  }

  const result = calculateMigrationAssessment({
    monthlyElectricitySpend: monthlySpend,
  });
  const baseSolar = result.ufmsSolar.scenarios[1];

  const assessmentId = makeId("migration");
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({
      ok: true,
      backend: "local",
      assessmentId,
    });
  }

  const assessmentRow = {
    profile_id: profileId || null,
    lead_id: leadId,
    client_profile_id: clientProfileId,
    business_name: businessName,
    contact_name: contactName,
    email,
    phone,
    company_registration_number: companyRegistrationNumber || null,
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

  const query = profileId
    ? supabase.from("migration_assessments").upsert(assessmentRow, { onConflict: "profile_id" })
    : supabase.from("migration_assessments").insert(assessmentRow);

  const { data, error } = await query
    .select("id")
    .single();

  if (error || !data?.id) {
    if (isMissingMigrationTable(error)) {
      return NextResponse.json({
        ok: true,
        backend: "local",
        assessmentId,
      });
    }

    return NextResponse.json(
      { ok: false, error: error?.message ?? "Unable to save Migration Assessment." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    backend: "supabase",
    assessmentId: data.id,
  });
}
