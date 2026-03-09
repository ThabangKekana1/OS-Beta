"use server";

import { requireAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { noteSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

export async function createNote(formData: FormData) {
  const session = await requireAuth();

  const parsed = noteSchema.safeParse({
    dealPipelineId: formData.get("dealPipelineId") || undefined,
    businessId: formData.get("businessId") || undefined,
    noteType: formData.get("noteType") || "INTERNAL",
    body: formData.get("body"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (parsed.data.noteType === "INTERNAL" && session.user.role === "BUSINESS_USER") {
    return { error: "Business users cannot create internal notes" };
  }

  if (parsed.data.noteType === "INTERNAL" && session.user.role === "SALES_REPRESENTATIVE") {
    return { error: "Sales representatives cannot create internal notes" };
  }

  const note = await prisma.note.create({
    data: {
      dealPipelineId: parsed.data.dealPipelineId,
      businessId: parsed.data.businessId,
      authorUserId: session.user.id,
      noteType: parsed.data.noteType,
      body: parsed.data.body,
    },
  });

  await logActivity({
    entityType: "Note",
    entityId: note.id,
    actionType: "NOTE_CREATED",
    actorUserId: session.user.id,
    metadata: { noteType: parsed.data.noteType },
  });

  revalidatePath("/admin/businesses");
  return { success: true };
}
