export interface DashboardResource {
  title: string;
  description: string;
  fileName: string;
  href: string;
}

export const salesResources: DashboardResource[] = [
  {
    title: "Sales Playbook",
    description: "Referral messaging, qualification prompts, and pipeline handoff expectations.",
    fileName: "sales-playbook.md",
    href: "/resources/sales/sales-playbook.md",
  },
  {
    title: "Lead Qualification Checklist",
    description: "The exact data points required before a lead should move into registration.",
    fileName: "lead-qualification-checklist.md",
    href: "/resources/sales/lead-qualification-checklist.md",
  },
  {
    title: "Escalation Guide",
    description: "When to escalate to administration and what to include in the escalation note.",
    fileName: "sales-escalation-guide.md",
    href: "/resources/sales/sales-escalation-guide.md",
  },
];

export const businessResources: DashboardResource[] = [
  {
    title: "Business Onboarding Guide",
    description: "Overview of the end-to-end process, milestones, and what your business should expect.",
    fileName: "business-onboarding-guide.md",
    href: "/resources/business/business-onboarding-guide.md",
  },
  {
    title: "Document Preparation Checklist",
    description: "A clean checklist for Expression of Interest, utility bill, proposal, term sheet, and KYC submissions.",
    fileName: "document-preparation-checklist.md",
    href: "/resources/business/document-preparation-checklist.md",
  },
  {
    title: "Proposal and Signing Instructions",
    description: "What to review before signing and how signed returns should be submitted back to the administrator.",
    fileName: "proposal-signing-instructions.md",
    href: "/resources/business/proposal-signing-instructions.md",
  },
];
