import type { MetadataRoute } from "next";

const SITE_URL = "https://www.1os.co.za";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/api",
          "/auth",
          "/eoi",
          "/estimate",
          "/login",
          "/migration",
          "/proposal",
          "/register",
          "/sales",
          "/upload",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
