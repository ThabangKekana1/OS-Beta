import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const leadSchema = z.object({
  businessName: z.string().min(1, "Business name required"),
  contactName: z.string().min(1, "Contact name required"),
  contactEmail: z.string().email("Valid email required"),
  contactPhone: z.string().optional(),
});

export const businessRegistrationSchema = z.object({
  legalName: z.string().min(1, "Legal name required"),
  tradingName: z.string().optional(),
  registrationNumber: z.string().min(1, "Registration number required"),
  industry: z.string().optional(),
  monthlyElectricitySpendEstimate: z.number().min(0).optional(),
  contactPersonName: z.string().min(1, "Contact name required"),
  contactPersonEmail: z.string().email("Valid email required"),
  contactPersonPhone: z.string().optional(),
  physicalAddress: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const stageTransitionSchema = z.object({
  dealPipelineId: z.string().min(1),
  toStageCode: z.string().min(1),
  note: z.string().optional(),
});

export const stallDealSchema = z.object({
  dealPipelineId: z.string().min(1),
  stallReasonCode: z.string().min(1),
  note: z.string().optional(),
});

export const documentUploadSchema = z.object({
  businessId: z.string().min(1),
  dealPipelineId: z.string().optional(),
  documentTypeCode: z.string().min(1),
  fileUrl: z.string().min(1),
  originalFileName: z.string().min(1),
  mimeType: z.string().optional(),
  fileSize: z.number().optional(),
});

export const documentReviewSchema = z.object({
  documentSubmissionId: z.string().min(1),
  status: z.enum(["APPROVED", "REJECTED"]),
  rejectionReason: z.string().optional(),
});

export const documentRequestSchema = z.object({
  businessId: z.string().min(1),
  exchangePhase: z.enum([
    "EXPRESSION_OF_INTEREST",
    "UTILITY_BILL",
    "PROPOSAL",
    "TERM_SHEET",
    "KNOW_YOUR_CUSTOMER",
  ]),
});

export const documentDeliverySchema = documentRequestSchema.extend({
  originalFileName: z.string().min(1, "File name required"),
  fileUrl: z.string().min(1, "File URL required"),
  publishToBusiness: z.enum(["true", "false"]).optional(),
});

export const businessDocumentResponseSchema = z.object({
  businessId: z.string().min(1),
  dealPipelineId: z.string().optional(),
  exchangePhase: z.enum([
    "EXPRESSION_OF_INTEREST",
    "UTILITY_BILL",
    "PROPOSAL",
    "TERM_SHEET",
    "KNOW_YOUR_CUSTOMER",
  ]),
  parentSubmissionId: z.string().optional(),
  originalFileName: z.string().min(1, "File name required"),
  fileUrl: z.string().min(1, "File URL required"),
});

export const taskSchema = z.object({
  dealPipelineId: z.string().optional(),
  businessId: z.string().optional(),
  assignedToUserId: z.string().optional(),
  title: z.string().min(1, "Title required"),
  description: z.string().optional(),
  taskType: z.string().optional(),
  dueAt: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  ownerRole: z.enum(["SUPER_ADMIN", "ADMINISTRATOR", "SALES_REPRESENTATIVE", "BUSINESS_USER"]).optional(),
});

export const noteSchema = z.object({
  dealPipelineId: z.string().optional(),
  businessId: z.string().optional(),
  noteType: z.enum(["INTERNAL", "CUSTOMER_VISIBLE"]),
  body: z.string().min(1, "Note body required"),
});

export const disqualifySchema = z.object({
  businessId: z.string().min(1),
  reason: z.string().min(1, "Disqualification reason required"),
});

export const userCreateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["SUPER_ADMIN", "ADMINISTRATOR", "SALES_REPRESENTATIVE", "BUSINESS_USER"]),
  password: z.string().min(8),
});

export const assignAdminSchema = z.object({
  businessId: z.string().min(1),
  administratorId: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type LeadInput = z.infer<typeof leadSchema>;
export type BusinessRegistrationInput = z.infer<typeof businessRegistrationSchema>;
export type StageTransitionInput = z.infer<typeof stageTransitionSchema>;
export type StallDealInput = z.infer<typeof stallDealSchema>;
export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
export type DocumentReviewInput = z.infer<typeof documentReviewSchema>;
export type DocumentRequestInput = z.infer<typeof documentRequestSchema>;
export type DocumentDeliveryInput = z.infer<typeof documentDeliverySchema>;
export type BusinessDocumentResponseInput = z.infer<typeof businessDocumentResponseSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
