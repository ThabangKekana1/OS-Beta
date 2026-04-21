export type DashboardResource = {
  id: "foundation-1-brochure";
  title: string;
  summary: string;
  fileType: "PDF";
  href: string;
  filename: string;
  updatedAt: string;
};

export const DASHBOARD_RESOURCES: DashboardResource[] = [
  {
    id: "foundation-1-brochure",
    title: "Foundation-1 Brochure",
    summary:
      "Primary brochure PDF for sales sharing and client onboarding conversations.",
    fileType: "PDF",
    href: "/resources/foundation-1-brochure.pdf",
    filename: "foundation-1-brochure.pdf",
    updatedAt: "18 Apr 2026",
  },
];
