import { randomUUID } from "node:crypto";
import type { Actor } from "../../shared/contracts.js";
import {
  ABSOLUTE_MS,
  IDLE_MS,
  IP_ATTEMPTS,
  STAFF_ATTEMPTS,
  consumeAttempt,
  digest,
  hashPin,
  loginFailure,
  staffActor,
  verifyPin,
  type AttemptBucket,
  type PinStaff,
  type PinStore,
} from "./pin-auth.js";

/** Synthetic local demo only. SQL mode never instantiates this store. */
export class MemoryPinStore implements PinStore {
  readonly staff = new Map<string, PinStaff>();
  readonly attempts = new Map<string, AttemptBucket>();
  readonly sessions = new Map<
    string,
    {
      staffCode: string;
      version: number;
      createdAt: number;
      lastSeen: number;
      revoked: boolean;
    }
  >();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly dummyHash: string,
    private readonly now = () => Date.now(),
  ) {}
  async login(
    code: string,
    pin: string,
    ip: string,
    sessionHash: string,
  ): Promise<Actor> {
    const result = this.queue.then(async () => {
      const now = this.now();
      const staffKey = `staff:${digest(code)}`,
        ipKey = `ip:${digest(ip)}`;
      const staffAttempt = consumeAttempt(
        this.attempts.get(staffKey),
        STAFF_ATTEMPTS,
        now,
      );
      const ipAttempt = consumeAttempt(
        this.attempts.get(ipKey),
        IP_ATTEMPTS,
        now,
      );
      this.attempts.set(staffKey, staffAttempt.bucket);
      this.attempts.set(ipKey, ipAttempt.bucket);
      if (!staffAttempt.allowed || !ipAttempt.allowed) throw loginFailure();
      const staff = this.staff.get(code);
      const verified = await verifyPin(pin, staff?.pinHash || this.dummyHash);
      if (!verified || !staff || staff.disabled) throw loginFailure();
      this.attempts.delete(staffKey);
      this.sessions.set(sessionHash, {
        staffCode: code,
        version: staff.version,
        createdAt: now,
        lastSeen: now,
        revoked: false,
      });
      return staffActor(staff);
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
  async session(sessionHash: string) {
    const session = this.sessions.get(sessionHash);
    const staff = session && this.staff.get(session.staffCode);
    const now = this.now();
    if (
      !session ||
      !staff ||
      session.revoked ||
      staff.disabled ||
      session.version !== staff.version ||
      now - session.createdAt >= ABSOLUTE_MS ||
      now - session.lastSeen >= IDLE_MS
    )
      return null;
    session.lastSeen = now;
    return staffActor(staff);
  }
  async logout(sessionHash: string) {
    const session = this.sessions.get(sessionHash);
    if (session) session.revoked = true;
  }
}
export async function demoPinStore() {
  const hash = await hashPin("123456");
  const store = new MemoryPinStore(hash);
  store.staff.set("demo", {
    id: randomUUID(),
    code: "demo",
    displayName: "Demo staff",
    pinHash: hash,
    roles: ["Console.Operator", "Inventory.Manager"],
    version: 1,
    disabled: false,
  });
  return store;
}
