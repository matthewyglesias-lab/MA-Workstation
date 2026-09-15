import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/server/app.js";
import { readConfig, type Config } from "../src/server/platform/config.js";
import { DemoRepository } from "../src/server/platform/demo-repository.js";
import { MemoryPinStore } from "../src/server/platform/memory-pin-store.js";
import {
  ABSOLUTE_MS,
  IDLE_MS,
  IP_ATTEMPTS,
  STAFF_ATTEMPTS,
  WINDOW_MS,
  PinAuthentication,
  checkCsrf,
  consumeAttempt,
  csrfFor,
  digest,
  hashPin,
  readSessionCookie,
  sessionCookie,
  validateNewPin,
  verifyPin,
  type AttemptBucket,
} from "../src/server/platform/pin-auth.js";

let encoded = "";
beforeAll(async () => {
  encoded = await hashPin("482951");
});
function fixture(now = () => Date.now()) {
  const store = new MemoryPinStore(encoded, now);
  store.staff.set("matthew", {
    id: randomUUID(),
    code: "matthew",
    displayName: "Matthew",
    pinHash: encoded,
    roles: ["Console.Operator"],
    version: 1,
    disabled: false,
  });
  return store;
}
const config: Config = {
  mode: "sql",
  authMode: "pin",
  publicOrigin: "https://clinic.example",
  clinicId: randomUUID(),
  host: "127.0.0.1",
  port: 3100,
  timezone: "America/Los_Angeles",
};
const login = { staffCode: "matthew", pin: "482951" };

describe("individual PIN credentials", () => {
  it("salts slow hashes, verifies exactly, and rejects predictable provisioned PINs", async () => {
    const another = await hashPin("482951");
    expect(another).not.toBe(encoded);
    expect(await verifyPin("482951", encoded)).toBe(true);
    expect(await verifyPin("482950", encoded)).toBe(false);
    expect(await verifyPin("482951", "malformed")).toBe(false);
    for (const value of [
      "123456",
      "111111",
      "12345",
      "abcdef",
      "121212",
      "1234567890123",
    ])
      expect(() => validateNewPin(value)).toThrow();
    expect(() => validateNewPin("482951")).not.toThrow();
  });
  it("requires explicit SQL auth mode and HTTPS origin, rejects demo bypass", () => {
    const env = { CONSOLE_MODE: "sql", CLINIC_ID: config.clinicId };
    expect(() => readConfig(env)).toThrow();
    expect(() => readConfig({ ...env, AUTH_MODE: "demo" })).toThrow();
    expect(() => readConfig({ ...env, AUTH_MODE: "pin" })).toThrow();
    for (const origin of [
      "http://clinic.example",
      "https://clinic.example/",
      "https://clinic.example/path",
    ])
      expect(() =>
        readConfig({ ...env, AUTH_MODE: "pin", PUBLIC_ORIGIN: origin }),
      ).toThrow();
    expect(
      readConfig({
        ...env,
        AUTH_MODE: "pin",
        PUBLIC_ORIGIN: "https://clinic.example",
      }).authMode,
    ).toBe("pin");
  });
  it("locks all parallel attempts after the staff budget and recovers after the timed window", async () => {
    let now = 1_000_000;
    const store = fixture(() => now);
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        store.login("matthew", "000000", `ip-${i}`, digest(`attempt-${i}`)),
      ),
    );
    expect(attempts.every((result) => result.status === "rejected")).toBe(true);
    expect(store.attempts.get(`staff:${digest("matthew")}`)?.attempts).toBe(
      STAFF_ATTEMPTS,
    );
    await expect(
      store.login("matthew", "482951", "another-ip", digest("blocked")),
    ).rejects.toThrow("Unable to sign in");
    now += WINDOW_MS + 1;
    expect(
      (await store.login("matthew", "482951", "another-ip", digest("allowed")))
        .displayName,
    ).toBe("Matthew");
  }, 15000);
  it("limits IP-wide attempts and does not prolong lockout for blocked traffic", () => {
    let bucket: AttemptBucket | undefined;
    for (let i = 0; i < IP_ATTEMPTS; i++) {
      const result = consumeAttempt(bucket, IP_ATTEMPTS, 1000);
      expect(result.allowed).toBe(true);
      bucket = result.bucket;
    }
    const blocked = consumeAttempt(bucket, IP_ATTEMPTS, 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.bucket.blockedUntil).toBe(1000 + WINDOW_MS);
    expect(
      consumeAttempt(blocked.bucket, IP_ATTEMPTS, 1001 + WINDOW_MS).allowed,
    ).toBe(true);
  });
  it("enforces idle/absolute expiry, role changes, disabled users, and credential revocation", async () => {
    let now = 1_000_000;
    const store = fixture(() => now);
    const token = digest("session");
    await store.login("matthew", "482951", "ip", token);
    expect(await store.session(token)).toBeTruthy();
    store.staff.get("matthew")!.roles = ["Console.Reader"];
    expect((await store.session(token))?.roles).toEqual(["Console.Reader"]);
    now += IDLE_MS;
    expect(await store.session(token)).toBeNull();
    await store.login("matthew", "482951", "ip", token);
    for (let elapsed = 0; elapsed < ABSOLUTE_MS; elapsed += IDLE_MS / 2) {
      now += IDLE_MS / 2;
      const session = await store.session(token);
      if (elapsed + IDLE_MS / 2 >= ABSOLUTE_MS) expect(session).toBeNull();
      else expect(session).toBeTruthy();
    }
    await store.login("matthew", "482951", "ip", token);
    store.staff.get("matthew")!.version++;
    expect(await store.session(token)).toBeNull();
    await store.login("matthew", "482951", "ip", token);
    store.staff.get("matthew")!.disabled = true;
    expect(await store.session(token)).toBeNull();
    await expect(
      store.login("matthew", "482951", "ip", digest("disabled")),
    ).rejects.toThrow("Unable to sign in");
  }, 15000);
  it("uses secure cookie attributes and rejects ambiguous cookies or mismatched CSRF", () => {
    const token = "a".repeat(43);
    expect(sessionCookie(config, token)).toContain("__Host-console_session=");
    expect(sessionCookie(config, token)).toContain(
      "HttpOnly; SameSite=Strict; Secure",
    );
    expect(sessionCookie(config, token)).not.toContain("Domain=");
    expect(
      readSessionCookie(
        config,
        `__Host-console_session=${token}; __Host-console_session=${token}`,
      ),
    ).toBeUndefined();
    expect(
      readSessionCookie(config, "__Host-console_session=short"),
    ).toBeUndefined();
    expect(
      readSessionCookie(config, `console_demo_session=${token}`),
    ).toBeUndefined();
    expect(() => checkCsrf(token, csrfFor(token))).not.toThrow();
    expect(() => checkCsrf(token, csrfFor("other"))).toThrow();
    expect(() => checkCsrf(token, undefined)).toThrow();
  });
});

describe("PIN API boundary", () => {
  it("gates patient reads, requires origin/CSRF on writes, and invalidates logout", async () => {
    const store = fixture();
    const app = await buildApp(
      config,
      new DemoRepository(),
      undefined,
      new PinAuthentication(store, config),
    );
    try {
      expect((await app.inject({ url: "/api/v1/overview" })).statusCode).toBe(
        401,
      );
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/pin",
            payload: login,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/pin",
            payload: login,
            headers: { origin: "https://evil.example" },
          })
        ).statusCode,
      ).toBe(403);
      const result = await app.inject({
        method: "POST",
        url: "/api/auth/pin",
        payload: login,
        headers: { origin: config.publicOrigin! },
      });
      expect(result.statusCode).toBe(200);
      const setCookie = String(result.headers["set-cookie"]);
      expect(setCookie).toContain("Secure");
      const cookie = setCookie.split(";")[0]!;
      const csrf = result.json().csrfToken;
      expect(result.json().actor.displayName).toBe("Matthew");
      const session = await app.inject({
        url: "/api/v1/session",
        headers: { cookie },
      });
      expect(session.statusCode).toBe(200);
      expect(session.json().csrfToken).toBe(csrf);
      const payload = {
        tebraId: "SYN-001",
        displayName: "Synthetic Patient",
        dob: "1990-01-01",
        verifiedInTebra: true,
      };
      const headers = {
        cookie,
        origin: config.publicOrigin!,
        "idempotency-key": randomUUID(),
      };
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/patients",
            headers,
            payload,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/patients",
            headers: {
              ...headers,
              "x-csrf-token": csrf,
              origin: "https://evil.example",
            },
            payload,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/patients",
            headers: { ...headers, "x-csrf-token": csrf },
            payload,
          })
        ).statusCode,
      ).toBe(201);
      expect(
        (await app.inject({ method: "POST", url: "/api/auth/logout", headers }))
          .statusCode,
      ).toBe(403);
      const logout = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { ...headers, "x-csrf-token": csrf },
      });
      expect(logout.statusCode).toBe(200);
      expect(String(logout.headers["set-cookie"])).toContain("Max-Age=0");
      expect(
        (await app.inject({ url: "/api/v1/overview", headers: { cookie } }))
          .statusCode,
      ).toBe(401);
    } finally {
      await app.close();
    }
  });
  it("ignores spoofed forwarding headers for distributed IP limits", async () => {
    const store = fixture();
    store.attempts.set(`ip:${digest("127.0.0.1")}`, {
      attempts: IP_ATTEMPTS,
      windowStart: Date.now(),
      blockedUntil: Date.now() + WINDOW_MS,
    });
    const app = await buildApp(
      config,
      new DemoRepository(),
      undefined,
      new PinAuthentication(store, config),
    );
    try {
      const result = await app.inject({
        method: "POST",
        url: "/api/auth/pin",
        payload: login,
        headers: {
          origin: config.publicOrigin!,
          "x-forwarded-for": "8.8.8.8",
          forwarded: "for=8.8.8.8",
        },
      });
      expect(result.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
  it("never accepts fictional credentials in a SQL staff store", async () => {
    const store = fixture();
    const app = await buildApp(
      config,
      new DemoRepository(),
      undefined,
      new PinAuthentication(store, config),
    );
    try {
      const result = await app.inject({
        method: "POST",
        url: "/api/auth/pin",
        payload: { staffCode: "demo", pin: "123456" },
        headers: { origin: config.publicOrigin! },
      });
      expect(result.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
