import { makeId } from "@/lib/formatting";
import { createSeedCases, WORKSPACE_OPTIONS } from "@/lib/mock-data";
import type { Business, BusinessLocation, MigrationCase } from "@/lib/types";

export type WorkspaceStateSnapshot = {
  cases: MigrationCase[];
  activeCaseId: string | null;
  activeWorkspaceId: string;
};

const starterChecklist = [
  { id: "registration", label: "Registration confirmed", complete: false },
  { id: "eoi", label: "Signed EOI submitted", complete: false },
  { id: "qualification", label: "Qualification complete", complete: false },
  { id: "acceptance", label: "Service acceptance confirmed", complete: false },
  { id: "documents", label: "Documents approved by 1OS", complete: false },
  { id: "proposal", label: "Proposal signed", complete: false },
  { id: "term-sheet", label: "Term sheet signed", complete: false },
  { id: "internal-review", label: "Final 1OS review completed", complete: false },
  { id: "close", label: "Migration completed", complete: false },
] as const;

const DEFAULT_LOCATION_LABEL = "Primary location";

function getDefaultActiveCaseId(cases: MigrationCase[]) {
  return cases.find((migrationCase) => migrationCase.stage !== "Closed")?.id ?? cases[0]?.id ?? null;
}

function createBusinessLocation(
  overrides: Partial<BusinessLocation> = {},
): BusinessLocation {
  return {
    id: overrides.id ?? makeId("location"),
    label: overrides.label?.trim() || DEFAULT_LOCATION_LABEL,
    address: overrides.address?.trim() ?? "",
    city: overrides.city?.trim() ?? "",
    province: overrides.province?.trim() ?? "",
  };
}

function normalizeBusiness(business: Business): Business {
  const rawLocations = Array.isArray((business as Partial<Business>).locations)
    ? ((business as Partial<Business>).locations ?? [])
    : [];
  const locations =
    rawLocations.length > 0
      ? rawLocations.map((location, index) =>
          createBusinessLocation({
            ...location,
            label:
              location.label?.trim() ||
              (rawLocations.length === 1 ? DEFAULT_LOCATION_LABEL : `Location ${index + 1}`),
          }),
        )
      : [
          createBusinessLocation({
            id: `${business.id}-location-1`,
            label: business.siteCount > 1 ? "Location 1" : DEFAULT_LOCATION_LABEL,
            city: business.location,
            province: business.province,
          }),
        ];
  const primaryLocation = locations[0] ?? createBusinessLocation();

  return {
    ...business,
    location: primaryLocation.city,
    province: primaryLocation.province,
    locations,
    siteCount: Math.max(1, locations.length),
  };
}

function normalizeWorkspaceCase(migrationCase: MigrationCase): MigrationCase {
  return {
    ...migrationCase,
    business: normalizeBusiness(migrationCase.business),
  };
}

export function createWorkspaceCase({
  caseId = makeId("case"),
  businessId = makeId("business"),
  locationId = makeId("location"),
  businessName = "New business",
}: {
  caseId?: string;
  businessId?: string;
  locationId?: string;
  businessName?: string;
} = {}): MigrationCase {
  return {
    id: caseId,
    business: {
      id: businessId,
      name: businessName,
      legalName: "",
      sector: "",
      location: "",
      province: "",
      locations: [
        createBusinessLocation({
          id: locationId,
        }),
      ],
      monthlySpendZar: 0,
      averageMonthlyUsageKwh: 0,
      siteCount: 1,
      decisionMaker: "",
    },
    stage: "New",
    owner: "Dawn",
    nextAction:
      "Answer Dawn's four pre-qualification questions so 1OS can confirm the business qualifies to proceed.",
    lastUpdated: "Just now",
    priority: "Standard",
    productRecommendation: null,
    qualificationSummary: {
      recommendedProduct: null,
      confidence: "Manual Review",
      tariffProfile: "Pending discovery",
      loadProfile: "Pending discovery",
      rationale: [
        "Start with Dawn's four pre-qualification checks: CIPC registration, operational status, monthly electricity spend, and 6 months of utility bills or prepaid receipts.",
        "Once those pass, Dawn will complete the business registration and generate the EOI.",
      ],
    },
    missingItems: [],
    messages: [
      {
        id: `${caseId}-message-1`,
        type: "assistant",
        timestamp: "Now",
        content:
          "Hi, I'm Dawn. Before I register the business, I need to confirm four quick points: is the business CIPC-registered, is it currently operational, is it spending at least R10,000 per month on electricity, and do you have access to 6 months of utility bills or prepaid receipts?",
      },
    ],
    documents: [],
    proposal: null,
    termSheet: null,
    activity: [
      {
        id: `${caseId}-activity-1`,
        title: "Workspace opened",
        detail: "Dawn is ready to start your migration conversation.",
        timestamp: "Now",
        tone: "system",
      },
    ],
    tasks: [
      {
        id: `${caseId}-task-1`,
        title: "Answer Dawn's pre-qualification questions",
        owner: "Client",
        dueLabel: "Now",
        status: "open",
      },
    ],
    closeChecklist: starterChecklist.map((item) => ({ ...item })),
  };
}

function createStarterCase(): MigrationCase {
  return createWorkspaceCase({
    caseId: "starter-case",
    businessId: "starter-business",
    locationId: "starter-location-1",
    businessName: "My Business",
  });
}

function ensureWorkspaceCases(cases: MigrationCase[]) {
  return cases.length > 0 ? cases.map(normalizeWorkspaceCase) : [createStarterCase()];
}

export function createDefaultWorkspaceStateSnapshot(): WorkspaceStateSnapshot {
  const cases =
    process.env.NODE_ENV === "production"
      ? ensureWorkspaceCases([])
      : ensureWorkspaceCases(createSeedCases());

  return {
    cases,
    activeCaseId: getDefaultActiveCaseId(cases),
    activeWorkspaceId: WORKSPACE_OPTIONS[0].id,
  };
}

export function normalizeWorkspaceStateSnapshot(input: unknown): WorkspaceStateSnapshot | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const typed = input as {
    cases?: unknown;
    activeCaseId?: unknown;
    activeWorkspaceId?: unknown;
  };

  if (!Array.isArray(typed.cases)) {
    return null;
  }

  const cases = ensureWorkspaceCases(typed.cases as MigrationCase[]);

  const activeWorkspaceId =
    typeof typed.activeWorkspaceId === "string" &&
    WORKSPACE_OPTIONS.some((option) => option.id === typed.activeWorkspaceId)
      ? typed.activeWorkspaceId
      : WORKSPACE_OPTIONS[0].id;

  const requestedActiveCaseId =
    typeof typed.activeCaseId === "string" ? typed.activeCaseId : null;
  const activeCaseId =
    requestedActiveCaseId && cases.some((migrationCase) => migrationCase.id === requestedActiveCaseId)
      ? requestedActiveCaseId
      : getDefaultActiveCaseId(cases);

  return {
    cases,
    activeCaseId,
    activeWorkspaceId,
  };
}
