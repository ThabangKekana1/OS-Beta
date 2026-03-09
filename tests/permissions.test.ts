import { describe, it, expect } from "vitest";
import { hasPermission, canViewDocument, isAdmin, isSuperAdmin, getPermissions } from "../src/lib/permissions";

describe("Role-based Permissions", () => {
  describe("SUPER_ADMIN", () => {
    it("can manage users", () => {
      expect(hasPermission("SUPER_ADMIN", "users:manage")).toBe(true);
    });
    it("can manage stage settings", () => {
      expect(hasPermission("SUPER_ADMIN", "settings:manage_stages")).toBe(true);
    });
    it("can view all deals", () => {
      expect(hasPermission("SUPER_ADMIN", "deals:view_all")).toBe(true);
    });
    it("can advance stages", () => {
      expect(hasPermission("SUPER_ADMIN", "deals:advance_stage")).toBe(true);
    });
    it("can review documents", () => {
      expect(hasPermission("SUPER_ADMIN", "documents:review")).toBe(true);
    });
  });

  describe("ADMINISTRATOR", () => {
    it("can view all businesses", () => {
      expect(hasPermission("ADMINISTRATOR", "businesses:view_all")).toBe(true);
    });
    it("can advance stages", () => {
      expect(hasPermission("ADMINISTRATOR", "deals:advance_stage")).toBe(true);
    });
    it("can stall deals", () => {
      expect(hasPermission("ADMINISTRATOR", "deals:stall")).toBe(true);
    });
    it("cannot manage users", () => {
      expect(hasPermission("ADMINISTRATOR", "users:manage")).toBe(false);
    });
    it("cannot manage stage settings", () => {
      expect(hasPermission("ADMINISTRATOR", "settings:manage_stages")).toBe(false);
    });
    it("can create internal notes", () => {
      expect(hasPermission("ADMINISTRATOR", "notes:create_internal")).toBe(true);
    });
  });

  describe("SALES_REPRESENTATIVE", () => {
    it("can create leads", () => {
      expect(hasPermission("SALES_REPRESENTATIVE", "leads:create")).toBe(true);
    });
    it("can view own leads", () => {
      expect(hasPermission("SALES_REPRESENTATIVE", "leads:view_own")).toBe(true);
    });
    it("can view attributed businesses", () => {
      expect(hasPermission("SALES_REPRESENTATIVE", "businesses:view_attributed")).toBe(true);
    });
    it("cannot view all businesses", () => {
      expect(hasPermission("SALES_REPRESENTATIVE", "businesses:view_all")).toBe(false);
    });
    it("cannot advance stages", () => {
      expect(hasPermission("SALES_REPRESENTATIVE", "deals:advance_stage")).toBe(false);
    });
    it("cannot create internal notes", () => {
      expect(hasPermission("SALES_REPRESENTATIVE", "notes:create_internal")).toBe(false);
    });
    it("cannot view internal notes", () => {
      expect(hasPermission("SALES_REPRESENTATIVE", "notes:view_internal")).toBe(false);
    });
    it("cannot review documents", () => {
      expect(hasPermission("SALES_REPRESENTATIVE", "documents:review")).toBe(false);
    });
    it("can escalate", () => {
      expect(hasPermission("SALES_REPRESENTATIVE", "escalate")).toBe(true);
    });
  });

  describe("BUSINESS_USER", () => {
    it("can view own businesses", () => {
      expect(hasPermission("BUSINESS_USER", "businesses:view_own")).toBe(true);
    });
    it("can upload own documents", () => {
      expect(hasPermission("BUSINESS_USER", "documents:upload_own")).toBe(true);
    });
    it("cannot view all businesses", () => {
      expect(hasPermission("BUSINESS_USER", "businesses:view_all")).toBe(false);
    });
    it("cannot view internal notes", () => {
      expect(hasPermission("BUSINESS_USER", "notes:view_internal")).toBe(false);
    });
    it("cannot create internal notes", () => {
      expect(hasPermission("BUSINESS_USER", "notes:create_internal")).toBe(false);
    });
    it("cannot advance stages", () => {
      expect(hasPermission("BUSINESS_USER", "deals:advance_stage")).toBe(false);
    });
    it("cannot manage users", () => {
      expect(hasPermission("BUSINESS_USER", "users:manage")).toBe(false);
    });
  });

  describe("Document visibility", () => {
    it("blocks KYC documents from sales reps", () => {
      expect(canViewDocument("SALES_REPRESENTATIVE", "KYC_DOCUMENT_PACK")).toBe(false);
    });
    it("allows KYC documents for administrators", () => {
      expect(canViewDocument("ADMINISTRATOR", "KYC_DOCUMENT_PACK")).toBe(true);
    });
    it("allows KYC documents for business users", () => {
      expect(canViewDocument("BUSINESS_USER", "KYC_DOCUMENT_PACK")).toBe(true);
    });
    it("allows non-KYC documents for sales reps", () => {
      expect(canViewDocument("SALES_REPRESENTATIVE", "FOUNDATION_ONE_CONTRACT")).toBe(true);
    });
  });

  describe("Role checks", () => {
    it("identifies administrators", () => {
      expect(isAdmin("ADMINISTRATOR")).toBe(true);
      expect(isAdmin("SUPER_ADMIN")).toBe(true);
      expect(isAdmin("SALES_REPRESENTATIVE")).toBe(false);
      expect(isAdmin("BUSINESS_USER")).toBe(false);
    });
    it("identifies super admins", () => {
      expect(isSuperAdmin("SUPER_ADMIN")).toBe(true);
      expect(isSuperAdmin("ADMINISTRATOR")).toBe(false);
    });
  });
});
