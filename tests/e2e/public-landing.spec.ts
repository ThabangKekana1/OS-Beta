import { expect, test } from "@playwright/test";

// Guard against the regression where the public landing page (`/`) was
// nested inside the `(workspace)` route group and silently inherited the
// authenticated workspace sidebar. The marketing landing must NEVER show
// the workspace sidebar — keep this test green.
test("public landing page does not render the workspace sidebar", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-testid="workspace-sidebar"]')).toHaveCount(0);
});
