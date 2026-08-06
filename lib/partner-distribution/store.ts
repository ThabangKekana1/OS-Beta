import type { AuthSession } from "@/lib/auth";
import {
  buildPartnerMemberSummary,
} from "@/lib/partner-distribution/stages";
import {
  partnerOrganisationIdForSession,
} from "@/lib/partner-distribution/permissions";
import type {
  PartnerCaseSnapshot,
  PartnerMemberSummary,
  PartnerOrganisation,
  PartnerReferral,
  PartnerRevenue,
} from "@/lib/partner-distribution/types";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function client() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase admin configuration is unavailable.");
  }
  return supabase;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getPartnerOrganisationForSession(
  session: AuthSession,
): Promise<PartnerOrganisation> {
  const organisationId = partnerOrganisationIdForSession(session);
  const { data, error } = await client()
    .from("associations")
    .select(
      "id,name,partner_type,onboarding_status,referral_code,contact_name,contact_email",
    )
    .eq("id", organisationId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Partner organisation was not found.");
  }

  return {
    id: data.id as string,
    name: data.name as string,
    partnerType: data.partner_type as PartnerOrganisation["partnerType"],
    onboardingStatus:
      data.onboarding_status as PartnerOrganisation["onboardingStatus"],
    referralCode: data.referral_code as string,
    contactName: (data.contact_name as string | null) ?? null,
    contactEmail: (data.contact_email as string | null) ?? null,
  };
}

export async function listPartnerMembersForSession(
  session: AuthSession,
): Promise<PartnerMemberSummary[]> {
  const organisationId = partnerOrganisationIdForSession(session);
  const supabase = client();
  const { data: referralRows, error: referralError } = await supabase
    .from("association_referrals")
    .select(
      "id,association_id,invited_email,member_business_name,source,status,created_at,invitation_sent_at,registered_at",
    )
    .eq("association_id", organisationId)
    .order("created_at", { ascending: false });

  if (referralError) throw new Error(referralError.message);

  const referrals: PartnerReferral[] = (referralRows ?? []).map((row) => ({
    id: row.id as string,
    associationId: row.association_id as string,
    invitedEmail: (row.invited_email as string | null) ?? null,
    memberBusinessName:
      (row.member_business_name as string | null) ?? null,
    source: row.source as PartnerReferral["source"],
    status: row.status as PartnerReferral["status"],
    createdAt: row.created_at as string,
    invitationSentAt:
      (row.invitation_sent_at as string | null) ?? null,
    registeredAt: (row.registered_at as string | null) ?? null,
  }));

  if (referrals.length === 0) return [];

  const referralIds = referrals.map((referral) => referral.id);
  const { data: caseRows, error: caseError } = await supabase
    .from("migration_cases")
    .select(
      "id,partner_referral_id,business_name,contact_name,contact_email,stage,created_at,active_bill_pack_id,active_proposal_id",
    )
    .in("partner_referral_id", referralIds);

  if (caseError) throw new Error(caseError.message);
  const cases = caseRows ?? [];
  if (cases.length === 0) {
    return referrals.map((referral) =>
      buildPartnerMemberSummary(referral, null),
    );
  }

  const caseIds = cases.map((row) => row.id as string);
  const billPackIds = cases
    .map((row) => row.active_bill_pack_id as string | null)
    .filter((value): value is string => Boolean(value));
  const proposalIds = cases
    .map((row) => row.active_proposal_id as string | null)
    .filter((value): value is string => Boolean(value));

  const [billPacksResult, proposalsResult, termSheetsResult] =
    await Promise.all([
      billPackIds.length
        ? supabase
            .from("migration_case_bill_packs")
            .select("id,case_id,source_file_count,created_at")
            .in("id", billPackIds)
        : Promise.resolve({ data: [], error: null }),
      proposalIds.length
        ? supabase
            .from("migration_case_proposals")
            .select(
              "id,case_id,created_at,economically_positive,year_one_monthly_difference",
            )
            .in("id", proposalIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("migration_case_term_sheets")
        .select("case_id,deal_value_rands")
        .in("case_id", caseIds),
    ]);

  const relationError =
    billPacksResult.error || proposalsResult.error || termSheetsResult.error;
  if (relationError) throw new Error(relationError.message);

  const billPackById = new Map(
    (billPacksResult.data ?? []).map((row) => [row.id as string, row]),
  );
  const proposalById = new Map(
    (proposalsResult.data ?? []).map((row) => [row.id as string, row]),
  );
  const dealBookByCaseId = new Map<string, number>();
  for (const row of termSheetsResult.data ?? []) {
    const caseId = row.case_id as string;
    dealBookByCaseId.set(
      caseId,
      (dealBookByCaseId.get(caseId) ?? 0) +
        numberValue(row.deal_value_rands),
    );
  }

  const caseByReferralId = new Map<string, PartnerCaseSnapshot>();
  for (const row of cases) {
    const referralId = row.partner_referral_id as string;
    const activeBillPackId =
      (row.active_bill_pack_id as string | null) ?? null;
    const activeProposalId =
      (row.active_proposal_id as string | null) ?? null;
    const billPack = activeBillPackId
      ? billPackById.get(activeBillPackId)
      : null;
    const proposal = activeProposalId
      ? proposalById.get(activeProposalId)
      : null;

    caseByReferralId.set(referralId, {
      id: row.id as string,
      referralId,
      businessName: row.business_name as string,
      contactName: row.contact_name as string,
      contactEmail: row.contact_email as string,
      canonicalStage: row.stage as PartnerCaseSnapshot["canonicalStage"],
      createdAt: row.created_at as string,
      activeBillFileCount: numberValue(billPack?.source_file_count),
      billPackCreatedAt:
        (billPack?.created_at as string | null | undefined) ?? null,
      proposalGeneratedAt:
        (proposal?.created_at as string | null | undefined) ?? null,
      proposalEconomicallyPositive:
        typeof proposal?.economically_positive === "boolean"
          ? proposal.economically_positive
          : null,
      estimatedMonthlySavingsRands: proposal
        ? numberValue(proposal.year_one_monthly_difference)
        : null,
      qualifiedDealBookRands: dealBookByCaseId.get(row.id as string) ?? 0,
    });
  }

  return referrals.map((referral) =>
    buildPartnerMemberSummary(
      referral,
      caseByReferralId.get(referral.id) ?? null,
    ),
  );
}

export async function listPartnerRevenuesForSession(
  session: AuthSession,
): Promise<PartnerRevenue[]> {
  const organisationId = partnerOrganisationIdForSession(session);
  const { data, error } = await client()
    .from("partner_revenues")
    .select("id,association_id,case_id,status,amount_rands")
    .eq("association_id", organisationId)
    .neq("status", "void");

  // Rewards are optional: a partner must still see their member pipeline on a
  // deployment where the revenue table has not been applied.
  if (error) {
    if (error.code === "42P01" || /partner_revenues/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    associationId: row.association_id as string,
    caseId: (row.case_id as string | null) ?? null,
    status: row.status as PartnerRevenue["status"],
    amountRands: numberValue(row.amount_rands),
  }));
}

