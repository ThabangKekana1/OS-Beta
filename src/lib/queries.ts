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

export async function getSalesRepEarningsData(userId: string) {
  const payments = await prisma.salesRepPayment.findMany({
    where: {
      salesRepresentativeId: userId,
      status: { in: ["PENDING", "PAID"] },
    },
    include: {
      business: { select: { id: true, legalName: true } },
      lead: { select: { id: true, businessName: true } },
      dealPipeline: {
        select: {
          id: true,
          currentStage: { select: { name: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { paidAt: "desc" }, { createdAt: "desc" }],
  });

  const pendingPayments = payments.filter((payment) => payment.status === "PENDING");
  const completedPayments = payments.filter((payment) => payment.status === "PAID");
  const pendingAmountCents = pendingPayments.reduce((total, payment) => total + payment.amountCents, 0);
  const completedAmountCents = completedPayments.reduce((total, payment) => total + payment.amountCents, 0);

  return {
    pendingPayments,
    completedPayments,
    stats: {
      pendingCount: pendingPayments.length,
      pendingAmountCents,
      completedCount: completedPayments.length,
      completedAmountCents,
      totalAmountCents: pendingAmountCents + completedAmountCents,
    },
  };
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

export async function getSuperAdminPaymentsData() {
  const payments = await prisma.salesRepPayment.findMany({
    where: {
      status: { in: ["PENDING", "PAID"] },
    },
    include: {
      salesRepresentative: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      business: { select: { id: true, legalName: true } },
      lead: { select: { id: true, businessName: true } },
      dealPipeline: {
        select: {
          id: true,
          currentStage: { select: { name: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { paidAt: "desc" }, { createdAt: "desc" }],
  });

  const pendingPayments = payments.filter((payment) => payment.status === "PENDING");
  const completedPayments = payments.filter((payment) => payment.status === "PAID");
  const pendingAmountCents = pendingPayments.reduce((total, payment) => total + payment.amountCents, 0);
  const completedAmountCents = completedPayments.reduce((total, payment) => total + payment.amountCents, 0);

  return {
    pendingPayments,
    completedPayments,
    stats: {
      pendingCount: pendingPayments.length,
      pendingAmountCents,
      completedCount: completedPayments.length,
      completedAmountCents,
    },
  };
}

const communicationThreadInclude = {
  business: { select: { id: true, legalName: true, sourceSalesRepresentativeId: true } },
  lead: { select: { id: true, businessName: true, salesRepresentativeId: true } },
  dealPipeline: { select: { id: true, sourceSalesRepresentativeId: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, role: true } },
  messages: {
    include: {
      author: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
    orderBy: { createdAt: "asc" as const },
    take: 30,
  },
};

export async function getAdminCommunicationSummary() {
  const unresolvedStatuses: ("OPEN" | "PENDING")[] = ["OPEN", "PENDING"];
  const unresolvedFilter = { status: { in: unresolvedStatuses } };
  const [recentUnresolved, businessSupportOpen, salesEscalationOpen, internalAdminOpen] =
    await Promise.all([
      prisma.communicationThread.findMany({
        where: unresolvedFilter,
        include: communicationThreadInclude,
        orderBy: { lastMessageAt: "desc" },
        take: 8,
      }),
      prisma.communicationThread.count({
        where: { ...unresolvedFilter, threadType: "BUSINESS_SUPPORT" },
      }),
      prisma.communicationThread.count({
        where: { ...unresolvedFilter, threadType: "SALES_ESCALATION" },
      }),
      prisma.communicationThread.count({
        where: { ...unresolvedFilter, threadType: "INTERNAL_ADMIN_NOTE" },
      }),
    ]);

  return {
    recentUnresolved,
    counts: {
      businessSupportOpen,
      salesEscalationOpen,
      internalAdminOpen,
      unresolvedTotal:
        businessSupportOpen + salesEscalationOpen + internalAdminOpen,
    },
  };
}

export async function getAdminCommunicationOverview(filters?: {
  threadType?: string;
  status?: string;
  businessId?: string;
  leadId?: string;
}) {
  const where: Record<string, unknown> = {};
  if (filters?.threadType) where.threadType = filters.threadType;
  if (filters?.status) where.status = filters.status;
  if (filters?.businessId) where.businessId = filters.businessId;
  if (filters?.leadId) where.leadId = filters.leadId;

  const [threads, businesses, leads, deals] = await Promise.all([
    prisma.communicationThread.findMany({
      where,
      include: communicationThreadInclude,
      orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }],
      take: 120,
    }),
    prisma.business.findMany({
      select: { id: true, legalName: true },
      orderBy: { legalName: "asc" },
      take: 200,
    }),
    prisma.lead.findMany({
      select: { id: true, businessName: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.dealPipeline.findMany({
      select: {
        id: true,
        business: { select: { legalName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return { threads, businesses, leads, deals };
}

export async function getBusinessSupportThreads(userId: string) {
  const profile = await prisma.businessUserProfile.findUnique({
    where: { userId },
    select: {
      businessId: true,
      business: {
        select: {
          id: true,
          legalName: true,
          dealPipeline: { select: { id: true } },
        },
      },
    },
  });

  if (!profile) return null;

  const threads = await prisma.communicationThread.findMany({
    where: {
      threadType: "BUSINESS_SUPPORT",
      visibilityScope: "BUSINESS_ADMIN",
      businessId: profile.businessId,
    },
    include: communicationThreadInclude,
    orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }],
    take: 60,
  });

  return { profile, threads };
}

export async function getSalesEscalationThreads(userId: string) {
  const [threads, leads, businesses] = await Promise.all([
    prisma.communicationThread.findMany({
      where: {
        threadType: "SALES_ESCALATION",
        visibilityScope: "SALES_ADMIN",
        OR: [
          { lead: { is: { salesRepresentativeId: userId } } },
          { business: { is: { sourceSalesRepresentativeId: userId } } },
          { dealPipeline: { is: { sourceSalesRepresentativeId: userId } } },
        ],
      },
      include: communicationThreadInclude,
      orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }],
      take: 80,
    }),
    prisma.lead.findMany({
      where: { salesRepresentativeId: userId },
      select: { id: true, businessName: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.business.findMany({
      where: { sourceSalesRepresentativeId: userId },
      select: { id: true, legalName: true, registrationNumber: true },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);

  return { threads, leads, businesses };
}

export async function getBusinessCommunicationThreadsForAdmin(businessId: string) {
  return prisma.communicationThread.findMany({
    where: { businessId },
    include: communicationThreadInclude,
    orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }],
    take: 80,
  });
}
