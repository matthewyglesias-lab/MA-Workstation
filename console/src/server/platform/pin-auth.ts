import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Actor, Role } from "../../shared/contracts.js";
import type { Config } from "./config.js";
import { DomainError, invariant } from "./errors.js";

export const pinLoginInput = z
  .object({
    staffCode: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[a-zA-Z0-9._-]+$/)
      .transform((v) => v.toLowerCase()),
    pin: z.string().regex(/^\d{6,12}$/, "Enter your 6–12 digit PIN."),
  })
  .strict();
export const staffRoles = z
  .array(z.enum(["Console.Reader", "Console.Operator", "Inventory.Manager"]))
  .min(1);
export const IDLE_MS = 15 * 60_000;
export const ABSOLUTE_MS = 8 * 60 * 60_000;
export const WINDOW_MS = 15 * 60_000;
export const STAFF_ATTEMPTS = 5;
export const IP_ATTEMPTS = 20;
const hashOptions = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
// Each scrypt calculation needs about 128 MiB of native memory. Bound both
// active work and waiting work so a sign-in burst fits the 512 MiB host.
let deriving = false;
const derivationQueue: Array<() => void> = [];
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
async function derive(pin: string, salt: Buffer): Promise<Buffer> {
  if (deriving) {
    invariant(
      derivationQueue.length < 4,
      "sign_in_busy",
      "Sign-in is busy. Try again in a moment.",
      429,
    );
    await new Promise<void>((resolve) => derivationQueue.push(resolve));
  } else deriving = true;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(pin, salt, 32, hashOptions, (error, result) =>
        error ? reject(error) : resolve(result),
      ),
    );
  } finally {
    const next = derivationQueue.shift();
    if (next) next();
    else deriving = false;
  }
}
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(pin, salt);
  return `scrypt$131072$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}
export async function verifyPin(
  pin: string,
  encoded: string,
): Promise<boolean> {
  const match = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(
    encoded,
  );
  if (!match) return false;
  const actual = await derive(pin, Buffer.from(match[1]!, "hex"));
  return timingSafeEqual(actual, Buffer.from(match[2]!, "hex"));
}
export function validateNewPin(pin: string) {
  invariant(/^\d{6,12}$/.test(pin), "pin_policy", "Use 6–12 digits.", 400);
  invariant(
    !/^(\d)\1+$/.test(pin) &&
      !"01234567890123456789".includes(pin) &&
      !"98765432109876543210".includes(pin) &&
      !["121212", "112233", "123123", "654321"].includes(pin),
    "pin_policy",
    "Choose a less predictable PIN.",
    400,
  );
}
export interface PinStaff {
  id: string;
  code: string;
  displayName: string;
  pinHash: string;
  roles: Role[];
  version: number;
  disabled: boolean;
}
export interface AttemptBucket {
  attempts: number;
  windowStart: number;
  blockedUntil: number;
}
export function consumeAttempt(
  bucket: AttemptBucket | undefined,
  limit: number,
  now: number,
): { bucket: AttemptBucket; allowed: boolean } {
  if (bucket && bucket.blockedUntil > now) return { bucket, allowed: false };
  const next =
    !bucket || now - bucket.windowStart >= WINDOW_MS
      ? { attempts: 0, windowStart: now, blockedUntil: 0 }
      : { ...bucket };
  if (next.attempts >= limit) {
    next.blockedUntil = now + WINDOW_MS;
    return { bucket: next, allowed: false };
  }
  next.attempts++;
  if (next.attempts >= limit) next.blockedUntil = now + WINDOW_MS;
  return { bucket: next, allowed: true };
}
export interface PinStore {
  login(
    staffCode: string,
    pin: string,
    ip: string,
    sessionHash: string,
  ): Promise<Actor>;
  session(sessionHash: string): Promise<Actor | null>;
  logout(sessionHash: string): Promise<void>;
}
export function staffActor(
  staff: Pick<PinStaff, "id" | "roles" | "displayName">,
): Actor {
  return { id: staff.id, roles: staff.roles, displayName: staff.displayName };
}
export function loginFailure(): DomainError {
  return new DomainError(
    "sign_in_failed",
    "Unable to sign in. Check your details or try again in 15 minutes.",
    401,
  );
}
export function sessionCookie(
  config: Config,
  token: string,
  clear = false,
): string {
  const secure = config.mode === "sql";
  return `${secure ? "__Host-console_session" : "console_demo_session"}=${token}; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}; Max-Age=${clear ? 0 : ABSOLUTE_MS / 1000}`;
}
export function readSessionCookie(
  config: Config,
  cookies?: string,
): string | undefined {
  const name =
    config.mode === "sql" ? "__Host-console_session" : "console_demo_session";
  const values = (cookies || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return undefined;
  const value = values[0]!.slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
export const csrfFor = (token: string) => digest(`console-csrf:${token}`);
export function checkCsrf(token: string, value: unknown) {
  const expected = csrfFor(token);
  invariant(
    typeof value === "string" &&
      /^[a-f0-9]{64}$/.test(value) &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(value)),
    "csrf",
    "Your session needs to be refreshed.",
    403,
  );
}
export function checkPinOrigin(config: Config, origin?: string) {
  const allowed = config.publicOrigin
    ? [config.publicOrigin]
    : config.mode === "demo"
      ? ["localhost", "127.0.0.1", "[::1]"].flatMap((host) =>
          [config.port, 5175].map((port) => `http://${host}:${port}`),
        )
      : [];
  invariant(
    origin && allowed.includes(origin),
    "origin",
    "This request must come from the clinic console.",
    403,
  );
}
export class PinAuthentication {
  constructor(
    readonly store: PinStore,
    readonly config: Config,
  ) {}
  async login(body: unknown, ip: string) {
    const input = pinLoginInput.parse(body);
    const token = randomBytes(32).toString("base64url");
    const actor = await this.store.login(
      input.staffCode,
      input.pin,
      ip,
      digest(token),
    );
    return {
      actor,
      csrfToken: csrfFor(token),
      cookie: sessionCookie(this.config, token),
    };
  }
  async authenticate(cookies?: string) {
    const token = readSessionCookie(this.config, cookies);
    const actor = token ? await this.store.session(digest(token)) : null;
    invariant(
      actor && token,
      "unauthorized",
      "Enter your PIN to continue.",
      401,
    );
    return { actor, token, csrfToken: csrfFor(token) };
  }
  async logout(token: string) {
    await this.store.logout(digest(token));
  }
}
