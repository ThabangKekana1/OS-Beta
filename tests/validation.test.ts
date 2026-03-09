import { describe, it, expect } from "vitest";
import {
  loginSchema,
  leadSchema,
  businessRegistrationSchema,
  stageTransitionSchema,
  stallDealSchema,
  documentReviewSchema,
  noteSchema,
  disqualifySchema,
} from "../src/lib/validation";

describe("Zod Validation Schemas", () => {
  describe("loginSchema", () => {
    it("accepts valid credentials", () => {
      const result = loginSchema.safeParse({ email: "test@test.com", password: "123456" });
      expect(result.success).toBe(true);
    });
    it("rejects invalid email", () => {
      const result = loginSchema.safeParse({ email: "notanemail", password: "123456" });
      expect(result.success).toBe(false);
    });
    it("rejects short password", () => {
      const result = loginSchema.safeParse({ email: "test@test.com", password: "12" });
      expect(result.success).toBe(false);
    });
  });

  describe("leadSchema", () => {
    it("accepts valid lead", () => {
      const result = leadSchema.safeParse({
        businessName: "Test Corp",
        contactName: "John",
        contactEmail: "john@test.com",
      });
      expect(result.success).toBe(true);
    });
    it("rejects missing business name", () => {
      const result = leadSchema.safeParse({
        businessName: "",
        contactName: "John",
        contactEmail: "john@test.com",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("businessRegistrationSchema", () => {
    it("accepts valid registration", () => {
      const result = businessRegistrationSchema.safeParse({
        legalName: "Test (Pty) Ltd",
        registrationNumber: "2024/001234/07",
        contactPersonName: "John",
        contactPersonEmail: "john@test.com",
        password: "Str0ngP@ss",
      });
      expect(result.success).toBe(true);
    });
    it("rejects short password", () => {
      const result = businessRegistrationSchema.safeParse({
        legalName: "Test",
        registrationNumber: "2024/001234/07",
        contactPersonName: "John",
        contactPersonEmail: "john@test.com",
        password: "short",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("stageTransitionSchema", () => {
    it("requires dealPipelineId and toStageCode", () => {
      expect(stageTransitionSchema.safeParse({ dealPipelineId: "x", toStageCode: "y" }).success).toBe(true);
      expect(stageTransitionSchema.safeParse({ dealPipelineId: "", toStageCode: "y" }).success).toBe(false);
    });
  });

  describe("stallDealSchema", () => {
    it("requires valid stall reason code", () => {
      expect(stallDealSchema.safeParse({ dealPipelineId: "x", stallReasonCode: "CODE" }).success).toBe(true);
      expect(stallDealSchema.safeParse({ dealPipelineId: "x", stallReasonCode: "" }).success).toBe(false);
    });
  });

  describe("documentReviewSchema", () => {
    it("accepts APPROVED status", () => {
      expect(documentReviewSchema.safeParse({ documentSubmissionId: "x", status: "APPROVED" }).success).toBe(true);
    });
    it("accepts REJECTED status", () => {
      expect(documentReviewSchema.safeParse({ documentSubmissionId: "x", status: "REJECTED" }).success).toBe(true);
    });
    it("rejects invalid status", () => {
      expect(documentReviewSchema.safeParse({ documentSubmissionId: "x", status: "INVALID" }).success).toBe(false);
    });
  });

  describe("noteSchema", () => {
    it("accepts valid note", () => {
      expect(noteSchema.safeParse({ noteType: "INTERNAL", body: "Test note" }).success).toBe(true);
    });
    it("rejects empty body", () => {
      expect(noteSchema.safeParse({ noteType: "INTERNAL", body: "" }).success).toBe(false);
    });
  });

  describe("disqualifySchema", () => {
    it("requires businessId and reason", () => {
      expect(disqualifySchema.safeParse({ businessId: "x", reason: "Not viable" }).success).toBe(true);
      expect(disqualifySchema.safeParse({ businessId: "x", reason: "" }).success).toBe(false);
    });
  });
});
