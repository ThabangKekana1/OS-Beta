import { describe, expect, it } from "vitest";
import { getDashboardRoute } from "@/lib/dashboard-routes";

describe("getDashboardRoute", () => {
  it("routes super administrators and administrators to the admin dashboard", () => {
    expect(getDashboardRoute("SUPER_ADMIN")).toBe("/admin/dashboard");
    expect(getDashboardRoute("ADMINISTRATOR")).toBe("/admin/dashboard");
  });

  it("routes sales representatives to the sales dashboard", () => {
    expect(getDashboardRoute("SALES_REPRESENTATIVE")).toBe("/sales/dashboard");
  });

  it("routes business users to the business dashboard", () => {
    expect(getDashboardRoute("BUSINESS_USER")).toBe("/business/dashboard");
  });

  it("fails safely for missing roles", () => {
    expect(getDashboardRoute(undefined)).toBeNull();
  });
});
