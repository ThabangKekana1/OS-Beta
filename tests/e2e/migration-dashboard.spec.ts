import { expect, test } from "@playwright/test";

const storageKey = "foundation1:migration-assessment";
const unlockKey = "foundation1:migration:unlocked";

test("migration dashboard blocks unlocked profiles until client profile exists", async ({ page }) => {
  await page.addInitScript(
    ({ storageKey, unlockKey }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          input: { monthlyElectricitySpend: 100000, monthlySpend: 100000 },
          result: {},
          documents: [],
          profileId: "F1-TEST1234",
          accessCode: "1234",
          status: "instant_report_generated",
          updatedAt: new Date().toISOString(),
        }),
      );
      window.sessionStorage.setItem(unlockKey, "F1-TEST1234");
    },
    { storageKey, unlockKey },
  );

  await page.goto("/migration/dashboard?p=F1-TEST1234");

  await expect(page.getByRole("heading", { name: "Open Client Profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Profile From Report" })).toBeVisible();
});

test("migration success page keeps report actions after contact preference signup", async ({ page }) => {
  await page.addInitScript(
    ({ storageKey, unlockKey }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          input: { monthlyElectricitySpend: 100000, monthlySpend: 100000 },
          result: {
            currentUtilityProjection: {
              currentMonthlySpend: 100000,
              currentAnnualSpend: 1200000,
              tenYearSpend: 21000000,
            },
            ufmsSolar: {
              scenarios: [
                { tenYearSavingAgainstEskom: 2000000 },
                { tenYearSavingAgainstEskom: 3000000 },
              ],
            },
            wheeling: {
              conservative: { tenYearSavingAgainstEskom: 4000000 },
              photovoltaicOnlyReference: { tenYearSavingAgainstEskom: 5000000 },
            },
            combinedScenarios: [
              { combinedTenYearSavingAgainstEskom: 6000000 },
            ],
          },
          documents: [],
          profileId: "F1-TEST1234",
          accessCode: "1234",
          status: "registered",
          registration: {
            assessmentId: "00000000-0000-4000-8000-000000000001",
            backend: "supabase",
            leadId: "lead-test",
            clientProfileId: "CP-TEST",
            businessName: "Test Energy Pty Ltd",
            contactName: "Test User",
            email: "test@example.com",
            phone: "+27000000000",
            preferredContactMethod: "email",
            companyRegistrationNumber: "",
            registeredAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        }),
      );
      window.sessionStorage.setItem(unlockKey, "F1-TEST1234");
    },
    { storageKey, unlockKey },
  );

  await page.goto("/migration/success?p=F1-TEST1234");

  await expect(page.getByText("Registration successful")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Your Foundation.?1 file is open\./ })).toBeVisible();
  await expect(page.getByText("via email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download Report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share Report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Email Report" })).toBeVisible();
});

test("migration dashboard reflects live admin profile status projection", async ({ page }) => {
  await page.route("**/api/migration/profiles/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        linked: true,
        status: {
          leadId: "lead-test",
          clientProfileId: "CP-TEST",
          adminStage: "Term Sheet Uploaded",
          migrationStatus: "term_sheet_pending",
          readinessScore: 84,
          nextAction: "Review term sheet and confirm approval.",
          documents: [
            {
              id: "doc-test",
              title: "Signed Expression of Interest - test",
              status: "signed",
              uploadedByType: "Client",
              fileName: "signed-eoi.pdf",
              createdAt: new Date().toISOString(),
            },
          ],
        },
      }),
    });
  });

  await page.addInitScript(
    ({ storageKey, unlockKey }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(
          {
            input: { monthlyElectricitySpend: 100000, monthlySpend: 100000 },
            result: {},
            documents: [],
            profileId: "F1-TEST1234",
            accessCode: "1234",
            status: "registered",
            registration: {
              assessmentId: "00000000-0000-4000-8000-000000000001",
              backend: "supabase",
              leadId: "lead-test",
              clientProfileId: "CP-TEST",
              businessName: "Test Energy Pty Ltd",
              contactName: "Test User",
              email: "test@example.com",
              phone: "+27000000000",
              companyRegistrationNumber: "2024/123456/07",
              registeredAt: new Date().toISOString(),
            },
            updatedAt: new Date().toISOString(),
          },
        ),
      );
      window.sessionStorage.setItem(unlockKey, "F1-TEST1234");
    },
    { storageKey, unlockKey },
  );

  await page.goto("/migration/dashboard?p=F1-TEST1234");

  await expect(page.getByText("Term Sheet Pending")).toBeVisible();
  await expect(page.getByText("Term Sheet Uploaded")).toBeVisible();
  await expect(page.getByText("Review term sheet and confirm approval.")).toBeVisible();
});
