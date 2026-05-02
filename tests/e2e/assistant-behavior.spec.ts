import { expect, test, type Page } from "@playwright/test";

const clientEmail = process.env.E2E_CLIENT_EMAIL ?? "";
const clientPassword = process.env.E2E_CLIENT_PASSWORD ?? "";

async function loginClient(page: Page) {
  await page.goto("/login?next=/workspace");
  await page.locator("#email").fill(clientEmail);
  await page.locator("#password").fill(clientPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/workspace", { timeout: 20_000 });
  await page.reload({ waitUntil: "networkidle" });
}

async function openCase(page: Page, businessName: string, expectedConversationText: RegExp | string) {
  await page.getByText(businessName, { exact: true }).first().click();
  await expect(page.getByText(expectedConversationText).first()).toBeVisible();
}

async function sendWorkspaceMessage(page: Page, message: string) {
  const composer = page.getByPlaceholder(
    "Ask anything about your migration, Foundation-1, Generocity, or Lumen-1...",
  );
  await composer.fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
}

test.describe("assistant behavior", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !clientEmail || !clientPassword,
      "Set E2E_CLIENT_EMAIL and E2E_CLIENT_PASSWORD to run assistant behavior tests.",
    );
    await loginClient(page);
  });

  test("assistant educates the customer on Generocity and Lumen-1", async ({ page }) => {
    await openCase(
      page,
      "Volt Flow",
      /Your business has been registered and qualification has started|zero-capex path/i,
    );

    const prompt = `Product education check ${Date.now()}: explain the difference between Generocity and Lumen-1 in plain English.`;
    await sendWorkspaceMessage(page, prompt);

    await expect(page.getByText(/Nedbank/i).last()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/56 MW|Free State/i).last()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/R0 upfront|free panels/i).last()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/wheeling|larger|complex demand/i).last()).toBeVisible({ timeout: 20_000 });
  });

  test("assistant explains proposal details from the live case context", async ({ page }) => {
    await openCase(
      page,
      "Foundation CRM",
      /The proposed structure is ready|savings range and the key commitments/i,
    );

    const prompt = `Proposal explanation check ${Date.now()}: explain my proposal in plain English and tell me what I am committing to.`;
    await sendWorkspaceMessage(page, prompt);

    await expect(page.getByText(/18% to 24%|18%-24%|18 to 24/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/12[- ]year|12 year/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/no upfront|zero-capex|R0 upfront/i)).toBeVisible({ timeout: 20_000 });
  });
});
