import { resolveServerSiteOrigin } from "@/lib/site-url.server";

export function buildClientEoiSigningPath(token: string | null | undefined) {
  return token ? `/eoi/${encodeURIComponent(token)}` : null;
}

export function buildClientEoiSigningUrl(token: string | null | undefined) {
  const path = buildClientEoiSigningPath(token);
  if (!path) {
    return null;
  }

  return `${resolveServerSiteOrigin()}${path}`;
}
