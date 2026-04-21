import { expect, test } from "@playwright/test";

test("home prompt sends on Enter and opens a case conversation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Start Here", { exact: true })).toBeVisible();
  const input = page.locator("textarea").first();
  const message = `Home enter send ${Date.now()}`;
  await input.fill(message);
  await input.press("Enter");

  await expect(page).toHaveURL(/\/case\/[^/]+$/);
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
});

test("workspace conversation state persists across full reload", async ({ page }) => {
  await page.goto("/");
  await page.locator("aside a[href^=\"/case/\"]").first().click();
  await expect(page).toHaveURL(/\/case\/[^/]+$/);

  const uniqueMessage = `Persistence check ${Date.now()}`;
  const sendButton = page.getByRole("button", { name: "Send message" });
  const composerSection = page.locator("section").filter({ has: sendButton });
  const composerInput = composerSection.locator("textarea");

  await composerInput.fill(uniqueMessage);
  await expect(sendButton).toBeEnabled();
  await sendButton.click();

  await expect(page.getByText(uniqueMessage)).toBeVisible();

  await page.reload();
  await expect(page.getByText(uniqueMessage)).toBeVisible();
});
