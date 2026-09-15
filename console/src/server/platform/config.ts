import { z } from "zod";
const id = z.string().uuid();
export interface Config {
  mode: "demo" | "sql";
  authMode?: "demo" | "pin" | "entra";
  publicOrigin?: string;
  host: string;
  port: number;
  clinicId: string;
  timezone: string;
  tenantId?: string;
  apiClientId?: string;
  webClientId?: string;
}
export function readConfig(env: NodeJS.ProcessEnv): Config {
  const mode = z.enum(["demo", "sql"]).parse(env.CONSOLE_MODE);
  const host = env.HOST || "127.0.0.1";
  if (
    mode === "demo" &&
    (env.NODE_ENV === "production" ||
      !["127.0.0.1", "::1", "localhost"].includes(host))
  )
    throw new Error("Demo mode is restricted to local development.");
  const authMode =
    mode === "sql"
      ? z.enum(["pin", "entra"]).parse(env.AUTH_MODE)
      : z.enum(["demo", "pin"]).parse(env.AUTH_MODE || "pin");
  const publicOrigin = env.PUBLIC_ORIGIN;
  if (mode === "sql" && authMode === "pin") {
    if (!publicOrigin)
      throw new Error("PUBLIC_ORIGIN is required for PIN access.");
    const origin = new URL(publicOrigin);
    if (
      origin.protocol !== "https:" ||
      origin.origin !== publicOrigin ||
      origin.username ||
      origin.password
    )
      throw new Error("PUBLIC_ORIGIN must be the exact HTTPS console origin.");
  }
  const timezone = env.CLINIC_TIMEZONE || "America/Los_Angeles";
  new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  return {
    mode,
    authMode,
    publicOrigin,
    host,
    port: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.PORT || 3100),
    clinicId: id.parse(env.CLINIC_ID),
    timezone,
    ...(mode === "sql" && authMode === "entra"
      ? {
          tenantId: id.parse(env.ENTRA_TENANT_ID),
          apiClientId: id.parse(env.ENTRA_API_CLIENT_ID),
          webClientId: id.parse(env.ENTRA_WEB_CLIENT_ID),
        }
      : {}),
  };
}
export function clinicDate(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
