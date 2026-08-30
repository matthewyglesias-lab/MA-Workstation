import type { HttpRequest } from "@azure/functions";

export interface AuthenticatedPrincipal {
  userId: string;
  displayName: string;
  roles: string[];
  scopes: string[];
}

interface PlatformClaim {
  typ?: string;
  val?: string;
}

interface PlatformPrincipal {
  userId?: string;
  userDetails?: string;
  userRoles?: string[];
  claims?: PlatformClaim[];
  /**
   * App Service Easy Auth's documented principal shape carries these two
   * fields alongside `claims`: they name the exact claim `typ` the identity
   * uses for its name/role claims (mirroring .NET ClaimsIdentity's
   * NameClaimType/RoleClaimType). When present they take priority over the
   * heuristic suffix/exact matching below.
   */
  name_typ?: string;
  role_typ?: string;
}

const typeOf = (claim: PlatformClaim): string => String(claim.typ ?? "").toLowerCase();

/** Claims whose typ exactly equals the given claim type (case-insensitive). */
const claimsOfExactType = (claims: PlatformClaim[], typ: string | undefined): PlatformClaim[] => {
  if (!typ) return [];
  const normalized = typ.toLowerCase();
  return claims.filter((claim) => typeOf(claim) === normalized);
};

/**
 * Matches a claim type against short exact names (e.g. "email", "roles" as
 * emitted by some OIDC/JWT shapes) or full URI-form claim types identified
 * by their ending (e.g. ".../identity/claims/emailaddress").
 */
const matchesHeuristic = (typ: string, exact: readonly string[], endings: readonly string[]): boolean =>
  exact.includes(typ) || endings.some((ending) => typ.endsWith(ending));

const firstClaimValue = (
  claims: PlatformClaim[],
  exact: readonly string[],
  endings: readonly string[],
): string =>
  claims.find((claim) => matchesHeuristic(typeOf(claim), exact, endings))?.val ?? "";

const USER_ID_EXACT = ["sub", "oid", "objectidentifier", "nameidentifier"] as const;
const USER_ID_ENDINGS = ["/objectidentifier", "/oid", "/nameidentifier", "/sub"] as const;

const NAME_EXACT = ["name", "preferred_username", "email"] as const;
const NAME_ENDINGS = ["/name", "/preferred_username", "/email", "/emailaddress"] as const;

const ROLE_EXACT = ["role", "roles"] as const;
const ROLE_ENDINGS = ["/role", "/roles"] as const;

const SCOPE_EXACT = ["scp", "scope"] as const;
const SCOPE_ENDINGS = ["/scp", "/scope"] as const;

const resolveUserId = (raw: PlatformPrincipal, claims: PlatformClaim[]): string =>
  String(raw.userId ?? "").trim() || firstClaimValue(claims, USER_ID_EXACT, USER_ID_ENDINGS);

const resolveDisplayName = (raw: PlatformPrincipal, claims: PlatformClaim[]): string => {
  const explicit = String(raw.userDetails ?? "").trim();
  if (explicit) return explicit;
  const byNameTyp = claimsOfExactType(claims, raw.name_typ)[0]?.val?.trim();
  if (byNameTyp) return byNameTyp;
  return firstClaimValue(claims, NAME_EXACT, NAME_ENDINGS);
};

const resolveRoles = (raw: PlatformPrincipal, claims: PlatformClaim[]): string[] => {
  const byRoleTyp = claimsOfExactType(claims, raw.role_typ).flatMap((claim) =>
    String(claim.val ?? "").split(/[ ,]+/),
  );
  const byHeuristic = claims
    .filter((claim) => matchesHeuristic(typeOf(claim), ROLE_EXACT, ROLE_ENDINGS))
    .flatMap((claim) => String(claim.val ?? "").split(/[ ,]+/));
  return [...new Set([...(raw.userRoles ?? []), ...byRoleTyp, ...byHeuristic])].filter(Boolean);
};

const resolveScopes = (claims: PlatformClaim[]): string[] =>
  firstClaimValue(claims, SCOPE_EXACT, SCOPE_ENDINGS)
    .split(" ")
    .filter(Boolean);

/**
 * Parses the App Service Easy Auth principal header. Fails closed (returns
 * null) on any missing header, malformed JSON, missing identity, or a
 * principal lacking the required app role/scope. Actual tenant claim
 * shapes must still be captured and verified against a real Easy Auth
 * deployment before production use — this only covers the documented
 * principal contract and common Entra token claim-type variants.
 */
export const authenticatedPrincipal = (
  request: HttpRequest,
  requiredRole: string,
): AuthenticatedPrincipal | null => {
  const encoded = request.headers.get("x-ms-client-principal")?.trim();
  if (!encoded) return null;
  try {
    const raw = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as PlatformPrincipal;
    const claims = Array.isArray(raw.claims) ? raw.claims : [];
    const userId = resolveUserId(raw, claims);
    const displayName = resolveDisplayName(raw, claims);
    const roles = resolveRoles(raw, claims);
    const scopes = resolveScopes(claims);
    if (!userId || !displayName) return null;
    if (!roles.includes(requiredRole) && !scopes.includes(requiredRole)) return null;
    return { userId, displayName, roles, scopes };
  } catch {
    return null;
  }
};
