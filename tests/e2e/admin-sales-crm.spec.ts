import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "";
const salesEmail = process.env.E2E_SALES_EMAIL ?? "";
const salesPassword = process.env.E2E_SALES_PASSWORD ?? "";
const slowStorage = { timeout: 20_000 };

async function login(page: Page, email: string, password: string, role: "admin" | "sales") {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/${role}(?:/|$)`));
}

async function fillRegistrationForm(page: Page, suffix: string) {
  const regDigits = suffix.replace(/\D/g, "").slice(-6).padStart(6, "0");
  await page.getByPlaceholder("1. Business Name").fill(`QA Solar ${suffix}`);
  await page.getByPlaceholder(/Business Registration Number/).fill(`2026/${regDigits}/07`);
  await page.getByPlaceholder("3. Industry").fill("Manufacturing");
  await page.getByPlaceholder("4. Contact Name").fill("Contact");
  await page.getByPlaceholder("5. Contact Surname").fill(suffix);
  await page.getByPlaceholder("6. Position in Company").fill("Managing Director");
  await page.getByPlaceholder("7. Contact Email").fill(`qa-${suffix}@example.com`);
  await page.getByPlaceholder("8. Contact Number").fill("+27820000000");
  await page.getByPlaceholder("9. Monthly Electricity Spend (ZAR)").fill("125000");
  await page.getByPlaceholder("13. Physical Address").fill("123 QA Street");
  await page.getByPlaceholder("14. City").fill("Johannesburg");
  await page.locator('select').filter({ hasText: '15. Province' }).selectOption('Gauteng');
}

function textFile(name: string, body: string) {
  return {
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(body, "utf8"),
  };
}

async function clearSession(page: Page, context: BrowserContext) {
  await page.waitForTimeout(900);
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear()).catch(() => undefined);
}

test.describe("CRM registration and document lifecycle", () => {
  test.describe.configure({ timeout: 180_000 });

  test("admin and sales can create leads, update status, and admin repository keeps them", async ({ page, context }) => {
    test.skip(
      !adminEmail || !adminPassword || !salesEmail || !salesPassword,
      "Set E2E admin and sales credentials to run this test.",
    );

    const suffix = String(Date.now()).slice(-6);
    const adminLeadCompany = `Admin Repo ${suffix}`;
    const salesLeadCompany = `Sales Repo ${suffix}`;

    await login(page, adminEmail, adminPassword, "admin");
    await page.goto("/admin/leads");
    await page.getByPlaceholder("Contact Name").fill(`Admin Contact ${suffix}`);
    await page.getByPlaceholder("Company").fill(adminLeadCompany);
    await page.getByPlaceholder("Email Address").fill(`admin-repo-${suffix}@example.com`);
    await page.getByRole("button", { name: "Add Lead" }).click();
    const adminLeadRow = page.locator("tr", { hasText: adminLeadCompany });
    await expect(adminLeadRow).toBeVisible();
    await adminLeadRow.locator("select").selectOption("Contacted");
    await expect(adminLeadRow).toContainText("Contacted");

    await page.goto("/admin/repository");
    await expect(page.locator("tr", { hasText: adminLeadCompany })).toContainText("Contacted");

    await clearSession(page, context);
    await login(page, salesEmail, salesPassword, "sales");
    await page.goto("/sales/leads");
    await expect(page.getByRole("link", { name: /Repository/i })).toHaveCount(0);
    await page.getByPlaceholder("Contact Name").fill(`Sales Contact ${suffix}`);
    await page.getByPlaceholder("Company").fill(salesLeadCompany);
    await page.getByPlaceholder("Email Address").fill(`sales-repo-${suffix}@example.com`);
    await page.getByRole("button", { name: "Add Lead" }).click();
    const salesLeadRow = page.locator("tr", { hasText: salesLeadCompany });
    await expect(salesLeadRow).toBeVisible();
    await salesLeadRow.locator("select").selectOption("Interested");
    await expect(salesLeadRow).toContainText("Interested");

    await clearSession(page, context);
    await login(page, adminEmail, adminPassword, "admin");
    await page.goto("/admin/repository");
    await expect(page.locator("tr", { hasText: salesLeadCompany })).toContainText("Interested");
  });

  test("registration enforces South African company registration number format", async ({ page }) => {
    test.skip(
      !adminEmail || !adminPassword,
      "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test.",
    );

    await login(page, adminEmail, adminPassword, "admin");
    await page.goto("/admin/registration");
    const suffix = String(Date.now()).slice(-6);
    await fillRegistrationForm(page, suffix);
    await page.getByPlaceholder(/Business Registration Number/).fill("2026/12345/07");
    await expect(page.getByRole("button", { name: "Register Client" })).toBeDisabled();

    await page.getByPlaceholder(/Business Registration Number/).fill("2026/123456/07");
    await expect(page.getByRole("button", { name: "Register Client" })).toBeEnabled();
  });

  test("admin can register client and download uploaded file bytes", async ({ page }) => {
    test.skip(
      !adminEmail || !adminPassword,
      "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test.",
    );

    await login(page, adminEmail, adminPassword, "admin");

    await page.goto("/admin/registration");
    const suffix = String(Date.now()).slice(-6);
    await fillRegistrationForm(page, suffix);
    await page.getByRole("button", { name: "Register Client" }).click();

    await expect(page).toHaveURL(/\/admin\/leads\/[^/]+$/);
    await expect(page.getByRole("heading", { name: `QA Solar ${suffix}`, exact: true })).toBeVisible();

    const uploadSection = page.locator("section").filter({ hasText: "Upload Document" });
    const uploadTitle = `QA Upload ${suffix}`;
    const fileName = `qa-upload-${suffix}.txt`;
    const fileBody = `uploaded-bytes-${suffix}`;

    await uploadSection.getByPlaceholder("Document title").fill(uploadTitle);
    await uploadSection
      .locator('input[type="file"]')
      .setInputFiles({
        name: fileName,
        mimeType: "text/plain",
        buffer: Buffer.from(fileBody, "utf8"),
      });
    await uploadSection.getByRole("button", { name: "Upload" }).click();

    await expect(page.getByText(`${uploadTitle} uploaded to the client profile.`)).toBeVisible(slowStorage);

    const row = page.locator("tr", { hasText: uploadTitle }).first();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      row.getByRole("button", { name: "Download" }).click(),
    ]);

    expect(download.suggestedFilename()).toBe(fileName);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const downloaded = readFileSync(downloadPath ?? "", "utf8");
    expect(downloaded).toBe(fileBody);
  });

  test("sales can register client with the same registration form and flow", async ({ page }) => {
    test.skip(
      !salesEmail || !salesPassword,
      "Set E2E_SALES_EMAIL and E2E_SALES_PASSWORD to run this test.",
    );

    await login(page, salesEmail, salesPassword, "sales");

    await page.goto("/sales/registration");
    const suffix = String(Date.now()).slice(-6);
    await fillRegistrationForm(page, suffix);
    await page.getByRole("button", { name: "Register Client" }).click();

    await expect(page).toHaveURL(/\/sales\/clients\/[^/]+$/);
    await expect(page.getByRole("heading", { name: `QA Solar ${suffix}`, exact: true })).toBeVisible();
  });

  test("admin and sales can complete the full onboarding document exchange", async ({ page, context }) => {
    test.skip(
      !adminEmail || !adminPassword || !salesEmail || !salesPassword,
      "Set E2E admin and sales credentials to run this test.",
    );

    const suffix = String(Date.now()).slice(-6);
    const company = `QA Onboard ${suffix}`;
    const proposalBody = `proposal-bytes-${suffix}`;
    const termBody = `term-sheet-bytes-${suffix}`;

    await login(page, adminEmail, adminPassword, "admin");
    await page.goto("/admin/registration");
    await fillRegistrationForm(page, suffix);
    await page.getByPlaceholder("1. Business Name").fill(company);
    await page.getByRole("button", { name: "Register Client" }).click();
    await expect(page).toHaveURL(/\/admin\/leads\/[^/]+$/);
    const adminProfileUrl = page.url();
    const profileId = adminProfileUrl.split("/").pop() ?? "";

    await page.getByRole("button", { name: "Generate EOI" }).click();
    await expect(page.getByText("EOI generated from the template and signing link is active.")).toBeVisible(slowStorage);
    const eoiRow = page.locator("tr", { hasText: "Expression of Interest" }).first();
    const [eoiDownload] = await Promise.all([
      page.waitForEvent("download"),
      eoiRow.getByRole("button", { name: "Download" }).click(),
    ]);
    const eoiPath = await eoiDownload.path();
    expect(readFileSync(eoiPath ?? "", "utf8")).toContain(company);
    expect(readFileSync(eoiPath ?? "", "utf8")).toContain("2026/");

    const signingHref = await page.getByRole("link", { name: "Open Client Signing Page" }).getAttribute("href");
    expect(signingHref).toBeTruthy();
    await page.goto(signingHref ?? "");
    await expect(page.getByRole("heading", { name: `Review EOI for ${company}` })).toBeVisible();
    await expect(page.getByText("Expression of Interest: Renewable Energy Supply")).toBeVisible();
    await page.getByLabel("Approve Expression of Interest").check();
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("EOI approved")).toBeVisible(slowStorage);

    await clearSession(page, context);
    await login(page, salesEmail, salesPassword, "sales");
    await page.goto(`/sales/clients/${profileId}`);
    await expect(page.getByRole("heading", { name: company, exact: true })).toBeVisible();
    await page.locator('input[aria-label="Utility bill file"]').setInputFiles(
      textFile(`utility-${suffix}.txt`, `utility-bytes-${suffix}`),
    );
    await page.getByRole("button", { name: "Submit Utility Bills" }).click();
    await expect(page.getByText("Utility bills submitted.")).toBeVisible(slowStorage);

    await clearSession(page, context);
    await login(page, adminEmail, adminPassword, "admin");
    await page.goto(`/admin/clients/${profileId}`);
    await page.locator('input[aria-label="Proposal file"]').setInputFiles(
      textFile(`proposal-${suffix}.txt`, proposalBody),
    );
    await page.getByRole("button", { name: "Upload Proposal" }).click();
    await expect(page.getByText("Proposal uploaded for sales download.")).toBeVisible(slowStorage);
    await page.goto("/admin/notifications");
    await expect(page.getByText("Proposal issued by admin").first()).toBeVisible();

    await clearSession(page, context);
    await login(page, salesEmail, salesPassword, "sales");
    await page.goto(`/sales/clients/${profileId}`);
    const [proposalDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download Proposal" }).click(),
    ]);
    expect(readFileSync((await proposalDownload.path()) ?? "", "utf8")).toBe(proposalBody);
    await page.locator('input[aria-label="Signed proposal file"]').setInputFiles(
      textFile(`signed-proposal-${suffix}.txt`, `signed-${proposalBody}`),
    );
    await page.getByRole("button", { name: "Upload Signed Proposal" }).click();
    await expect(page.getByText("Signed proposal submitted.")).toBeVisible(slowStorage);
    await page.goto("/sales/notifications");
    await expect(page.getByText("Proposal issued by admin").first()).toBeVisible();

    await clearSession(page, context);
    await login(page, adminEmail, adminPassword, "admin");
    await page.goto(`/admin/clients/${profileId}`);
    await page.locator('input[aria-label="Term sheet file"]').setInputFiles(
      textFile(`term-sheet-${suffix}.txt`, termBody),
    );
    await page.getByRole("button", { name: "Upload Term Sheet" }).click();
    await expect(page.getByText("Term sheet uploaded for sales download.")).toBeVisible(slowStorage);
    await page.goto("/admin/notifications");
    await expect(page.getByText("Signed proposal submitted by sales").first()).toBeVisible();

    await clearSession(page, context);
    await login(page, salesEmail, salesPassword, "sales");
    await page.goto(`/sales/clients/${profileId}`);
    const [termDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download Term Sheet" }).click(),
    ]);
    expect(readFileSync((await termDownload.path()) ?? "", "utf8")).toBe(termBody);
    await page.locator('input[aria-label="Signed term sheet file"]').setInputFiles(
      textFile(`signed-term-sheet-${suffix}.txt`, `signed-${termBody}`),
    );
    await page.getByRole("button", { name: "Upload Signed Term Sheet" }).click();
    await expect(page.getByText("Signed term sheet submitted.")).toBeVisible(slowStorage);

    await clearSession(page, context);
    await login(page, adminEmail, adminPassword, "admin");
    await page.goto(`/admin/clients/${profileId}`);
    await page.getByRole("button", { name: "Mark Onboarding Complete" }).click();
    await expect(page.locator("span", { hasText: "Onboarding Complete" }).first()).toBeVisible();
  });
});
