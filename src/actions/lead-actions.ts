"use server";

import { requireRole } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { leadSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

export async function createLead(formData: FormData) {
  const session = await requireRole(["SALES_REPRESENTATIVE"]);

  const parsed = leadSchema.safeParse({
    businessName: formData.get("businessName"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const existing = await prisma.lead.findFirst({
    where: {
      contactEmail: parsed.data.contactEmail,
      salesRepresentativeId: session.user.id,
    },
  });

  if (existing) {
    return { error: "A lead with this email already exists in your pipeline" };
  }

  const lead = await prisma.lead.create({
    data: {
      salesRepresentativeId: session.user.id,
      businessName: parsed.data.businessName,
      contactName: parsed.data.contactName,
      contactEmail: parsed.data.contactEmail,
      contactPhone: parsed.data.contactPhone ?? null,
      status: "NEW",
    },
  });

  await logActivity({
    entityType: "Lead",
    entityId: lead.id,
    actionType: "LEAD_CREATED",
    actorUserId: session.user.id,
    metadata: { businessName: parsed.data.businessName },
  });

  revalidatePath("/sales/leads");
  revalidatePath("/sales/dashboard");
  return { success: true, leadId: lead.id };
}

export async function sendInviteLink(leadId: string) {
  const session = await requireRole(["SALES_REPRESENTATIVE"]);

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, salesRepresentativeId: session.user.id },
  });

  if (!lead) return { error: "Lead not found" };

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "INVITE_SENT", inviteSentAt: new Date() },
  });

  await logActivity({
    entityType: "Lead",
    entityId: leadId,
    actionType: "LEAD_INVITE_SENT",
    actorUserId: session.user.id,
  });

  revalidatePath("/sales/leads");
  return { success: true };
}

export async function killLead(leadId: string, reason: string) {
  const session = await requireRole(["SALES_REPRESENTATIVE"]);

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, salesRepresentativeId: session.user.id },
  });

  if (!lead) return { error: "Lead not found" };

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "DEAD", deadReason: reason },
  });

  await logActivity({
    entityType: "Lead",
    entityId: leadId,
    actionType: "LEAD_KILLED",
    actorUserId: session.user.id,
    metadata: { reason },
  });

  revalidatePath("/sales/leads");
  return { success: true };
}
