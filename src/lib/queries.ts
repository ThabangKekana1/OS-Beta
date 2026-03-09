import prisma from "./prisma";
import { UserRole } from "@prisma/client";
import {
  getAdminExchangeGroups,
  getBusinessExchangeGroups,
} from "./document-exchange";

export async function getAdminDashboardStats() {
  const [
    totalDeals,
    stalledDeals,
    pendingDocReview,
    overdueDeals,
    todayTasks,
    dealsByStage,
    awaitingPartner,
    totalLeads,
  ] = await Promise.all([
    prisma.dealPipeline.count(),
    prisma.dealPipeline.count({ where: { isStalled: true } }),
    prisma.documentSubmission.count({
      where: {
        direction: "BUSINESS_TO_ADMIN",
        adminReviewRequired: true,
        reviewStatus: "PENDING_REVIEW",
      },
    }),
    prisma.dealPipeline.count({
      where: {
        currentStage: { isTerminal: false },
        stageEnteredAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.task.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        dueAt: { lte: new Date(new Date().setHours(23, 59, 59, 999)) },
      },
    }),
    prisma.dealPipeline.groupBy({
      by: ["currentStageId"],
      _count: { id: true },
    }),
    prisma.documentSubmission.count({
      where: {
        partnerHandoffRequired: true,
        forwardedToPartnerAt: null,
      },
    }),
    prisma.lead.count(),
  ]);

  const stages = await prisma.pipelineStageDefinition.findMany({
    orderBy: { orderIndex: "asc" },
  });

  const stageCountMap: Record<string, number> = {};
  for (const d of dealsByStage) {
    stageCountMap[d.currentStageId] = d._count.id;
  }

  const dealsByStageFormatted = stages.map((s) => ({
    stageId: s.id,
    stageCode: s.code,
    stageName: s.name,
    category: s.category,
    count: stageCountMap[s.id] ?? 0,
  }));

  return {
    totalDeals,
    stalledDeals,
    pendingDocReview,
    overdueDeals,
    todayTasks,
    awaitingPartner,
    totalLeads,
    dealsByStage: dealsByStageFormatted,
  };
}

export async function getAdminPipelineDeals(filters?: { stageCode?: string; isStalled?: boolean; healthStatus?: string }) {
  const where: Record<string, unknown> = {};
  if (filters?.stageCode) {
    const stage = await prisma.pipelineStageDefinition.findUnique({ where: { code: filters.stageCode } });
    if (stage) where.currentStageId = stage.id;
  }
  if (filters?.isStalled !== undefined) where.isStalled = filters.isStalled;
  if (filters?.healthStatus) where.healthStatus = filters.healthStatus;

  return prisma.dealPipeline.findMany({
    where,
    include: {
      business: true,
      currentStage: true,
      sourceSalesRepresentative: { select: { id: true, firstName: true, lastName: true } },
      assignedAdministrator: { select: { id: true, firstName: true, lastName: true } },
      stallReason: true,
    },
    orderBy: { stageEnteredAt: "asc" },
  });
}

export async function getBusinessDetail(businessId: string) {
  return prisma.business.findUnique({
    where: { id: businessId },
    include: {
      sourceSalesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
      assignedAdministrator: { select: { id: true, firstName: true, lastName: true, email: true } },
      currentStage: true,
      dealPipeline: {
        include: {
          currentStage: true,
          stallReason: true,
          stageHistory: {
            include: {
              fromStage: true,
              toStage: true,
              changedBy: { select: { firstName: true, lastName: true } },
            },
            orderBy: { changedAt: "desc" },
          },
        },
      },
      documents: {
        include: {
          documentType: true,
          uploadedBy: { select: { firstName: true, lastName: true } },
          reviewedBy: { select: { firstName: true, lastName: true } },
          parentSubmission: {
            select: {
              id: true,
              originalFileName: true,
              purpose: true,
              exchangePhase: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      tasks: {
        include: {
          assignedTo: { select: { firstName: true, lastName: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      notes: {
        include: { author: { select: { firstName: true, lastName: true, role: true } } },
        orderBy: { createdAt: "desc" },
      },
      businessUsers: {
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      },
    },
  });
}

export async function getSalesRepDashboardData(userId: string) {
  const [leads, businesses, profile] = await Promise.all([
    prisma.lead.findMany({
      where: { salesRepresentativeId: userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.business.findMany({
      where: { sourceSalesRepresentativeId: userId },
      include: {
        currentStage: true,
        dealPipeline: { include: { currentStage: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.salesRepresentativeProfile.findUnique({
      where: { userId },
    }),
  ]);

  const totalLeads = leads.length;
  const invitesSent = leads.filter((l) => l.status === "INVITE_SENT" || l.status === "REGISTERED" || l.status === "CONVERTED").length;
  const registered = businesses.length;
  const qualified = businesses.filter((b) => b.qualificationStatus === "QUALIFIED").length;
  const stalled = businesses.filter((b) => b.dealPipeline?.isStalled).length;

  return { leads, businesses, profile, stats: { totalLeads, invitesSent, registered, qualified, stalled } };
}

export async function getBusinessDashboardData(userId: string) {
  const profile = await prisma.businessUserProfile.findUnique({
    where: { userId },
    include: {
      business: {
        include: {
          currentStage: true,
          dealPipeline: {
            include: { currentStage: true },
          },
          documents: {
            include: {
              documentType: true,
              uploadedBy: { select: { firstName: true, lastName: true } },
              reviewedBy: { select: { firstName: true, lastName: true } },
              parentSubmission: {
                select: {
                  id: true,
                  originalFileName: true,
                  purpose: true,
                  exchangePhase: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          tasks: {
            where: { ownerRole: "BUSINESS_USER", status: { in: ["OPEN", "IN_PROGRESS"] } },
            orderBy: { dueAt: "asc" },
          },
        },
      },
    },
  });

  return profile;
}

export async function getAnalyticsData() {
  const [
    totalLeads,
    totalBusinesses,
    qualifiedCount,
    disqualifiedCount,
    dealsByStage,
    stalledByReason,
    avgStageDurations,
    repPerformance,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.business.count(),
    prisma.business.count({ where: { qualificationStatus: "QUALIFIED" } }),
    prisma.business.count({ where: { qualificationStatus: "DISQUALIFIED" } }),
    prisma.dealPipeline.groupBy({
      by: ["currentStageId"],
      _count: { id: true },
    }),
    prisma.dealPipeline.groupBy({
      by: ["stallReasonCode"],
      where: { isStalled: true, stallReasonCode: { not: null } },
      _count: { id: true },
    }),
    prisma.pipelineStageHistory.groupBy({
      by: ["toStageId"],
      _avg: { previousStageDurationHours: true },
    }),
    prisma.business.groupBy({
      by: ["sourceSalesRepresentativeId"],
      _count: { id: true },
    }),
  ]);

  return {
    totalLeads,
    totalBusinesses,
    qualifiedCount,
    disqualifiedCount,
    dealsByStage,
    stalledByReason,
    avgStageDurations,
    repPerformance,
  };
}

export async function getDocumentReviewQueue() {
  return prisma.documentSubmission.findMany({
    where: {
      direction: "BUSINESS_TO_ADMIN",
      adminReviewRequired: true,
      reviewStatus: "PENDING_REVIEW",
    },
    include: {
      business: { select: { legalName: true, id: true } },
      documentType: true,
      uploadedBy: { select: { firstName: true, lastName: true } },
      parentSubmission: {
        select: {
          id: true,
          originalFileName: true,
          purpose: true,
          exchangePhase: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAdminDocumentExchangeOverview() {
  const documents = await prisma.documentSubmission.findMany({
    include: {
      business: { select: { id: true, legalName: true } },
      documentType: true,
      uploadedBy: { select: { firstName: true, lastName: true } },
      reviewedBy: { select: { firstName: true, lastName: true } },
      parentSubmission: {
        select: {
          id: true,
          originalFileName: true,
          purpose: true,
          exchangePhase: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const groups = getAdminExchangeGroups(documents);

  return { documents, groups };
}

export async function getBusinessDocumentExchange(userId: string) {
  const profile = await prisma.businessUserProfile.findUnique({
    where: { userId },
    include: {
      business: {
        include: {
          currentStage: true,
          dealPipeline: { include: { currentStage: true } },
          documents: {
            include: {
              documentType: true,
              uploadedBy: { select: { firstName: true, lastName: true } },
              reviewedBy: { select: { firstName: true, lastName: true } },
              parentSubmission: {
                select: {
                  id: true,
                  originalFileName: true,
                  purpose: true,
                  exchangePhase: true,
                },
              },
            },
            orderBy: [{ createdAt: "desc" }],
          },
        },
      },
    },
  });

  const groups = profile?.business
    ? getBusinessExchangeGroups(profile.business.documents)
    : null;

  return { profile, groups };
}

export async function getAllTasks(filters?: { status?: string; ownerRole?: string }) {
  const where: Record<string, unknown> = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.ownerRole) where.ownerRole = filters.ownerRole;

  return prisma.task.findMany({
    where,
    include: {
      business: { select: { legalName: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
    take: 100,
  });
}

export async function getStageDefinitions() {
  return prisma.pipelineStageDefinition.findMany({ orderBy: { orderIndex: "asc" } });
}

export async function getStallReasonDefinitions() {
  return prisma.stallReasonDefinition.findMany({ orderBy: { name: "asc" } });
}

export async function getDocumentTypeDefinitions() {
  return prisma.documentTypeDefinition.findMany({ orderBy: { name: "asc" } });
}

export async function getAdministrators() {
  return prisma.user.findMany({
    where: { role: { in: ["ADMINISTRATOR", "SUPER_ADMIN"] }, status: "ACTIVE" },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  });
}

export async function getAllUsers() {
  return prisma.user.findMany({
    include: {
      salesRepProfile: true,
      businessUserProfile: { include: { business: { select: { legalName: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}
