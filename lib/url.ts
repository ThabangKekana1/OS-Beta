function trimEnvValue(value?: string | null) {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

export function normalizeOrigin(value?: string | null) {
  const trimmed = trimEnvValue(value);
  if (!trimmed) return null;

  const withProtocol =
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith("http://localhost") ||
    trimmed.startsWith("http://127.0.0.1")
      ? trimmed
      : trimmed.startsWith("localhost") || trimmed.startsWith("127.0.0.1")
        ? `http://${trimmed}`
        : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

export function sanitizeNextPath(nextPath?: string | null, fallback = "/") {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return fallback;
}

export function buildAuthRedirectUrl(origin: string, pathname: string, nextPath: string) {
  const url = new URL(pathname, origin);
  url.searchParams.set("next", sanitizeNextPath(nextPath));
  return url.toString();
}

export function buildAuthCallbackUrl(origin: string, nextPath: string) {
  return buildAuthRedirectUrl(origin, "/auth/callback", nextPath);
}
