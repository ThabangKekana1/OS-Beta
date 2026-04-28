import { normalizeOrigin } from "@/lib/url";

export function resolveBrowserSiteOrigin() {
  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_VERCEL_URL) ??
    normalizeOrigin(typeof window === "undefined" ? null : window.location.origin) ??
    "http://localhost:3000"
  );
}
