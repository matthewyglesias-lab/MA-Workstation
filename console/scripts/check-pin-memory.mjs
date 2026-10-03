// Synthetic resource test against compiled server code; no database or secrets.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "../dist/server/server/app.js";
import { DemoRepository } from "../dist/server/server/platform/demo-repository.js";
import { MemoryPinStore } from "../dist/server/server/platform/memory-pin-store.js";
import {
  hashPin,
  verifyPin,
  PinAuthentication,
} from "../dist/server/server/platform/pin-auth.js";
// Include the production SQL driver's module footprint in the measurement.
import "../dist/server/server/platform/sql-connection.js";

const encoded = await hashPin("482951");
const config = {
  mode: "sql",
  authMode: "pin",
  publicOrigin: "https://memory-test.example",
  clinicId: randomUUID(),
  host: "127.0.0.1",
  port: 3100,
  timezone: "America/Los_Angeles",
};
const store = new MemoryPinStore(encoded);
store.staff.set("synthetic", {
  id: randomUUID(),
  code: "synthetic",
  displayName: "Synthetic staff",
  pinHash: encoded,
  roles: ["Console.Operator"],
  version: 1,
  disabled: false,
});
const app = await buildApp(
  config,
  new DemoRepository(),
  undefined,
  new PinAuthentication(store, config),
);
try {
  // Independent callers bypass the demo store's serialization, reproducing
  // parallel verifications from separate SQL staff/IP transactions.
  const burst = await Promise.allSettled(
    Array.from({ length: 12 }, () => verifyPin("482951", encoded)),
  );
  assert(burst.some((r) => r.status === "fulfilled" && r.value === true));
  assert(burst.some((r) => r.status === "rejected"));
  for (const result of burst) {
    if (result.status === "rejected")
      assert.equal(result.reason.code, "sign_in_busy");
  }
  assert.equal(await verifyPin("482950", encoded), false);
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/pin",
    headers: { origin: config.publicOrigin },
    payload: { staffCode: "synthetic", pin: "482951" },
  });
  assert.equal(login.statusCode, 200, "Sign-in must recover after a burst");
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  assert.equal(
    (await app.inject({ url: "/api/v1/overview", headers: { cookie } }))
      .statusCode,
    200,
  );
  const peakMiB = process.resourceUsage().maxRSS / 1024;
  assert(
    peakMiB < 440,
    `Peak RSS ${peakMiB.toFixed(1)} MiB exceeds the budget`,
  );
  console.log(
    `PIN burst passed: bounded memory, overload rejected, sign-in recovered; peak RSS ${peakMiB.toFixed(1)} MiB (synthetic Linux test, 512 MiB target).`,
  );
} finally {
  await app.close();
}
