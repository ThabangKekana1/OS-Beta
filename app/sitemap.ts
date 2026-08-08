import type { MetadataRoute } from "next";

const SITE_URL = "https://admin.foundation-1.co.za";
const lastModified = new Date("2026-07-06");

// 1OS is the operations platform — only legal pages are publicly indexable.
// Marketing and assessment live on https://foundation-1.co.za.
const publicPages = [
  { path: "/privacy", changeFrequency: "yearly", priority: 0.25 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.25 },
  { path: "/popia", changeFrequency: "yearly", priority: 0.25 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages.map((page) => ({
    url: `${SITE_URL}${page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
