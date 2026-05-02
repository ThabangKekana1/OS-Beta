import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "";
const signupClientName = process.env.E2E_SIGNUP_CLIENT_NAME ?? `Codex Signup ${Date.now()}`;
const signupClientEmail =
  process.env.E2E_SIGNUP_CLIENT_EMAIL ?? `codex-signup-${Date.now()}@mailinator.com`;
const signupClientPassword =
  process.env.E2E_SIGNUP_CLIENT_PASSWORD ?? "CodexClient123!";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin =
  supabaseUrl && supabaseServiceRole
    ? createClient(supabaseUrl, supabaseServiceRole, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

async function login(page: Page, email: string, password: string, expectedPath: RegExp) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(expectedPath);
}

async function clearSession(page: Page, context: BrowserContext) {
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear()).catch(() => undefined);
}

async function confirmUserEmail(email: string) {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured for this test.");
  }

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) {
    throw error;
  }

  const user = data.users.find(
    (entry) => entry.email?.trim().toLowerCase() === email.trim().toLowerCase(),
  );
  if (!user) {
    throw new Error(`Unable to find auth user for ${email}`);
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    email_confirm: true,
  });
  if (updateError) {
    throw updateError;
  }
}

async function sendWorkspaceMessage(page: Page, message: string) {
  const composer = page.getByPlaceholder(
    "Ask anything about your migration, Foundation-1, Generocity, or Lumen-1...",
  );
  await composer.fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
}

test.describe.serial("signup onboarding", () => {
  test("signup creates an admin-visible client shell immediately", async ({ page, context }) => {
    test.skip(
      !adminEmail || !adminPassword || !supabaseAdmin,
      "Set admin credentials and Supabase env to run signup onboarding tests.",
    );

    await page.goto("/signup");
    await page.locator("#name").fill(signupClientName);
    await page.locator("#email").fill(signupClientEmail);
    await page.locator("#password").fill(signupClientPassword);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(
      page.getByRole("heading", { name: "Confirm your email to finish signing up" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(signupClientEmail, { exact: true })).toBeVisible();

    await confirmUserEmail(signupClientEmail);

    await clearSession(page, context);
    await login(page, adminEmail, adminPassword, /\/admin(?:\/|$)/);
    await page.goto("/admin/clients");
    await page.getByPlaceholder("Business, profile ID, email, reg number...").fill(signupClientEmail);

    const row = page.locator("tr", { hasText: signupClientName }).first();
    await expect(row).toContainText("Business details pending", { timeout: 20_000 });
    await expect(row).toContainText("Client Registered");
    await expect(row).toContainText(signupClientName);
    await expect(row).toContainText(signupClientEmail);
  });

  test("onboarding starts with pre-qualification and waits for confirmation before submission", async ({ page, context }) => {
    test.skip(
      !adminEmail || !adminPassword || !supabaseAdmin,
      "Set admin credentials and Supabase env to run signup onboarding tests.",
    );

    const businessSuffix = String(Date.now()).slice(-6);
    const businessName = `Codex Paragraph Solar ${businessSuffix}`;

    await login(page, signupClientEmail, signupClientPassword, /\/workspace(?:\/|$)/);
    await page.goto("/workspace");
    await page.getByRole("button", { name: "Add business" }).click();
    await expect(page.getByText("New business", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText(/is the business CIPC-registered, is it currently operational, is it spending at least R10,000 per month on electricity, and do you have access to 6 months of utility bills or prepaid receipts/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    await sendWorkspaceMessage(
      page,
      "Yes, the business is registered and operational, we spend about R125000 per month on electricity, and we have 6 months of utility bills.",
    );
    await expect(page.getByText(/What is the registered business name\?/i).last()).toBeVisible({
      timeout: 20_000,
    });

    const registrationParagraph = [
      `business name: ${businessName}.`,
      "business registration number: 2026/123456/07.",
      "industry: Manufacturing.",
      "contact first name: Casey.",
      "contact surname: Example.",
      "contact position: Operations Director.",
      `contact email: ${signupClientEmail}.`,
      "contact number: +27820000000.",
      "physical address: 123 Solar Street.",
      "city: Johannesburg.",
      "province: Gauteng.",
    ].join(" ");

    await sendWorkspaceMessage(page, registrationParagraph);
    await expect(
      page.getByText(/Please confirm these details before I submit them into 1OS/i).last(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/Reply with `confirm` to submit, or send the correction if anything is wrong\./i).last(),
    ).toBeVisible({ timeout: 20_000 });

    await sendWorkspaceMessage(page, "confirm");
    await expect(page.getByText(/You're registered\./i).last()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/Expression of Interest is ready in Documents/i).last(),
    ).toBeVisible({ timeout: 20_000 });

    await clearSession(page, context);
    await login(page, adminEmail, adminPassword, /\/admin(?:\/|$)/);
    await page.goto("/admin/clients");
    await page.getByPlaceholder("Business, profile ID, email, reg number...").fill(businessName);

    const row = page.locator("tr", { hasText: businessName }).first();
    await expect(row).toContainText("EOI Generated", { timeout: 20_000 });
  });
});
