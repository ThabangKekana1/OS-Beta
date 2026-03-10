"use server";

import { revalidatePath } from "next/cache";
import { CommunicationStatus, CommunicationThreadType, Prisma, UserRole } from "@prisma/client";
import { requireAuth, requireRole } from "@/lib/auth";
import { isAdministratorRole } from "@/lib/communication";
import { logActivity } from "@/lib/audit";
import prisma from "@/lib/prisma";
import {
  communicationReplySchema,
  communicationStatusSchema,
  communicationThreadCreateSchema,
} from "@/lib/validation";

const threadAccessInclude = {
  business: {
    select: {
      id: true,
      legalName: true,
      sourceSalesRepresentativeId: true,
      businessUsers: { select: { userId: true } },
    },
  },
  lead: {
    select: {
      id: true,
      businessName: true,
      salesRepresentativeId: true,
      registeredBusinessId: true,
    },
  },
  dealPipeline: {
    select: {
      id: true,
      businessId: true,
      sourceSalesRepresentativeId: true,
    },
  },
} as const;

type ThreadWithAccess = Prisma.CommunicationThreadGetPayload<{
  include: typeof threadAccessInclude;
}>;

function getVisibilityScope(threadType: CommunicationThreadType) {
  if (threadType === "BUSINESS_SUPPORT") return "BUSINESS_ADMIN" as const;
  if (threadType === "SALES_ESCALATION") return "SALES_ADMIN" as const;
  return "ADMIN_ONLY" as const;
}

function getRecipientRole(threadType: CommunicationThreadType, authorRole: UserRole): UserRole {
  if (threadType === "BUSINESS_SUPPORT") {
    return isAdministratorRole(authorRole) ? "BUSINESS_USER" : "ADMINISTRATOR";
  }
  if (threadType === "SALES_ESCALATION") {
    return isAdministratorRole(authorRole) ? "SALES_REPRESENTATIVE" : "ADMINISTRATOR";
  }
  return "ADMINISTRATOR";
}

function getNextStatusAfterReply(threadType: CommunicationThreadType, authorRole: UserRole): CommunicationStatus {
  if (threadType === "INTERNAL_ADMIN_NOTE") return "OPEN";
  return isAdministratorRole(authorRole) ? "PENDING" : "OPEN";
}

function revalidateCommunicationPaths(thread: {
  businessId: string | null;
  leadId: string | null;
}) {
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/communications");
  revalidatePath("/business/dashboard");
  revalidatePath("/sales/dashboard");
  if (thread.businessId) {
    revalidatePath(`/admin/businesses/${thread.businessId}`);
    revalidatePath(`/sales/businesses/${thread.businessId}`);
  }
  if (thread.leadId) {
    revalidatePath("/sales/leads");
  }
}

async function notifyUsers(params: {
  userIds: string[];
  title: string;
  message: string;
  link: string;
  excludeUserId?: string;
}) {
  const filteredIds = params.userIds.filter((id) => id && id !== params.excludeUserId);
  if (filteredIds.length === 0) return;

  const recipients = await prisma.user.findMany({
    where: { id: { in: filteredIds }, status: "ACTIVE" },
    select: { id: true },
  });

  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((recipient) => ({
      userId: recipient.id,
      title: params.title,
      message: params.message,
      link: params.link,
      severity: "INFO",
      isRead: false,
    })),
  });
}

async function getAdministratorIds(excludeUserId?: string) {
  const users = await prisma.user.findMany({
    where: {
      role: { in: ["ADMINISTRATOR", "SUPER_ADMIN"] },
      status: "ACTIVE",
      id: excludeUserId ? { not: excludeUserId } : undefined,
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

async function getBusinessUserIds(businessId: string, excludeUserId?: string) {
  const profiles = await prisma.businessUserProfile.findMany({
    where: {
      businessId,
      user: {
        status: "ACTIVE",
        id: excludeUserId ? { not: excludeUserId } : undefined,
      },
    },
    select: { userId: true },
  });
  return profiles.map((profile) => profile.userId);
}

async function getSalesRepresentativeIds(thread: ThreadWithAccess, excludeUserId?: string) {
  const ids = new Set<string>();
  if (thread.lead?.salesRepresentativeId) ids.add(thread.lead.salesRepresentativeId);
  if (thread.business?.sourceSalesRepresentativeId) ids.add(thread.business.sourceSalesRepresentativeId);
  if (thread.dealPipeline?.sourceSalesRepresentativeId) ids.add(thread.dealPipeline.sourceSalesRepresentativeId);
  const filtered = [...ids].filter((id) => id !== excludeUserId);
  if (filtered.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: filtered }, role: "SALES_REPRESENTATIVE", status: "ACTIVE" },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

function canAccessThread(thread: ThreadWithAccess, user: { id: string; role: UserRole }) {
  if (isAdministratorRole(user.role)) return true;

  if (user.role === "BUSINESS_USER") {
    if (thread.threadType !== "BUSINESS_SUPPORT") return false;
    if (thread.visibilityScope !== "BUSINESS_ADMIN") return false;
    if (!thread.business) return false;
    return thread.business.businessUsers.some((profile) => profile.userId === user.id);
  }

  if (user.role === "SALES_REPRESENTATIVE") {
    if (thread.threadType !== "SALES_ESCALATION") return false;
    if (thread.visibilityScope !== "SALES_ADMIN") return false;

    return (
      thread.lead?.salesRepresentativeId === user.id ||
      thread.business?.sourceSalesRepresentativeId === user.id ||
      thread.dealPipeline?.sourceSalesRepresentativeId === user.id
    );
  }

  return false;
}

async function getThreadForUser(threadId: string, user: { id: string; role: UserRole }) {
  const thread = await prisma.communicationThread.findUnique({
    where: { id: threadId },
    include: threadAccessInclude,
  });
  if (!thread) return { error: "Thread not found" as const };
  if (!canAccessThread(thread, user)) return { error: "Forbidden" as const };
  return { thread };
}

export async function createCommunicationThread(formData: FormData) {
  const session = await requireAuth();

  const parsed = communicationThreadCreateSchema.safeParse({
    threadType: formData.get("threadType"),
    businessId: formData.get("businessId") || undefined,
    leadId: formData.get("leadId") || undefined,
    dealPipelineId: formData.get("dealPipelineId") || undefined,
    subject: formData.get("subject") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const hasContext =
    !!parsed.data.businessId || !!parsed.data.leadId || !!parsed.data.dealPipelineId;
  if (!hasContext) {
    return { error: "Thread must be linked to a lead, business, or deal" };
  }

  if (
    parsed.data.threadType === "BUSINESS_SUPPORT" &&
    !parsed.data.businessId
  ) {
    return { error: "Business support threads must be linked to a business" };
  }

  if (
    parsed.data.threadType === "SALES_ESCALATION" &&
    !parsed.data.leadId &&
    !parsed.data.businessId
  ) {
    return { error: "Sales escalation threads must be linked to a lead or business" };
  }

  const [business, lead, dealPipeline, businessProfile] = await Promise.all([
    parsed.data.businessId
      ? prisma.business.findUnique({
          where: { id: parsed.data.businessId },
          select: { id: true, sourceSalesRepresentativeId: true },
        })
      : null,
    parsed.data.leadId
      ? prisma.lead.findUnique({
          where: { id: parsed.data.leadId },
          select: { id: true, salesRepresentativeId: true, registeredBusinessId: true },
        })
      : null,
    parsed.data.dealPipelineId
      ? prisma.dealPipeline.findUnique({
          where: { id: parsed.data.dealPipelineId },
          select: { id: true, businessId: true, sourceSalesRepresentativeId: true },
        })
      : null,
    session.user.role === "BUSINESS_USER"
      ? prisma.businessUserProfile.findUnique({
          where: { userId: session.user.id },
          select: { businessId: true },
        })
      : null,
  ]);

  if (parsed.data.businessId && !business) return { error: "Business not found" };
  if (parsed.data.leadId && !lead) return { error: "Lead not found" };
  if (parsed.data.dealPipelineId && !dealPipeline) return { error: "Deal not found" };

  if (
    business &&
    lead?.registeredBusinessId &&
    business.id !== lead.registeredBusinessId
  ) {
    return { error: "Lead does not belong to the selected business" };
  }

  if (business && dealPipeline && business.id !== dealPipeline.businessId) {
    return { error: "Deal does not belong to the selected business" };
  }

  if (
    lead?.registeredBusinessId &&
    dealPipeline &&
    lead.registeredBusinessId !== dealPipeline.businessId
  ) {
    return { error: "Lead does not belong to the selected deal" };
  }

  if (session.user.role === "BUSINESS_USER") {
    if (parsed.data.threadType !== "BUSINESS_SUPPORT") {
      return { error: "Business users can only create support threads" };
    }
    if (!businessProfile) return { error: "Business profile not found" };
    if (business?.id !== businessProfile.businessId) {
      return { error: "You can only create support threads for your business" };
    }
    if (lead?.registeredBusinessId && lead.registeredBusinessId !== businessProfile.businessId) {
      return { error: "Lead is outside your business scope" };
    }
    if (dealPipeline?.businessId && dealPipeline.businessId !== businessProfile.businessId) {
      return { error: "Deal is outside your business scope" };
    }
  }

  if (session.user.role === "SALES_REPRESENTATIVE") {
    if (parsed.data.threadType !== "SALES_ESCALATION") {
      return { error: "Sales representatives can only create escalation threads" };
    }
    const inScope =
      lead?.salesRepresentativeId === session.user.id ||
      business?.sourceSalesRepresentativeId === session.user.id ||
      dealPipeline?.sourceSalesRepresentativeId === session.user.id;
    if (!inScope) {
      return { error: "You can only create threads for your own leads or businesses" };
    }
  }

  if (
    parsed.data.threadType === "INTERNAL_ADMIN_NOTE" &&
    !isAdministratorRole(session.user.role)
  ) {
    return { error: "Only administrators can create internal administrator notes" };
  }

  const visibilityScope = getVisibilityScope(parsed.data.threadType);

  const thread = await prisma.communicationThread.create({
    data: {
      threadType: parsed.data.threadType,
      visibilityScope,
      businessId: parsed.data.businessId ?? null,
      leadId: parsed.data.leadId ?? null,
      dealPipelineId: parsed.data.dealPipelineId ?? null,
      createdByUserId: session.user.id,
      recipientRole: getRecipientRole(parsed.data.threadType, session.user.role),
      subject: parsed.data.subject ?? null,
      status: "OPEN",
      lastMessageAt: new Date(),
      lastRespondedByRole: session.user.role,
      messages: {
        create: {
          authorUserId: session.user.id,
          body: parsed.data.body,
          isSystemMessage: false,
        },
      },
    },
    include: threadAccessInclude,
  });

  if (parsed.data.threadType === "BUSINESS_SUPPORT") {
    await logActivity({
      entityType: "CommunicationThread",
      entityId: thread.id,
      actionType: "SUPPORT_REQUESTED",
      actorUserId: session.user.id,
      metadata: { businessId: thread.businessId },
    });
  } else if (parsed.data.threadType === "SALES_ESCALATION") {
    await logActivity({
      entityType: "CommunicationThread",
      entityId: thread.id,
      actionType: "ESCALATION_CREATED",
      actorUserId: session.user.id,
      metadata: { leadId: thread.leadId, businessId: thread.businessId },
    });
  } else {
    await logActivity({
      entityType: "CommunicationThread",
      entityId: thread.id,
      actionType: "INTERNAL_ADMIN_NOTE_CREATED",
      actorUserId: session.user.id,
      metadata: { businessId: thread.businessId, leadId: thread.leadId },
    });
  }

  if (parsed.data.threadType === "BUSINESS_SUPPORT") {
    if (isAdministratorRole(session.user.role) && thread.businessId) {
      const businessUserIds = await getBusinessUserIds(thread.businessId, session.user.id);
      await notifyUsers({
        userIds: businessUserIds,
        title: "Support update",
        message: parsed.data.subject ?? "A support thread was created",
        link: "/business/dashboard",
      });
    } else {
      const adminIds = await getAdministratorIds(session.user.id);
      await notifyUsers({
        userIds: adminIds,
        title: "Business support request",
        message: parsed.data.subject ?? "A business needs support",
        link: "/admin/communications",
      });
    }
  }

  if (parsed.data.threadType === "SALES_ESCALATION") {
    if (isAdministratorRole(session.user.role)) {
      const salesIds = await getSalesRepresentativeIds(thread, session.user.id);
      await notifyUsers({
        userIds: salesIds,
        title: "Escalation update",
        message: parsed.data.subject ?? "Administrator responded to an escalation",
        link: "/sales/dashboard",
      });
    } else {
      const adminIds = await getAdministratorIds(session.user.id);
      await notifyUsers({
        userIds: adminIds,
        title: "Sales escalation",
        message: parsed.data.subject ?? "A sales representative needs help",
        link: "/admin/communications",
      });
    }
  }

  if (parsed.data.threadType === "INTERNAL_ADMIN_NOTE") {
    const adminIds = await getAdministratorIds(session.user.id);
    await notifyUsers({
      userIds: adminIds,
      title: "Internal administrator note",
      message: parsed.data.subject ?? "A new internal note was added",
      link: "/admin/communications",
    });
  }

  revalidateCommunicationPaths(thread);
  return { success: true, threadId: thread.id };
}

export async function replyToCommunicationThread(formData: FormData) {
  const session = await requireAuth();
  const parsed = communicationReplySchema.safeParse({
    threadId: formData.get("threadId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const threadResult = await getThreadForUser(parsed.data.threadId, session.user);
  if ("error" in threadResult) return { error: threadResult.error };
  const thread = threadResult.thread;

  await prisma.communicationMessage.create({
    data: {
      threadId: thread.id,
      authorUserId: session.user.id,
      body: parsed.data.body,
      isSystemMessage: false,
    },
  });

  const status = getNextStatusAfterReply(thread.threadType, session.user.role);
  const recipientRole = getRecipientRole(thread.threadType, session.user.role);

  await prisma.communicationThread.update({
    where: { id: thread.id },
    data: {
      status,
      recipientRole,
      lastMessageAt: new Date(),
      lastRespondedByRole: session.user.role,
    },
  });

  await logActivity({
    entityType: "CommunicationThread",
    entityId: thread.id,
    actionType: "COMMUNICATION_THREAD_REPLIED",
    actorUserId: session.user.id,
    metadata: { status },
  });

  if (thread.threadType === "BUSINESS_SUPPORT") {
    if (isAdministratorRole(session.user.role) && thread.businessId) {
      const businessUserIds = await getBusinessUserIds(thread.businessId, session.user.id);
      await notifyUsers({
        userIds: businessUserIds,
        title: "Support reply",
        message: parsed.data.body.slice(0, 120),
        link: "/business/dashboard",
      });
    } else {
      const adminIds = await getAdministratorIds(session.user.id);
      await notifyUsers({
        userIds: adminIds,
        title: "Business support reply",
        message: parsed.data.body.slice(0, 120),
        link: "/admin/communications",
      });
    }
  }

  if (thread.threadType === "SALES_ESCALATION") {
    if (isAdministratorRole(session.user.role)) {
      const salesIds = await getSalesRepresentativeIds(thread, session.user.id);
      await notifyUsers({
        userIds: salesIds,
        title: "Escalation reply",
        message: parsed.data.body.slice(0, 120),
        link: "/sales/dashboard",
      });
    } else {
      const adminIds = await getAdministratorIds(session.user.id);
      await notifyUsers({
        userIds: adminIds,
        title: "Sales escalation reply",
        message: parsed.data.body.slice(0, 120),
        link: "/admin/communications",
      });
    }
  }

  if (thread.threadType === "INTERNAL_ADMIN_NOTE") {
    const adminIds = await getAdministratorIds(session.user.id);
    await notifyUsers({
      userIds: adminIds,
      title: "Internal administrator note update",
      message: parsed.data.body.slice(0, 120),
      link: "/admin/communications",
    });
  }

  revalidateCommunicationPaths(thread);
  return { success: true };
}

export async function updateCommunicationThreadStatus(formData: FormData) {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);
  const parsed = communicationStatusSchema.safeParse({
    threadId: formData.get("threadId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const thread = await prisma.communicationThread.findUnique({
    where: { id: parsed.data.threadId },
    include: threadAccessInclude,
  });
  if (!thread) return { error: "Thread not found" };

  await prisma.communicationThread.update({
    where: { id: thread.id },
    data: { status: parsed.data.status },
  });

  if (parsed.data.status === "RESOLVED") {
    await logActivity({
      entityType: "CommunicationThread",
      entityId: thread.id,
      actionType: "COMMUNICATION_THREAD_RESOLVED",
      actorUserId: session.user.id,
      metadata: { threadType: thread.threadType },
    });
  } else if (parsed.data.status === "CLOSED") {
    await logActivity({
      entityType: "CommunicationThread",
      entityId: thread.id,
      actionType: "COMMUNICATION_THREAD_CLOSED",
      actorUserId: session.user.id,
      metadata: { threadType: thread.threadType },
    });
  }

  if (thread.threadType === "BUSINESS_SUPPORT" && thread.businessId) {
    const businessUserIds = await getBusinessUserIds(thread.businessId, session.user.id);
    await notifyUsers({
      userIds: businessUserIds,
      title: "Support status updated",
      message: `Thread marked ${parsed.data.status.toLowerCase()}`,
      link: "/business/dashboard",
    });
  }

  if (thread.threadType === "SALES_ESCALATION") {
    const salesIds = await getSalesRepresentativeIds(thread, session.user.id);
    await notifyUsers({
      userIds: salesIds,
      title: "Escalation status updated",
      message: `Thread marked ${parsed.data.status.toLowerCase()}`,
      link: "/sales/dashboard",
    });
  }

  revalidateCommunicationPaths(thread);
  return { success: true };
}
