import {
  type BusinessLocation,
  type MigrationCase,
  type ResourceItem,
  type WorkspaceOption,
} from "./types";

function formatDateLabel(daysAgo: number = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

const TODAY = formatDateLabel(0);
const YESTERDAY = formatDateLabel(1);
const TWO_DAYS_AGO = formatDateLabel(2);
const THREE_DAYS_AGO = formatDateLabel(3);

function seedLocation(
  id: string,
  label: string,
  province: string,
  address: string = "",
): BusinessLocation {
  return {
    id,
    label,
    address,
    city: label,
    province,
  };
}

export const ACTIVE_USER_NAME = "Karman";

export const WORKSPACE_OPTIONS: WorkspaceOption[] = [
  {
    id: "migration-desk",
    label: "My Migration",
    description: "Your guided route from Eskom to the right energy path",
  },
  {
    id: "portfolio-watch",
    label: "My Businesses",
    description: "Track every business you are moving through 1OS",
  },
  {
    id: "client-readiness",
    label: "Next Steps",
    description: "See what you still need to send and what 1OS is handling",
  },
];

export const RESOURCE_LIBRARY: ResourceItem[] = [
  {
    id: "resource-welcome",
    title: "Welcome Letter",
    category: "Onboarding",
    summary:
      "Executive introduction to the 1OS migration process, timeline, and trust model.",
    fileType: "PDF",
    size: "1.2 MB",
    updatedAt: TODAY,
    audience: "Shared",
  },
  {
    id: "resource-brochure",
    title: "Brochure",
    category: "Product",
    summary:
      "High-level introduction to the 1OS migration offer and operating workflow.",
    fileType: "PDF",
    size: "3.8 MB",
    updatedAt: TODAY,
    audience: "Shared",
  },
  {
    id: "resource-company-profile",
    title: "Company Profile",
    category: "Corporate",
    summary:
      "Capability overview, operating model, counterparties, and delivery posture.",
    fileType: "PDF",
    size: "2.6 MB",
    updatedAt: TWO_DAYS_AGO,
    audience: "Shared",
  },
  {
    id: "resource-generocity",
    title: "Generocity Overview",
    category: "Product",
    summary:
      "Zero-capex solar pathway with free panels, installation, maintenance, and insurance.",
    fileType: "PDF",
    size: "2.1 MB",
    updatedAt: TODAY,
    audience: "Shared",
  },
  {
    id: "resource-lumen",
    title: "Lumen-1 Overview",
    category: "Product",
    summary:
      "Wheeled energy and power purchase agreement pathway for larger or more complex loads.",
    fileType: "PDF",
    size: "2.4 MB",
    updatedAt: TODAY,
    audience: "Shared",
  },
  {
    id: "resource-guide",
    title: "Migration Guide",
    category: "Operations",
    summary:
      "Step-by-step walkthrough from registration and qualification through to close.",
    fileType: "DOCX",
    size: "0.9 MB",
    updatedAt: YESTERDAY,
    audience: "Shared",
  },
  {
    id: "resource-eoi-template",
    title: "Expression of Interest Template",
    category: "Registration",
    summary:
      "Starter template for first-time migration registration before qualification begins.",
    fileType: "DOCX",
    size: "0.4 MB",
    updatedAt: TODAY,
    audience: "Shared",
  },
];

const baseChecklist = [
  { id: "registration", label: "Registration confirmed", complete: false },
  { id: "eoi", label: "Signed EOI submitted", complete: false },
  { id: "qualification", label: "Qualification complete", complete: false },
  { id: "acceptance", label: "Service acceptance confirmed", complete: false },
  { id: "documents", label: "Documents approved by 1OS", complete: false },
  { id: "proposal", label: "Proposal signed", complete: false },
  { id: "term-sheet", label: "Term sheet signed", complete: false },
  { id: "internal-review", label: "Final 1OS review completed", complete: false },
  { id: "close", label: "Migration completed", complete: false },
];

const INITIAL_CASES: MigrationCase[] = [
  {
    id: "volt-flow",
    business: {
      id: "business-volt-flow",
      name: "Volt Flow",
      legalName: "Volt Flow Logistics (Pty) Ltd",
      sector: "Cold-chain logistics",
      location: "Johannesburg North Depot",
      province: "Gauteng",
      locations: [seedLocation("vf-location-1", "Johannesburg North Depot", "Gauteng")],
      monthlySpendZar: 186000,
      averageMonthlyUsageKwh: 318000,
      siteCount: 1,
      decisionMaker: "T. Maseko",
    },
    stage: "Awaiting Documents",
    owner: "Nandi M.",
    nextAction: "Upload your latest three utility bills and roof photographs.",
    lastUpdated: "8 minutes ago",
    priority: "Priority",
    productRecommendation: "Generocity",
    qualificationSummary: {
      recommendedProduct: "Generocity",
      confidence: "Medium",
      tariffProfile: "Municipal commercial tariff",
      loadProfile: "Day-heavy weekday load with roof availability",
      rationale: [
        "Single-site footprint aligns well with on-site solar migration.",
        "Load shape shows enough daylight demand to support zero-capex solar.",
        "Document pack still needs meter photos and final utility history.",
      ],
    },
    missingItems: [
      "Latest three utility bills",
      "Signed service acceptance",
      "Meter and roof photographs",
    ],
    messages: [
      {
        id: "vf-message-1",
        type: "assistant",
        timestamp: "09:10",
        content:
          "Your business has been registered and qualification has started. The fastest route to product confirmation is your latest utility pack plus site imagery.",
      },
      {
        id: "vf-message-2",
        type: "user",
        timestamp: "09:16",
        mode: "Onboarding",
        content:
          "We want the zero-capex path if the site qualifies. What do you need from us first?",
      },
      {
        id: "vf-message-3",
        type: "system",
        title: "Qualification staged",
        timestamp: "09:17",
        content: "Awaiting utility bills, service acceptance, and site imagery.",
      },
    ],
    documents: [
      {
        id: "vf-doc-1",
        title: "Welcome Letter",
        category: "Onboarding",
        fileType: "PDF",
        status: "available",
        updatedAt: TODAY,
        size: "1.2 MB",
        audience: "Shared",
      },
      {
        id: "vf-doc-2",
        title: "Company Profile",
        category: "Corporate",
        fileType: "PDF",
        status: "available",
        updatedAt: TODAY,
        size: "2.6 MB",
        audience: "Shared",
      },
      {
        id: "vf-doc-3",
        title: "Utility Bills",
        category: "Qualification",
        fileType: "PDF",
        status: "pending",
        updatedAt: "Pending",
        size: "-",
        audience: "Client",
      },
    ],
    proposal: null,
    termSheet: null,
    activity: [
      {
        id: "vf-activity-1",
        title: "Migration started",
        detail: "Your business was registered and moved into qualification.",
        timestamp: "Today, 09:08",
        tone: "system",
      },
      {
        id: "vf-activity-2",
        title: "Your direction received",
        detail: "You confirmed interest in the zero-capex migration route.",
        timestamp: "Today, 09:16",
        tone: "client",
      },
    ],
    tasks: [
      {
        id: "vf-task-1",
        title: "Upload utility bills",
        owner: "Client",
        dueLabel: "Today",
        status: "open",
      },
      {
        id: "vf-task-2",
        title: "Upload roof and meter photographs",
        owner: "Client",
        dueLabel: "Today",
        status: "open",
      },
      {
        id: "vf-task-3",
        title: "1OS prepares your service acceptance step",
        owner: "1OS",
        dueLabel: "Today",
        status: "open",
      },
    ],
    closeChecklist: baseChecklist.map((item, index) => ({
      ...item,
      complete: index <= 1,
    })),
  },
  {
    id: "foundation-crm",
    business: {
      id: "business-foundation-crm",
      name: "Foundation CRM",
      legalName: "Foundation CRM South Africa (Pty) Ltd",
      sector: "Software operations",
      location: "Century City Campus",
      province: "Western Cape",
      locations: [seedLocation("fcrm-location-1", "Century City Campus", "Western Cape")],
      monthlySpendZar: 146000,
      averageMonthlyUsageKwh: 212000,
      siteCount: 1,
      decisionMaker: "L. Daniels",
    },
    stage: "Awaiting Signed Proposal",
    owner: "Bongani R.",
    nextAction: "Review and sign the proposal so 1OS can prepare your term sheet.",
    lastUpdated: "31 minutes ago",
    priority: "Standard",
    productRecommendation: "Generocity",
    qualificationSummary: {
      recommendedProduct: "Generocity",
      confidence: "High",
      tariffProfile: "Time-of-use commercial",
      loadProfile: "Strong weekday daytime demand, clean roof availability",
      rationale: [
        "On-site solar can materially displace daytime Eskom consumption.",
        "Zero-capex structure fit passed credit and site checks.",
        "Client only needs to return the signed proposal to move into term sheet work.",
      ],
    },
    missingItems: ["Signed proposal"],
    messages: [
      {
        id: "fcrm-message-1",
        type: "system",
        title: "Proposal available",
        timestamp: "11:05",
        content: "Commercial proposal issued for review.",
      },
      {
        id: "fcrm-message-2",
        type: "assistant",
        timestamp: "11:08",
        content:
          "The proposed structure is ready. Once the signed proposal comes back, we can move straight into term sheet handling.",
      },
      {
        id: "fcrm-message-3",
        type: "user",
        mode: "Onboarding",
        timestamp: "11:18",
        content: "Show me the savings range and the key commitments again.",
      },
    ],
    documents: [
      {
        id: "fcrm-doc-1",
        title: "Welcome Letter",
        category: "Onboarding",
        fileType: "PDF",
        status: "available",
        updatedAt: TWO_DAYS_AGO,
        size: "1.2 MB",
        audience: "Shared",
      },
      {
        id: "fcrm-doc-2",
        title: "Utility Bills",
        category: "Qualification",
        fileType: "PDF",
        status: "reviewed",
        updatedAt: YESTERDAY,
        size: "5.1 MB",
        audience: "Client",
      },
      {
        id: "fcrm-doc-3",
        title: "Proposal",
        category: "Commercials",
        fileType: "PDF",
        status: "issued",
        updatedAt: TODAY,
        size: "1.8 MB",
        audience: "Shared",
      },
    ],
    proposal: {
      id: "foundation-proposal",
      status: "issued",
      title: "Generocity Commercial Proposal",
      summary:
        "Zero-capex solar structure with no upfront payment, full installation, maintenance, and insurance included.",
      savingsRange: "18% to 24% forecast reduction on daytime grid spend",
      termYears: 12,
      updatedAt: TODAY,
    },
    termSheet: null,
    activity: [
      {
        id: "fcrm-activity-1",
        title: "Qualification complete",
        detail: "Generocity confirmed as the recommended pathway.",
        timestamp: "Yesterday, 17:20",
        tone: "system",
      },
      {
        id: "fcrm-activity-2",
        title: "Proposal issued",
        detail: "Your proposal is ready for review and signature.",
        timestamp: "Today, 11:05",
        tone: "system",
      },
    ],
    tasks: [
      {
        id: "fcrm-task-1",
        title: "Return signed proposal",
        owner: "Client",
        dueLabel: "Tomorrow",
        status: "open",
      },
      {
        id: "fcrm-task-2",
        title: "1OS prepares your term sheet pack",
        owner: "1OS",
        dueLabel: "Tomorrow",
        status: "open",
      },
    ],
    closeChecklist: baseChecklist.map((item) => ({
      ...item,
      complete:
        item.id === "registration" ||
        item.id === "eoi" ||
        item.id === "qualification" ||
        item.id === "acceptance" ||
        item.id === "documents",
    })),
  },
  {
    id: "foundation-solar-hub",
    business: {
      id: "business-foundation-solar-hub",
      name: "Foundation Solar Hub",
      legalName: "Foundation Solar Hub (Pty) Ltd",
      sector: "Industrial campus",
      location: "Ekurhuleni Industrial Park",
      province: "Gauteng",
      locations: [
        seedLocation("fsh-location-1", "Ekurhuleni Industrial Park", "Gauteng"),
        seedLocation("fsh-location-2", "Germiston Load Centre", "Gauteng"),
        seedLocation("fsh-location-3", "Midrand Dispatch Yard", "Gauteng"),
      ],
      monthlySpendZar: 512000,
      averageMonthlyUsageKwh: 910000,
      siteCount: 3,
      decisionMaker: "K. Ncube",
    },
    stage: "Internal Review",
    owner: "Amahle S.",
    nextAction: "1OS is completing final review before your migration is marked ready to close.",
    lastUpdated: "1 hour ago",
    priority: "Executive",
    productRecommendation: "Lumen-1",
    qualificationSummary: {
      recommendedProduct: "Lumen-1",
      confidence: "High",
      tariffProfile: "Multi-site wheeled consumption",
      loadProfile: "Large mixed-load portfolio across multiple sites",
      rationale: [
        "Load complexity and site distribution are better suited to wheeled energy.",
        "Client cleared commercial review and signed the term sheet.",
        "1OS is completing the final review checks before close.",
      ],
    },
    missingItems: [],
    messages: [
      {
        id: "fsh-message-1",
        type: "assistant",
        timestamp: "14:04",
        content:
          "Your signed term sheet is in. 1OS is now completing the final review checks before close readiness.",
      },
      {
        id: "fsh-message-2",
        type: "system",
        title: "Final 1OS review active",
        timestamp: "14:06",
        content: "1OS is completing the last checks before close readiness.",
      },
    ],
    documents: [
      {
        id: "fsh-doc-1",
        title: "Utility Bills",
        category: "Qualification",
        fileType: "PDF",
        status: "reviewed",
        updatedAt: THREE_DAYS_AGO,
        size: "8.9 MB",
        audience: "Client",
      },
      {
        id: "fsh-doc-2",
        title: "Proposal",
        category: "Commercials",
        fileType: "PDF",
        status: "signed",
        updatedAt: YESTERDAY,
        size: "2.1 MB",
        audience: "Shared",
      },
      {
        id: "fsh-doc-3",
        title: "Signed Proposal",
        category: "Commercials",
        fileType: "PDF",
        status: "signed",
        updatedAt: YESTERDAY,
        size: "2.2 MB",
        audience: "Client",
      },
      {
        id: "fsh-doc-4",
        title: "Term Sheet",
        category: "Legal",
        fileType: "PDF",
        status: "signed",
        updatedAt: TODAY,
        size: "1.6 MB",
        audience: "Shared",
      },
      {
        id: "fsh-doc-5",
        title: "Signed Term Sheet",
        category: "Legal",
        fileType: "PDF",
        status: "signed",
        updatedAt: TODAY,
        size: "1.6 MB",
        audience: "Client",
      },
    ],
    proposal: {
      id: "foundation-hub-proposal",
      status: "signed",
      title: "Lumen-1 Power Purchase Proposal",
      summary:
        "Wheeled energy pathway with portfolio allocation across three sites and managed commercial settlement.",
      savingsRange: "12% to 18% effective reduction with improved supply resilience",
      termYears: 15,
      updatedAt: YESTERDAY,
    },
    termSheet: {
      id: "foundation-hub-term-sheet",
      status: "signed",
      title: "Lumen-1 Term Sheet",
      summary:
        "Term sheet executed. Internal legal, credit, and delivery checks now underway ahead of close.",
      updatedAt: TODAY,
    },
    activity: [
      {
        id: "fsh-activity-1",
        title: "Signed term sheet received",
        detail: "Client uploaded executed term sheet.",
        timestamp: "Today, 13:54",
        tone: "client",
      },
      {
        id: "fsh-activity-2",
        title: "Final 1OS review started",
        detail: "Your signed pack is being checked for final close readiness.",
        timestamp: "Today, 14:06",
        tone: "internal",
      },
    ],
    tasks: [
      {
        id: "fsh-task-1",
        title: "1OS completes final review",
        owner: "1OS",
        dueLabel: "Today",
        status: "open",
      },
      {
        id: "fsh-task-2",
        title: "Legal confirmation",
        owner: "Legal",
        dueLabel: "Today",
        status: "open",
      },
    ],
    closeChecklist: baseChecklist.map((item) => ({
      ...item,
      complete: item.id !== "internal-review" && item.id !== "close",
    })),
  },
  {
    id: "clover-sa",
    business: {
      id: "business-clover-sa",
      name: "Clover SA",
      legalName: "Clover SA Manufacturing (Pty) Ltd",
      sector: "Food manufacturing",
      location: "Durban Processing Facility",
      province: "KwaZulu-Natal",
      locations: [
        seedLocation("clover-location-1", "Durban Processing Facility", "KwaZulu-Natal"),
        seedLocation("clover-location-2", "Pinetown Cold Store", "KwaZulu-Natal"),
      ],
      monthlySpendZar: 402000,
      averageMonthlyUsageKwh: 672000,
      siteCount: 2,
      decisionMaker: "R. Singh",
    },
    stage: "New",
    owner: "Sipho T.",
    nextAction: "Complete, digitally sign, and submit your Expression of Interest (EOI).",
    lastUpdated: "2 hours ago",
    priority: "Priority",
    productRecommendation: null,
    qualificationSummary: {
      recommendedProduct: null,
      confidence: "Manual Review",
      tariffProfile: "Municipal industrial tariff",
      loadProfile: "High refrigeration and evening load with dual-site demand",
      rationale: [
        "Load shape suggests a more complex migration decision.",
        "The team still needs interval usage detail and the municipal account schedule.",
        "1OS will confirm whether Generocity or Lumen-1 produces the stronger commercial fit.",
      ],
    },
    missingItems: [
      "Signed expression of interest",
      "Latest 12 months of interval usage",
      "Municipal account schedule",
    ],
    messages: [
      {
        id: "clover-message-1",
        type: "assistant",
        timestamp: "08:34",
        content:
          "Welcome to 1OS migration. First step is completing and digitally signing your Expression of Interest (EOI), then submitting it in this workspace.",
      },
      {
        id: "clover-message-2",
        type: "user",
        mode: "Onboarding",
        timestamp: "08:39",
        content:
          "Please guide me through creating and signing the EOI first.",
      },
    ],
    documents: [
      {
        id: "clover-doc-1",
        title: "Welcome Letter",
        category: "Onboarding",
        fileType: "PDF",
        status: "available",
        updatedAt: TODAY,
        size: "1.2 MB",
        audience: "Shared",
      },
      {
        id: "clover-doc-2",
        title: "Expression of Interest Template",
        category: "Registration",
        fileType: "DOCX",
        status: "available",
        updatedAt: TODAY,
        size: "0.4 MB",
        audience: "Shared",
      },
    ],
    proposal: null,
    termSheet: null,
    activity: [
      {
        id: "clover-activity-1",
        title: "Migration opened",
        detail: "EOI requested as the first required onboarding step.",
        timestamp: "Today, 08:30",
        tone: "system",
      },
    ],
    tasks: [
      {
        id: "clover-task-1",
        title: "Complete and digitally sign Expression of Interest",
        owner: "Client",
        dueLabel: "Today",
        status: "open",
      },
      {
        id: "clover-task-2",
        title: "Submit signed Expression of Interest",
        owner: "Client",
        dueLabel: "Today",
        status: "open",
      },
      {
        id: "clover-task-3",
        title: "1OS validates EOI and opens qualification",
        owner: "1OS",
        dueLabel: "Tomorrow",
        status: "open",
      },
    ],
    closeChecklist: baseChecklist.map((item) => ({
      ...item,
      complete: false,
    })),
  },
  {
    id: "apex-milling",
    business: {
      id: "business-apex-milling",
      name: "Apex Milling",
      legalName: "Apex Milling Holdings (Pty) Ltd",
      sector: "Food processing",
      location: "Pretoria East Plant",
      province: "Gauteng",
      locations: [seedLocation("apex-location-1", "Pretoria East Plant", "Gauteng")],
      monthlySpendZar: 240000,
      averageMonthlyUsageKwh: 351000,
      siteCount: 1,
      decisionMaker: "P. Khumalo",
    },
    stage: "Closed",
    owner: "Nandi M.",
    nextAction: "Your migration is complete and ready for delivery handover.",
    lastUpdated: "Yesterday",
    priority: "Standard",
    productRecommendation: "Generocity",
    qualificationSummary: {
      recommendedProduct: "Generocity",
      confidence: "High",
      tariffProfile: "Industrial day-heavy tariff",
      loadProfile: "Stable site load with consistent daytime demand",
      rationale: [
        "The business qualified cleanly for the Generocity pathway.",
        "Proposal, term sheet, and final 1OS checks were all completed.",
        "Case is now closed and handed over.",
      ],
    },
    missingItems: [],
    messages: [
      {
        id: "apex-message-1",
        type: "system",
        title: "Migration closed",
        timestamp: "Yesterday",
        content: "Your migration has been completed and moved to delivery handover.",
      },
    ],
    documents: [
      {
        id: "apex-doc-1",
        title: "Signed Proposal",
        category: "Commercials",
        fileType: "PDF",
        status: "signed",
        updatedAt: YESTERDAY,
        size: "1.7 MB",
        audience: "Client",
      },
      {
        id: "apex-doc-2",
        title: "Signed Term Sheet",
        category: "Legal",
        fileType: "PDF",
        status: "signed",
        updatedAt: YESTERDAY,
        size: "1.3 MB",
        audience: "Client",
      },
    ],
    proposal: {
      id: "apex-proposal",
      status: "signed",
      title: "Generocity Commercial Proposal",
      summary: "Closed proposal.",
      savingsRange: "16% to 20%",
      termYears: 10,
      updatedAt: TWO_DAYS_AGO,
    },
    termSheet: {
      id: "apex-term-sheet",
      status: "signed",
      title: "Generocity Term Sheet",
      summary: "Closed term sheet.",
      updatedAt: YESTERDAY,
    },
    activity: [
      {
        id: "apex-activity-1",
        title: "Close confirmed",
        detail: "Your migration was closed and handed into delivery.",
        timestamp: "Yesterday, 16:48",
        tone: "system",
      },
    ],
    tasks: [],
    closeChecklist: baseChecklist.map((item) => ({
      ...item,
      complete: true,
    })),
  },
];

export function createSeedCases() {
  if (typeof structuredClone === "function") {
    return structuredClone(INITIAL_CASES);
  }

  return JSON.parse(JSON.stringify(INITIAL_CASES));
}
