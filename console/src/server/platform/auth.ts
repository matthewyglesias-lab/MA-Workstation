import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Actor, Role } from "../../shared/contracts.js";
import type { Config } from "./config.js";
import { DomainError, invariant } from "./errors.js";
const roles: Role[] = [
  "Console.Reader",
  "Console.Operator",
  "Inventory.Manager",
];
export function validateClaims(
  payload: Record<string, unknown>,
  config: Config,
): Actor {
  invariant(
    payload.tid === config.tenantId &&
      payload.azp === config.webClientId &&
      payload.ver === "2.0",
    "unauthorized",
    "Invalid application or tenant.",
    401,
  );
  invariant(
    typeof payload.oid === "string" && /^[a-f\d-]{36}$/i.test(payload.oid),
    "unauthorized",
    "A staff identity is required.",
    401,
  );
  invariant(
    typeof payload.scp === "string" &&
      payload.scp.split(" ").includes("access_as_user"),
    "forbidden",
    "The API access scope is required.",
    403,
  );
  const assigned = roles.filter(
    (role) => Array.isArray(payload.roles) && payload.roles.includes(role),
  );
  invariant(
    assigned.length,
    "forbidden",
    "Your account has no console role.",
    403,
  );
  return { id: payload.oid, roles: assigned };
}
export function authenticator(config: Config) {
  const keys =
    config.mode === "sql"
      ? createRemoteJWKSet(
          new URL(
            `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`,
          ),
        )
      : undefined;
  return async (authorization?: string): Promise<Actor> => {
    if (config.mode === "demo")
      return {
        id: "synthetic-demo-staff",
        roles: ["Console.Operator", "Inventory.Manager"],
      };
    invariant(
      authorization && authorization.startsWith("Bearer "),
      "unauthorized",
      "Sign in with your clinic Microsoft account.",
      401,
    );
    try {
      const { payload } = await jwtVerify(authorization.slice(7), keys!, {
        issuer: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
        audience: config.apiClientId,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "iat", "nbf", "oid", "tid", "azp", "scp"],
        clockTolerance: 5,
      });
      return validateClaims(payload, config);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "unauthorized",
        "Your session is invalid or expired. Sign in again.",
        401,
      );
    }
  };
}
export function requireRole(actor: Actor, kind: "operate" | "inventory") {
  const allowed =
    kind === "inventory"
      ? actor.roles.includes("Inventory.Manager")
      : actor.roles.includes("Console.Operator");
  invariant(
    allowed,
    "forbidden",
    "Your account does not have permission for this action.",
    403,
  );
}
