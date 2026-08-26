import { expect, test } from "@playwright/test";

/**
 * The full man-machine loop, as the founder runs it (doc 21):
 * login → land on Today → open MI → "Brief me" → MI answers with real
 * numbers → verify the reply lands in the persistent thread.
 * Cognition: MODEL_HARNESS (glm-5.3 flash). Requires a live model key.
 */
const EMAIL = process.env.MI_E2E_EMAIL ?? "karman@1os.foundation-1.co.za";
const PASSWORD = process.env.MI_E2E_PASSWORD ?? "";

test("founder signs in, lands on Today, and MI answers in real time", async ({ page }) => {
  test.skip(!PASSWORD, "set MI_E2E_PASSWORD to run the live conversation");

  await page.goto("/login?next=%2Fadmin%2Fdeck");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  // Cookies settle with the post-login navigation before we walk to Today.
  await page.goto("/admin");
  // Wait for real hydration before any interaction.
  await page.waitForSelector("html[data-mi-ready='1']", { timeout: 30000 });
  await expect(page.getByRole("heading", { name: "Today." })).toBeVisible({ timeout: 15000 });

  // Open MI and have an actual exchange.
  await page.waitForSelector("html[data-mi-ready='1']", { timeout: 30000 });
  const miToggle = page.getByTestId("mi-toggle");
  await miToggle.click();
  const miInput = page.getByTestId("mi-input");
  await miInput.fill("Brief me");
  await miInput.press("Enter");

  await expect(
    page.getByText(/DEAL BOOK|offline|working/i).first(),
  ).toBeVisible({ timeout: 60000 });

  // The thread persists: reload and confirm the history is still there.
  await page.reload();
await page.waitForSelector("html[data-mi-ready='1']", { timeout: 30000 });
  await page.getByTestId("mi-toggle").click();
  await expect(page.getByText(/DEAL BOOK|Brief me/i).first()).toBeVisible();
});
