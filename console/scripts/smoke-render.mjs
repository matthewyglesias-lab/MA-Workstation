// Small, explicit synthetic acceptance run. Never deletes records or prints credentials.
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
let cookie = "";
let csrfToken = "";
let origin;
let stage = "configuration";

async function hiddenPin() {
  expect(
    process.stdin.isTTY && process.stdout.isTTY,
    "A terminal is required for the hidden PIN prompt; otherwise supply CONSOLE_SMOKE_PIN securely.",
  );
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = process.stdin.isRaw;
    const finish = (error) => {
      process.stdin.off("data", receive);
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const receive = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003" || character === "\u0004") {
          finish(new Error("PIN entry cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b")
          value = value.slice(0, -1);
        else if (/^\d$/.test(character) && value.length < 13)
          value += character;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.on("data", receive);
    // Disable terminal echo before advertising the prompt (including pasted input).
    process.stdout.write("PIN (hidden): ");
    process.stdin.resume();
  });
}

async function request(path, options = {}) {
  const {
    method = "GET",
    body,
    key,
    authenticated = true,
    includeOrigin = true,
    expected = 200,
    csrf = csrfToken,
  } = options;
  const headers = {};
  if (authenticated && cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    if (includeOrigin) headers.Origin = origin;
    if (authenticated && csrf) headers["X-CSRF-Token"] = csrf;
    if (key) headers["Idempotency-Key"] = key;
  }
  let response;
  try {
    response = await fetch(`${origin}${path}`, {
      method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(65000),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(
      `${method} ${path}: connection failed or timed out; the operation may be unconfirmed.`,
    );
  }
  // Do not include response bodies, request bodies, cookies or tokens in failure output.
  expect(
    response.status === expected,
    `${method} ${path}: expected HTTP ${expected}, received ${response.status}.`,
  );
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${method} ${path}: expected a JSON response.`);
  }
  return { data, headers: response.headers };
}

async function command(path, body, options = {}) {
  return (
    await request(`/api/v1${path}`, {
      method: "POST",
      body,
      key: randomUUID(),
      ...options,
    })
  ).data;
}

async function stockIs(lotId, onHand, reserved, uses) {
  const { data } = await request("/api/v1/overview");
  const lot = data.lots?.find((value) => value.id === lotId);
  expect(
    lot && lot.onHand === onHand && lot.reserved === reserved,
    `Synthetic stock must have ${onHand} on hand and ${reserved} reserved.`,
  );
  if (uses !== undefined)
    expect(
      data.movements?.filter(
        (value) => value.lotId === lotId && value.kind === "use",
      ).length === uses,
      "Synthetic stock consumption count is incorrect.",
    );
}

async function main() {
  expect(
    process.env.CONSOLE_SMOKE_SYNTHETIC === "YES",
    "Set CONSOLE_SMOKE_SYNTHETIC=YES only after confirming this is a synthetic evaluation database.",
  );
  const target = new URL(
    process.env.CONSOLE_SMOKE_URL || "https://ipmg-clinic-console.onrender.com",
  );
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
    target.hostname,
  );
  expect(
    !target.username &&
      !target.password &&
      !target.search &&
      !target.hash &&
      target.pathname === "/",
    "CONSOLE_SMOKE_URL must be an origin without credentials, path, query or fragment.",
  );
  expect(
    target.protocol === "https:" || (loopback && target.protocol === "http:"),
    "Remote targets require HTTPS; HTTP is allowed only for a local demo.",
  );
  origin = target.origin;
  const run = `SMOKE-${Date.now()}-${randomUUID().slice(0, 8)}`;
  console.log(`Synthetic acceptance target: ${origin}`);
  console.log(
    `Run: ${run}. Synthetic records are retained for review; no deletion is performed.`,
  );

  stage = "health and authentication boundaries";
  expect(
    (await request("/api/health", { authenticated: false })).data.status ===
      "ok",
    "Health check failed.",
  );
  const { data: config, headers: configHeaders } = await request(
    "/api/config",
    { authenticated: false },
  );
  expect(
    config.authMode === "pin" && config.mode === (loopback ? "demo" : "sql"),
    "Expected PIN authentication with SQL remotely or demo storage on loopback.",
  );
  await request("/api/v1/overview", { authenticated: false, expected: 401 });
  await request("/api/v1/injections", { authenticated: false, expected: 401 });
  await request("/api/auth/pin", {
    method: "POST",
    body: {},
    authenticated: false,
    includeOrigin: false,
    expected: 403,
  });

  let staffCode = process.env.CONSOLE_SMOKE_STAFF_CODE;
  if (!staffCode) {
    expect(
      process.stdin.isTTY,
      "Supply CONSOLE_SMOKE_STAFF_CODE or run from a terminal.",
    );
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      staffCode = await prompt.question("Staff code: ");
    } finally {
      prompt.close();
    }
  }
  let pin = process.env.CONSOLE_SMOKE_PIN || (await hiddenPin());
  delete process.env.CONSOLE_SMOKE_PIN;
  expect(
    /^[a-zA-Z0-9._-]{2,40}$/.test(staffCode.trim()) && /^\d{4,12}$/.test(pin),
    "Staff code or PIN format is invalid.",
  );
  const login = await request("/api/auth/pin", {
    method: "POST",
    body: { staffCode, pin },
    authenticated: false,
  });
  pin = "";
  const sessionName = loopback
    ? "console_demo_session"
    : "__Host-console_session";
  const setCookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${sessionName}=`));
  expect(setCookie, "Session cookie was not returned.");
  cookie = setCookie.split(";")[0];
  csrfToken = login.data.csrfToken;
  expect(
    typeof csrfToken === "string" && /^[a-f0-9]{64}$/.test(csrfToken),
    "CSRF token was not returned.",
  );
  expect(
    /;\s*HttpOnly(?:;|$)/i.test(setCookie) &&
      /;\s*SameSite=Strict(?:;|$)/i.test(setCookie) &&
      /;\s*Path=\/(?:;|$)/i.test(setCookie),
    "Session cookie lacks required attributes.",
  );
  expect(
    loopback || /;\s*Secure(?:;|$)/i.test(setCookie),
    "Remote session cookie must be Secure.",
  );
  expect(
    login.data.actor?.roles?.includes("Console.Operator") &&
      login.data.actor.roles.includes("Inventory.Manager"),
    "The smoke-test staff account requires Console.Operator and Inventory.Manager roles.",
  );
  const session = (await request("/api/v1/session")).data;
  expect(
    session.actor?.id === login.data.actor.id &&
      session.csrfToken === csrfToken,
    "Session did not persist.",
  );
  await request("/api/v1/patients", {
    method: "POST",
    body: {},
    csrf: "invalid",
    expected: 403,
  });
  console.log("PASS: authentication, cookie, session and CSRF boundaries.");

  stage = "synthetic inventory and injection setup";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.clinicTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(configHeaders.get("date") || Date.now()));
  const patient = await command(
    "/patients",
    {
      tebraId: run,
      displayName: `${run} Synthetic Patient`,
      dob: "1990-01-01",
      verifiedInTebra: true,
    },
    { expected: 201 },
  );
  const product = await command(
    "/products",
    {
      name: `${run} Synthetic Injection`,
      strength: "1 mg",
      unit: "vial",
      ndc: null,
    },
    { expected: 201 },
  );
  const lot = await command(
    "/lots",
    {
      productId: product.id,
      lotNumber: run,
      expiresOn: `${Number(today.slice(0, 4)) + 2}-12-31`,
      location: "SYNTHETIC EVALUATION ONLY",
      ownership: "sample",
      ownerPatientId: null,
    },
    { expected: 201 },
  );
  await command(
    "/movements",
    {
      lotId: lot.id,
      kind: "receive",
      quantity: 2,
      patientId: null,
      reason: `${run}: synthetic stock only`,
      reversesId: null,
    },
    { expected: 201 },
  );
  const order = {
    patientId: patient.id,
    productId: product.id,
    doseSequence: 1,
    tebraOrderReference: `${run}-NOT-IN-TEBRA`,
    orderingProvider: "Synthetic evaluation only",
    dose: 1,
    doseUnit: "mg",
    route: "IM",
    site: "Synthetic site; no patient administration",
    plannedOn: today,
    lastAdministrationAt: null,
    lastAdministrationOn: null,
    timingCategory: "initiation",
    timingPlan: "Synthetic evaluation only; no clinical order",
    nextDueOn: null,
  };
  const reviewBody = (version) => ({
    expectedVersion: version,
    lotId: lot.id,
    stockUnits: 1,
    checks: {
      identity: true,
      order: true,
      allergy: true,
      medication: true,
      timing: true,
      consent: true,
    },
    allergyReview: "Synthetic evaluation only",
    clinicalReview: "Synthetic evaluation only",
    preparation: "Synthetic evaluation only",
    siteAssessment: "Synthetic evaluation only",
    vitals: {
      status: "not_recorded",
      bpSystolic: null,
      bpDiastolic: null,
      pulse: null,
      temperatureC: null,
      oxygenSaturation: null,
      reason: "No real patient; synthetic evaluation",
    },
    observationPlan: "No real patient; synthetic evaluation",
  });
  const created = await command("/injections", order, { expected: 201 });
  const reviewed = await command(
    `/injections/${created.id}/review`,
    reviewBody(created.version),
  );
  expect(
    reviewed.status === "reviewed",
    "Injection did not enter reviewed state.",
  );
  await stockIs(lot.id, 2, 1, 0);

  stage = "administration, replay and version conflict";
  // Use server-generated review time, avoiding client/server clock skew.
  await delay(20);
  const administrationBody = {
    expectedVersion: reviewed.version,
    administeredAt: new Date(
      Date.parse(reviewed.review.reviewedAt) + 1,
    ).toISOString(),
    administeredByName: "Synthetic evaluation only",
    tolerance: "No real administration",
    observation: "No real administration",
    delivery: "complete",
    actualDose: 1,
    issueAction: null,
  };
  const administrationKey = randomUUID();
  const administered = await command(
    `/injections/${created.id}/administer`,
    administrationBody,
    { key: administrationKey },
  );
  const replay = await command(
    `/injections/${created.id}/administer`,
    administrationBody,
    { key: administrationKey },
  );
  expect(
    administered.status === "administered" &&
      JSON.stringify(replay) === JSON.stringify(administered),
    "Idempotent replay changed the administration response.",
  );
  await stockIs(lot.id, 1, 0, 1);
  const stale = await command(
    `/injections/${created.id}/administer`,
    administrationBody,
    { expected: 409 },
  );
  expect(
    stale.code === "version_conflict",
    "Stale-version request did not return version_conflict.",
  );
  const changedReplay = await command(
    `/injections/${created.id}/administer`,
    { ...administrationBody, observation: "Changed synthetic replay" },
    { key: administrationKey, expected: 409 },
  );
  expect(
    changedReplay.code === "idempotency_conflict",
    "Changed replay did not return idempotency_conflict.",
  );
  console.log(
    "PASS: reservation, one administration, replay safety and version conflict.",
  );

  stage = "amendment and separate filing";
  const filed = await command(`/injections/${created.id}/file`, {
    expectedVersion: administered.version,
    tebraReference: `${run}-SIMULATED-FILING-1`,
  });
  expect(filed.handoff === "filed", "Filing did not update handoff.");
  const amended = await command(`/injections/${created.id}/amend`, {
    expectedVersion: filed.version,
    reason: "Synthetic correction test",
    text: "Synthetic amendment; no patient record changed",
  });
  expect(
    amended.handoff === "pending" &&
      amended.amendments.length === 1 &&
      JSON.stringify(amended.administration) ===
        JSON.stringify(administered.administration),
    "Amendment did not preserve the original administration and reopen filing.",
  );
  const refiled = await command(`/injections/${created.id}/file`, {
    expectedVersion: amended.version,
    tebraReference: `${run}-SIMULATED-FILING-2`,
  });
  expect(
    refiled.handoff === "filed" &&
      refiled.filings.length === 2 &&
      refiled.filings[1].amendmentCount === 1,
    "Refiling did not preserve both acknowledgments.",
  );

  stage = "held and cancelled reservation release";
  const dispositionIds = [];
  for (const [index, status] of ["held", "cancelled"].entries()) {
    const draft = await command(
      "/injections",
      { ...order, doseSequence: index + 2 },
      { expected: 201 },
    );
    const review = await command(
      `/injections/${draft.id}/review`,
      reviewBody(draft.version),
    );
    await stockIs(lot.id, 1, 1, 1);
    const disposed = await command(`/injections/${draft.id}/disposition`, {
      expectedVersion: review.version,
      status,
      reason: `${run}: synthetic ${status} test`,
    });
    expect(
      disposed.status === status && disposed.review === null,
      "Disposition did not clear its review.",
    );
    dispositionIds.push(disposed.id);
    await stockIs(lot.id, 1, 0, 1);
  }
  const saved = (await request("/api/v1/injections")).data;
  const savedAdministration = saved.find((value) => value.id === created.id);
  expect(
    savedAdministration &&
      JSON.stringify(savedAdministration) === JSON.stringify(refiled) &&
      dispositionIds.every((id) => saved.some((value) => value.id === id)),
    "Saved cases did not survive a fresh read.",
  );
  console.log(
    "PASS: immutable amendment, refiling, hold/cancel release and fresh-read persistence.",
  );

  stage = "logout";
  await request("/api/auth/logout", { method: "POST", body: {} });
  await request("/api/v1/session", { expected: 401 });
  cookie = "";
  csrfToken = "";
  console.log("PASS: logout revoked the existing session.");
  console.log(
    `PASS: synthetic acceptance complete (${run}). Retained: one patient, product and lot; three injection cases.`,
  );
  console.log(
    "Service-restart persistence, another workstation, browser/print layout and live capacity still require separate verification.",
  );
}

try {
  await main();
} catch (error) {
  console.error(
    `FAIL at ${stage}: ${error instanceof Error ? error.message : "Unexpected failure."}`,
  );
  console.error(
    "Synthetic records may remain at the last completed stage. No records were deleted.",
  );
  process.exitCode = 1;
} finally {
  if (cookie && csrfToken && origin) {
    try {
      await request("/api/auth/logout", { method: "POST", body: {} });
    } catch {
      console.error(
        "Session cleanup could not be confirmed; sign out through the app or revoke the test session.",
      );
    }
  }
  cookie = "";
  csrfToken = "";
}
