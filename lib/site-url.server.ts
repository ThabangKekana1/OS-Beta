import { normalizeOrigin } from "@/lib/url";

function configuredSiteOrigin() {
  return (
    normalizeOrigin(process.env.APP_BASE_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_VERCEL_URL)
  );
}

export function resolveServerSiteOrigin(request?: Request) {
  const configured = configuredSiteOrigin();
  if (configured) {
    return configured;
  }

  if (!request) {
    return "http://localhost:3000";
  }

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (!forwardedHost) {
    return requestUrl.origin;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(/:$/, "");
  return normalizeOrigin(`${forwardedProto}://${forwardedHost}`) ?? requestUrl.origin;
}
