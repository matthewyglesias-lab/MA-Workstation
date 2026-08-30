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
}

const claimValue = (
  claims: PlatformClaim[],
  endings: string[],
): string =>
  claims.find((claim) =>
    endings.some((ending) => String(claim.typ ?? "").toLowerCase().endsWith(ending)),
  )?.val ?? "";

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
    const userId =
      String(raw.userId ?? "").trim() ||
      claimValue(claims, ["/objectidentifier", "/oid", "/nameidentifier", "/sub"]);
    const displayName =
      String(raw.userDetails ?? "").trim() ||
      claimValue(claims, ["/name", "/preferred_username", "/email"]);
    const claimRoles = claims
      .filter((claim) => /(?:\/roles?|role)$/.test(String(claim.typ ?? "").toLowerCase()))
      .flatMap((claim) => String(claim.val ?? "").split(/[ ,]+/))
      .filter(Boolean);
    const roles = [...new Set([...(raw.userRoles ?? []), ...claimRoles])];
    const scopes = claimValue(claims, ["/scp", "scp"])
      .split(" ")
      .filter(Boolean);
    if (!userId || !displayName) return null;
    if (!roles.includes(requiredRole) && !scopes.includes(requiredRole)) return null;
    return { userId, displayName, roles, scopes };
  } catch {
    return null;
  }
};
