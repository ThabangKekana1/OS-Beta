"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { businessRegistrationSchema } from "@/lib/validation";
import prisma from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { createAutoTasks } from "@/lib/task-engine";
import { revalidatePath } from "next/cache";
import { getActiveReferralContext } from "@/lib/referrals";

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "Business", lastName: "User" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || "User",
  };
}

export async function registerBusinessFromReferral(formData: FormData) {
  const referralCode = String(formData.get("referralCode") ?? "").trim();
  const referral = await getActiveReferralContext(referralCode);

  if (
    !referral ||
    referral.user.role !== "SALES_REPRESENTATIVE" ||
    referral.user.status !== "ACTIVE"
  ) {
    return { error: "Referral link is invalid or inactive." };
  }

  const monthlyElectricitySpendEstimateRaw = String(
    formData.get("monthlyElectricitySpendEstimate") ?? ""
  ).trim();

  const parsed = businessRegistrationSchema.safeParse({
    legalName: formData.get("legalName"),
    tradingName: formData.get("tradingName") || undefined,
    registrationNumber: formData.get("registrationNumber"),
    industry: formData.get("industry") || undefined,
    monthlyElectricitySpendEstimate: monthlyElectricitySpendEstimateRaw
      ? Number(monthlyElectricitySpendEstimateRaw)
      : undefined,
    contactPersonName: formData.get("contactPersonName"),
    contactPersonEmail: formData.get("contactPersonEmail"),
    contactPersonPhone: formData.get("contactPersonPhone") || undefined,
    physicalAddress: formData.get("physicalAddress") || undefined,
    city: formData.get("city") || undefined,
    province: formData.get("province") || undefined,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const [existingBusiness, existingUser, registeredStage] = await Promise.all([
    prisma.business.findUnique({
      where: { registrationNumber: parsed.data.registrationNumber },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { email: parsed.data.contactPersonEmail },
      select: { id: true },
    }),
    prisma.pipelineStageDefinition.findUnique({
      where: { code: "BUSINESS_REGISTERED" },
      select: { id: true },
    }),
  ]);

  if (existingBusiness) {
    return { error: "A business with this registration number already exists." };
  }

  if (existingUser) {
    return { error: "This contact email is already linked to an account." };
  }

  if (!registeredStage) {
    return { error: "Registration stage is not configured." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const { firstName, lastName } = splitFullName(parsed.data.contactPersonName);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const businessUser = await tx.user.create({
        data: {
          firstName,
          lastName,
          email: parsed.data.contactPersonEmail,
          passwordHash,
          role: "BUSINESS_USER",
          status: "ACTIVE",
        },
      });

      const business = await tx.business.create({
        data: {
          legalName: parsed.data.legalName,
          tradingName: parsed.data.tradingName ?? null,
          registrationNumber: parsed.data.registrationNumber,
          industry: parsed.data.industry ?? null,
          monthlyElectricitySpendEstimate:
            parsed.data.monthlyElectricitySpendEstimate ?? null,
          contactPersonName: parsed.data.contactPersonName,
          contactPersonEmail: parsed.data.contactPersonEmail,
          contactPersonPhone: parsed.data.contactPersonPhone ?? null,
          physicalAddress: parsed.data.physicalAddress ?? null,
          city: parsed.data.city ?? null,
          province: parsed.data.province ?? null,
          status: "ACTIVE",
          qualificationStatus: "REGISTERED",
          sourceSalesRepresentativeId: referral.user.id,
          currentStageId: registeredStage.id,
        },
      });

      await tx.businessUserProfile.create({
        data: {
          userId: businessUser.id,
          businessId: business.id,
          canSignDocuments: true,
          isPrimaryContact: true,
        },
      });

      const dealPipeline = await tx.dealPipeline.create({
        data: {
          businessId: business.id,
          sourceSalesRepresentativeId: referral.user.id,
          currentStageId: registeredStage.id,
          healthStatus: "WAITING_ON_BUSINESS",
          nextRequiredAction: "Complete your business application",
          nextRequiredActionOwner: "BUSINESS_USER",
          priority: "MEDIUM",
        },
      });

      await tx.pipelineStageHistory.create({
        data: {
          dealPipelineId: dealPipeline.id,
          fromStageId: null,
          toStageId: registeredStage.id,
          changedByUserId: businessUser.id,
          note: `Business registered via referral code ${referralCode}`,
        },
      });

      const matchingLead = await tx.lead.findFirst({
        where: {
          salesRepresentativeId: referral.user.id,
          contactEmail: parsed.data.contactPersonEmail,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (matchingLead) {
        await tx.lead.update({
          where: { id: matchingLead.id },
          data: {
            status: "CONVERTED",
            registeredBusinessId: business.id,
          },
        });
      }

      return { businessUser, business, dealPipeline };
    });

    await logActivity({
      entityType: "Business",
      entityId: result.business.id,
      actionType: "BUSINESS_REGISTERED",
      actorUserId: result.businessUser.id,
      metadata: {
        referralCode,
        salesRepresentativeId: referral.user.id,
        dealPipelineId: result.dealPipeline.id,
      },
    });

    await createAutoTasks({
      triggerType: "BUSINESS_REGISTERED",
      dealPipelineId: result.dealPipeline.id,
      businessId: result.business.id,
      actorUserId: result.businessUser.id,
    });

    revalidatePath("/sales/dashboard");
    revalidatePath("/sales/leads");
    revalidatePath("/sales/businesses");
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/pipeline");
    revalidatePath("/admin/businesses");

    return {
      success: true,
      email: parsed.data.contactPersonEmail,
      message: "Business registered successfully.",
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "A matching business or account already exists." };
    }

    throw error;
  }
}
