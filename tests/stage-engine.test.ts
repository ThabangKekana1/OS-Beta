import { describe, it, expect, vi } from "vitest";

// Mock prisma before importing stage-engine
vi.mock("../src/lib/prisma", () => ({
  default: {},
  __esModule: true,
}));

import { canTransitionStage, computeStageAge, computeHealthStatus } from "../src/lib/stage-engine";

describe("Stage Engine", () => {
  describe("canTransitionStage", () => {
    it("allows admin to advance to next sequential stage", () => {
      const result = canTransitionStage("LEAD_SOURCED", "REGISTRATION_LINK_SENT", "ADMINISTRATOR");
      expect(result.allowed).toBe(true);
    });

    it("allows admin to skip stages forward", () => {
      const result = canTransitionStage("LEAD_SOURCED", "BUSINESS_REGISTERED", "ADMINISTRATOR");
      expect(result.allowed).toBe(true);
    });

    it("blocks backward transitions for admin", () => {
      const result = canTransitionStage("BUSINESS_REGISTERED", "LEAD_SOURCED", "ADMINISTRATOR");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("backwards");
    });

    it("blocks transitions from terminal stages", () => {
      const result = canTransitionStage("DISQUALIFIED", "LEAD_SOURCED", "ADMINISTRATOR");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("terminal");
    });

    it("allows admin to disqualify", () => {
      const result = canTransitionStage("APPLICATION_COMPLETED", "DISQUALIFIED", "ADMINISTRATOR");
      expect(result.allowed).toBe(true);
    });

    it("allows admin to mark as lost", () => {
      const result = canTransitionStage("PROPOSAL_DELIVERED_TO_BUSINESS", "LOST", "ADMINISTRATOR");
      expect(result.allowed).toBe(true);
    });

    it("blocks non-admin from disqualifying", () => {
      const result = canTransitionStage("APPLICATION_COMPLETED", "DISQUALIFIED", "SALES_REPRESENTATIVE");
      expect(result.allowed).toBe(false);
    });

    it("blocks sales rep from advancing past registration", () => {
      const result = canTransitionStage("BUSINESS_REGISTERED", "APPLICATION_COMPLETED", "SALES_REPRESENTATIVE");
      expect(result.allowed).toBe(false);
    });

    it("allows sales rep to advance to registration link sent", () => {
      const result = canTransitionStage("LEAD_SOURCED", "REGISTRATION_LINK_SENT", "SALES_REPRESENTATIVE");
      expect(result.allowed).toBe(true);
    });

    it("allows business user to trigger eligible stages", () => {
      const result = canTransitionStage(
        "EXPRESSION_OF_INTEREST_REQUESTED",
        "EXPRESSION_OF_INTEREST_UPLOADED",
        "BUSINESS_USER"
      );
      expect(result.allowed).toBe(true);
    });

    it("blocks business user from non-triggerable stages", () => {
      const result = canTransitionStage(
        "EXPRESSION_OF_INTEREST_UPLOADED",
        "EXPRESSION_OF_INTEREST_SENT_TO_PARTNER",
        "BUSINESS_USER"
      );
      expect(result.allowed).toBe(false);
    });

    it("blocks non-sequential advance for non-admin", () => {
      const result = canTransitionStage("LEAD_SOURCED", "APPLICATION_COMPLETED", "BUSINESS_USER");
      expect(result.allowed).toBe(false);
    });
  });

  describe("computeStageAge", () => {
    it("computes hours and days correctly", () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const result = computeStageAge(twoHoursAgo);
      expect(result.hours).toBe(2);
      expect(result.days).toBe(0);
      expect(result.label).toBe("2h");
    });

    it("shows days for longer durations", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const result = computeStageAge(threeDaysAgo);
      expect(result.days).toBe(3);
      expect(result.label).toBe("3d");
    });
  });

  describe("computeHealthStatus", () => {
    it("returns STALLED when stalled", () => {
      expect(computeHealthStatus(new Date(), 48, true)).toBe("STALLED");
    });

    it("returns HEALTHY when within target", () => {
      const recent = new Date(Date.now() - 1 * 60 * 60 * 1000);
      expect(computeHealthStatus(recent, 48, false)).toBe("HEALTHY");
    });

    it("returns AT_RISK when over target", () => {
      const overTarget = new Date(Date.now() - 50 * 60 * 60 * 1000);
      expect(computeHealthStatus(overTarget, 48, false)).toBe("AT_RISK");
    });

    it("returns OVERDUE when far over target", () => {
      const wayOver = new Date(Date.now() - 80 * 60 * 60 * 1000);
      expect(computeHealthStatus(wayOver, 48, false)).toBe("OVERDUE");
    });

    it("returns HEALTHY when no target set", () => {
      const old = new Date(Date.now() - 999 * 60 * 60 * 1000);
      expect(computeHealthStatus(old, null, false)).toBe("HEALTHY");
    });
  });
});
