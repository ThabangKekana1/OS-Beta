import type { AuthSession } from "@/lib/auth";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PartnerAccessError extends Error {
  constructor(message = "Partner access is not authorised.") {
    super(message);
    this.name = "PartnerAccessError";
  }
}

export type OrganisationScope =
  | { mode: "all" }
  | { mode: "single"; organisationId: string };

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function organisationScopeForSession(session: AuthSession): OrganisationScope {
  if (session.role === "admin") return { mode: "all" };
  if (session.role !== "partner" || !isUuid(session.partnerOrgId)) {
    throw new PartnerAccessError();
  }
  return { mode: "single", organisationId: session.partnerOrgId };
}

export function partnerOrganisationIdForSession(session: AuthSession) {
  const scope = organisationScopeForSession(session);
  if (scope.mode !== "single") {
    throw new PartnerAccessError("A partner organisation is required.");
  }
  return scope.organisationId;
}

export function assertOrganisationAccess(session: AuthSession, organisationId: string) {
  if (!isUuid(organisationId)) throw new PartnerAccessError();
  const scope = organisationScopeForSession(session);
  if (scope.mode === "single" && scope.organisationId !== organisationId) {
    throw new PartnerAccessError();
  }
}

