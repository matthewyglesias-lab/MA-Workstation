import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: class {
    getToken = vi.fn().mockResolvedValue({ token: "managed-identity-token" });
  },
}));

import { evaluateHandler, finalizeHandler } from "../../src/functions/injections";
import {
  POWER_APPS_INJECTION_SCHEMA_VERSION,
  evaluateInjectionForPowerApps,
} from "../../../src/integrations/power-apps";
import { emptyInjectionEncounter, type InjectionEncounter } from "../../../src/domain/injection";

const injectionId = "9d7f434e-7f47-4c45-bd8e-c88d9a8cfbdd";
const idempotencyKey = "f4d3700d-ec30-4f1f-87e1-9dd6b1bbce31";
const otherIdempotencyKey = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
const finalizerRole = "Injection.ReadWrite";

const source = {
  actionId: injectionId,
  checkInId: "check-in-200",
  patientId: "patient-300",
  orderId: "order-400",
  sourceRecordVersion: 'W/"42"',
  patientRecordNumber: "MRN-500",
};
const { sourceRecordVersion: _sourceVersion, ...storedSource } = source;

// The protected patient-context snapshot is authoritative over Draft
// JSON's patient identity (resolveProtectedPatientContext). Values here
// intentionally match encounter()'s patient and source.patientRecordNumber
// so existing assertions observe the override as a no-op; tests that
// specifically exercise the override use a distinct value instead.
const patientContext = { name: "Test, Patient", dob: "1980-05-12", mrn: "MRN-500" };
const patientContextJson = JSON.stringify(patientContext);

const encounter = (): InjectionEncounter => ({
  ...emptyInjectionEncounter(),
  patient: { name: "Test, Patient", dob: "1980-05-12" },
  medicationKey: "sustenna",
  dose: "156 mg",
  route: "IM",
  site: "L deltoid",
  intervalKey: "q4wk",
  reason: "scheduled",
  priorDoseDate: "2026-08-02",
  administrationDate: "2026-08-30",
  administrationTime: "13:15",
  nextDoseDate: "2026-09-27",
  orderingProvider: "Jane Doe, MD",
  administeredBy: "MA User",
  allergies: "NKDA",
  traceability: {
    ndc: "50458-564-01",
    lot: "LOT-100",
    expiration: "2027-10",
  },
  response: { kind: "well" },
  attestations: {
    id2: true,
    rights: true,
    allergy: true,
    consent: true,
    prior: true,
    screen: true,
    hygiene: true,
  },
  verifications: { resuspend: true },
  acuteSafetyScreenConfirmed: true,
  disposition: { kind: "administered" },
  details: { productSource: "Clinic stock" },
});

const principalHeaderFor = (userId: string, userDetails: string): string =>
  Buffer.from(
    JSON.stringify({ userId, userDetails, userRoles: [finalizerRole] }),
    "utf8",
  ).toString("base64");

const principalHeader = principalHeaderFor("entra-object-id", "MA User");
const otherPrincipalHeader = principalHeaderFor("entra-object-id-2", "Other MA User");

const environment = {
  CLINIC_FACILITY_NAME: "IPMG - SAN BERNARDINO",
  CLINIC_FACILITY_UNIT: "MEDICATION ADMINISTRATION CLINIC",
  CLINIC_PHONE: "(909) 887-6222",
  CLINIC_TIME_ZONE: "America/Los_Angeles",
  CLINIC_PROVIDER_REGISTER: "san-bernardino-v1",
  ENTRA_REQUIRED_ROLE: finalizerRole,
  DATAVERSE_URL: "https://example.crm.dynamics.com",
  DATAVERSE_ACTION_ENTITY_SET: "ipmg_clinicalactions",
  DATAVERSE_DRAFT_JSON_COLUMN: "ipmg_draftjson",
  DATAVERSE_FINAL_JSON_COLUMN: "ipmg_finaljson",
  DATAVERSE_STATUS_COLUMN: "ipmg_workflowstatus",
  DATAVERSE_IDEMPOTENCY_COLUMN: "ipmg_idempotencykey",
  DATAVERSE_TEBRA_ACKNOWLEDGED_COLUMN: "ipmg_tebraacknowledged",
  DATAVERSE_CHECKIN_ID_COLUMN: "ipmg_checkinid",
  DATAVERSE_PATIENT_ID_COLUMN: "ipmg_patientid",
  DATAVERSE_ORDER_ID_COLUMN: "ipmg_orderid",
  DATAVERSE_PATIENT_CONTEXT_COLUMN: "ipmg_patientcontextjson",
  DATAVERSE_DRAFT_STATUS_VALUE: "100000000",
  DATAVERSE_FINAL_STATUS_VALUE: "100000001",
} as const;

const originalEnvironment = new Map<string, string | undefined>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-30T20:00:00.000Z"));
  for (const [name, value] of Object.entries(environment)) {
    originalEnvironment.set(name, process.env[name]);
    process.env[name] = value;
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const name of Object.keys(environment)) {
    const value = originalEnvironment.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  for (const name of ["DATAVERSE_ORDER_CONTEXT_COLUMN", "DATAVERSE_ACK_SOURCE_COLUMN", "DATAVERSE_ACK_AT_COLUMN", "DATAVERSE_ACK_BY_COLUMN", "DATAVERSE_ACK_CHECKIN_ID_COLUMN"]) {
    delete process.env[name];
  }
  originalEnvironment.clear();
});

const draftEnvelopeJson = (
  draftEncounter: InjectionEncounter,
  sourceOverrides: Partial<typeof storedSource> = {},
): string =>
  JSON.stringify({
    schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
    source: { ...storedSource, ...sourceOverrides },
    encounterJson: JSON.stringify(draftEncounter),
  });

const draftRow = (
  draftEncounter: InjectionEncounter,
  rowOverrides: Record<string, unknown> = {},
) => ({
  "@odata.etag": 'W/"42"',
  ipmg_draftjson: draftEnvelopeJson(draftEncounter),
  ipmg_finaljson: "",
  ipmg_workflowstatus: 100000000,
  ipmg_idempotencykey: "",
  ipmg_tebraacknowledged: true,
  ipmg_checkinid: source.checkInId,
  ipmg_patientid: source.patientId,
  ipmg_orderid: source.orderId,
  ipmg_patientcontextjson: patientContextJson,
  ...rowOverrides,
});

const responseOf = (row: Record<string, unknown>, etagHeader?: string): Response =>
  new Response(JSON.stringify(row), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...(etagHeader ? { ETag: etagHeader } : {}),
    },
  });

/**
 * Builds a realistic "now finalized" row from a captured PATCH init,
 * copying Final JSON, workflow status, AND the idempotency-key column —
 * all three are written atomically by store.finalize(). Item 5's shared
 * validateStoredFinal binds the envelope's idempotencyKey back to this
 * protected column, so a fixture that only copies Final JSON/status (and
 * leaves the idempotency column at its draft-time blank) no longer
 * simulates a real finalized row.
 */
const finalizedRowFromPatch = (
  row: Record<string, unknown>,
  patchInit: RequestInit,
): Record<string, unknown> => {
  const patch = JSON.parse(String(patchInit.body)) as Record<string, unknown>;
  return {
    ...row,
    ipmg_finaljson: patch.ipmg_finaljson,
    ipmg_workflowstatus: patch.ipmg_workflowstatus,
    ipmg_idempotencykey: patch.ipmg_idempotencykey,
  };
};

const evaluationFingerprintFor = (draftEncounter: InjectionEncounter): string => {
  const evaluation = evaluateInjectionForPowerApps({
    schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
    source,
    encounter: draftEncounter,
    facilityDate: "2026-08-30",
  });
  if (!evaluation.ok) throw new Error(evaluation.error.message);
  return evaluation.value.evaluationFingerprint;
};

const finalizeRequestBody = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
  injectionId,
  sourceRecordVersion: source.sourceRecordVersion,
  evaluationFingerprint: evaluationFingerprintFor(encounter()),
  confirmation: {
    confirmed: true,
    acknowledgementKind: "tebra",
  },
  ...overrides,
});

const httpRequest = (
  body: unknown,
  headerOverrides: Record<string, string> = {},
): HttpRequest =>
  ({
    headers: new Headers({
      "x-ms-client-principal": principalHeader,
      "idempotency-key": idempotencyKey,
      ...headerOverrides,
    }),
    json: vi.fn().mockResolvedValue(body),
  }) as unknown as HttpRequest;

describe("FinalizeInjection HTTP transaction", () => {
  it("evaluates the authoritative saved draft and returns its opaque ETag", async () => {
    const storedEnvelope = {
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source: storedSource,
      encounterJson: JSON.stringify(encounter()),
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          "@odata.etag": 'W/"opaque.42"',
          ipmg_draftjson: JSON.stringify(storedEnvelope),
          ipmg_finaljson: "",
          ipmg_workflowstatus: 100000000,
          ipmg_idempotencykey: "",
          ipmg_tebraacknowledged: true,
          ipmg_checkinid: source.checkInId,
          ipmg_patientid: source.patientId,
          ipmg_orderid: source.orderId,
          ipmg_patientcontextjson: patientContextJson,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ETag: 'W/"opaque.42"',
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = {
      headers: new Headers({
        "x-ms-client-principal": principalHeader,
        "x-correlation-id": "evaluate-test-1",
      }),
      json: vi.fn().mockResolvedValue({
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        injectionId,
      }),
    } as unknown as HttpRequest;

    const response = await evaluateHandler(request, {} as InvocationContext);

    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({
      source: {
        ...storedSource,
        actionId: injectionId,
        sourceRecordVersion: 'W/"opaque.42"',
      },
      sourceRecordVersion: 'W/"opaque.42"',
      evaluationFingerprint: expect.stringMatching(/^[0-9a-f]{16}$/),
      evaluation: {
        output: {
          canFinalize: true,
          requirements: expect.any(Array),
          needle: expect.any(Object),
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects a Tebra acknowledgement not confirmed by the check-in row", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, { ipmg_tebraacknowledged: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({
      error: { code: "check-in-acknowledgement-required" },
    });
  });

  it("reloads, re-evaluates, attributes, renders, and persists one final bundle", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const requestBody = finalizeRequestBody({
      evaluationFingerprint: evaluationFingerprintFor(draftEncounter),
    });
    const request = httpRequest(requestBody, { "x-correlation-id": "finalize-test-1" });

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({
      status: "finalized",
      injectionId,
      disposition: "administered",
      finalizedAt: "2026-08-30T20:00:00.000Z",
      attestation: {
        staff: "MA User",
        subject: "entra-object-id",
        statementVersion: "clinical-action-v1",
        acknowledgementKind: "tebra",
      },
      avs: {
        documentStatus: "PATIENT COPY",
        contentType: "text/html",
        kind: "patient-avs",
      },
    });
    // Internal-only fields never leak into the public response.
    expect(response.jsonBody).not.toHaveProperty("finalEncounter");
    expect(response.jsonBody).not.toHaveProperty("requestFingerprint");
    expect(response.jsonBody).not.toHaveProperty("idempotencyKey");
    const body = response.jsonBody as Record<string, any>;
    expect(body.documents.note.text).toContain("Invega Sustenna 156 mg");
    expect(body.avs.html).toContain("MRN-500");
    expect(body.evaluation.output.needle).toBeDefined();
    expect(body.evaluation.output.requirements).toBeInstanceOf(Array);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, patchInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(new Headers(patchInit.headers).get("If-Match")).toBe('W/"42"');
    const patch = JSON.parse(String(patchInit.body));
    expect(patch.ipmg_workflowstatus).toBe(100000001);
    expect(patch.ipmg_idempotencykey).toBe(idempotencyKey);
    const storedFinal = JSON.parse(patch.ipmg_finaljson);
    expect(storedFinal.evaluationFingerprint).toBe(body.evaluationFingerprint);
    expect(storedFinal.documents).toEqual(body.documents);
    expect(storedFinal.avs).toEqual(body.avs);
    // Item 3/4: the strict envelope also carries the request fingerprint,
    // idempotency key, and the exact server-stamped final encounter for
    // audit reconstruction — none of which is part of the public response.
    expect(storedFinal.requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(storedFinal.idempotencyKey).toBe(idempotencyKey);
    expect(storedFinal.finalEncounter.disposition).toMatchObject({
      kind: "administered",
      reviewedBy: "MA User",
      reviewedAt: "2026-08-30T20:00:00.000Z",
    });
  });
});

describe("Authoritative check-in/patient/order binding", () => {
  it.each([
    ["checkInId", "wrong-check-in"],
    ["patientId", "wrong-patient"],
    ["orderId", "wrong-order"],
  ])("evaluate fails closed when Draft JSON's %s disagrees with the protected row", async (field, badValue) => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_draftjson: draftEnvelopeJson(draftEncounter, { [field]: badValue }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = {
      headers: new Headers({ "x-ms-client-principal": principalHeader }),
      json: vi.fn().mockResolvedValue({ schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION, injectionId }),
    } as unknown as HttpRequest;

    const response = await evaluateHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "source-identity-mismatch" } });
  });

  it.each([
    ["checkInId", "wrong-check-in"],
    ["patientId", "wrong-patient"],
    ["orderId", "wrong-order"],
  ])("finalize fails closed when Draft JSON's %s disagrees with the protected row", async (field, badValue) => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_draftjson: draftEnvelopeJson(draftEncounter, { [field]: badValue }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "source-identity-mismatch" } });
  });

  it("uses the protected row's identity, not Draft JSON's, when they agree", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = {
      headers: new Headers({ "x-ms-client-principal": principalHeader }),
      json: vi.fn().mockResolvedValue({ schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION, injectionId }),
    } as unknown as HttpRequest;

    const response = await evaluateHandler(request, {} as InvocationContext);

    expect(response.status).toBe(200);
    expect((response.jsonBody as any).source).toMatchObject({
      checkInId: source.checkInId,
      patientId: source.patientId,
      orderId: source.orderId,
    });
  });

  const completeOrderContext = {
    medicationKey: "sustenna",
    dose: "156 mg",
    orderingProvider: "Jane Doe, MD",
    route: "IM",
    intervalKey: "q4wk",
  };

  it("finalize fails closed when the encounter disagrees with a configured order context", async () => {
    process.env.DATAVERSE_ORDER_CONTEXT_COLUMN = "ipmg_ordercontextjson";
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_ordercontextjson: JSON.stringify({ ...completeOrderContext, medicationKey: "vivitrol" }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "order-context-mismatch" } });
  });

  it.each([
    ["route", { ...completeOrderContext, route: "SubQ" }],
    ["intervalKey", { ...completeOrderContext, intervalKey: "q8wk" }],
  ])("finalize fails closed when the encounter's %s disagrees with a configured order context", async (_field, orderContext) => {
    process.env.DATAVERSE_ORDER_CONTEXT_COLUMN = "ipmg_ordercontextjson";
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_ordercontextjson: JSON.stringify(orderContext),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "order-context-mismatch" } });
  });

  it("finalize fails closed when a configured order context is blank rather than treating it as unconfigured", async () => {
    process.env.DATAVERSE_ORDER_CONTEXT_COLUMN = "ipmg_ordercontextjson";
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, { ipmg_ordercontextjson: "" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "order-context-invalid" } });
  });

  it("finalize fails closed when a configured order context is malformed JSON", async () => {
    process.env.DATAVERSE_ORDER_CONTEXT_COLUMN = "ipmg_ordercontextjson";
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, { ipmg_ordercontextjson: "{not valid json" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "order-context-invalid" } });
  });

  it("finalize fails closed when a configured order context is missing required attributes", async () => {
    process.env.DATAVERSE_ORDER_CONTEXT_COLUMN = "ipmg_ordercontextjson";
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      // route and intervalKey omitted — a partially populated order.
      ipmg_ordercontextjson: JSON.stringify({
        medicationKey: "sustenna",
        dose: "156 mg",
        orderingProvider: "Jane Doe, MD",
      }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "order-context-invalid" } });
  });

  it("finalize succeeds when the encounter matches a configured order context", async () => {
    process.env.DATAVERSE_ORDER_CONTEXT_COLUMN = "ipmg_ordercontextjson";
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_ordercontextjson: JSON.stringify(completeOrderContext),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(200);
  });

  it("evaluate applies the same order-context checks as finalize", async () => {
    process.env.DATAVERSE_ORDER_CONTEXT_COLUMN = "ipmg_ordercontextjson";
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_ordercontextjson: JSON.stringify({ ...completeOrderContext, medicationKey: "vivitrol" }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = {
      headers: new Headers({ "x-ms-client-principal": principalHeader }),
      json: vi.fn().mockResolvedValue({ schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION, injectionId }),
    } as unknown as HttpRequest;

    const response = await evaluateHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "order-context-mismatch" } });
  });

  it.each([
    ["dose", { ...completeOrderContext, dose: "234 mg" }],
    ["orderingProvider", { ...completeOrderContext, orderingProvider: "Someone Else, MD" }],
  ])("finalize fails closed when the encounter's %s disagrees with a configured order context", async (_field, orderContext) => {
    process.env.DATAVERSE_ORDER_CONTEXT_COLUMN = "ipmg_ordercontextjson";
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, { ipmg_ordercontextjson: JSON.stringify(orderContext) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "order-context-mismatch" } });
  });

  it("finalize fails closed when the Draft envelope's actionId is missing", async () => {
    const draftEncounter = encounter();
    const badDraftJson = JSON.stringify({
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source: { ...storedSource, actionId: undefined },
      encounterJson: JSON.stringify(draftEncounter),
    });
    const row = draftRow(draftEncounter, { ipmg_draftjson: badDraftJson });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "stored-draft-invalid" } });
  });

  it("finalize fails closed when the Draft envelope's actionId disagrees with the requested injectionId", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_draftjson: draftEnvelopeJson(draftEncounter, { actionId: "11111111-1111-4111-8111-111111111111" }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "stored-draft-invalid" } });
  });
});

describe("Protected patient-context", () => {
  it("finalize fails closed when the protected patient-context snapshot is malformed JSON", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, { ipmg_patientcontextjson: "{not valid json" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "patient-context-invalid" } });
  });

  it.each([
    ["missing mrn", { name: "Test, Patient", dob: "1980-05-12" }],
    ["blank name", { name: "   ", dob: "1980-05-12", mrn: "MRN-500" }],
    ["invalid dob", { name: "Test, Patient", dob: "not-a-date", mrn: "MRN-500" }],
    ["empty object", {}],
  ])("finalize fails closed when the protected patient-context snapshot has %s", async (_label, badContext) => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, { ipmg_patientcontextjson: JSON.stringify(badContext) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "patient-context-invalid" } });
  });

  it("evaluate applies the same protected patient-context validation as finalize", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, { ipmg_patientcontextjson: "" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = {
      headers: new Headers({ "x-ms-client-principal": principalHeader }),
      json: vi.fn().mockResolvedValue({ schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION, injectionId }),
    } as unknown as HttpRequest;

    const response = await evaluateHandler(request, {} as InvocationContext);

    // An empty patientContextJson never reaches the API layer in practice
    // (dataverse.ts's load() already rejects a blank required column as
    // invalid-record), so this surfaces as a Dataverse-layer failure —
    // still a fail-closed rejection, never a silent fallback to Draft
    // JSON's own patient identity.
    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "invalid-record" } });
  });

  it("final documents carry the protected patient-context identity, never Draft JSON's own patient fields", async () => {
    const draftEncounter = encounter();
    const overriddenPatientContext = { name: "Protected, Patient", dob: "1975-11-03", mrn: "MRN-PROTECTED" };
    const row = draftRow(draftEncounter, {
      ipmg_patientcontextjson: JSON.stringify(overriddenPatientContext),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    // The evaluation fingerprint binds to the protected patient identity
    // too, so a caller's fingerprint must be computed against the same
    // overridden source/encounter finalize will authoritatively re-evaluate
    // — exactly as a real Evaluate call (which applies the same protected
    // patient-context override) would have produced.
    const protectedFingerprint = (() => {
      const evaluation = evaluateInjectionForPowerApps({
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        source: { ...source, patientRecordNumber: overriddenPatientContext.mrn },
        encounter: {
          ...draftEncounter,
          patient: { name: overriddenPatientContext.name, dob: overriddenPatientContext.dob },
        },
        facilityDate: "2026-08-30",
      });
      if (!evaluation.ok) throw new Error(evaluation.error.message);
      return evaluation.value.evaluationFingerprint;
    })();
    const request = httpRequest(finalizeRequestBody({ evaluationFingerprint: protectedFingerprint }));

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(200);
    const body = response.jsonBody as Record<string, any>;
    // The public source echoes the protected MRN, not Draft JSON's "MRN-500".
    expect(body.source.patientRecordNumber).toBe("MRN-PROTECTED");
    expect(body.avs.html).toContain("MRN-PROTECTED");
    expect(body.avs.html).not.toContain("MRN-500");
    expect(body.avs.html).toContain("Protected, Patient");
    expect(body.avs.html).not.toContain("Test, Patient");

    const [, patchInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const stored = JSON.parse(JSON.parse(String(patchInit.body)).ipmg_finaljson);
    expect(stored.finalEncounter.patient).toEqual({
      name: "Protected, Patient",
      dob: "1975-11-03",
    });
  });
});

describe("Request-bound idempotency", () => {
  it("replays an identical sequential retry with the same idempotency key", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const fetchMock1 = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock1);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    const first = await finalizeHandler(httpRequest(body), {} as InvocationContext);
    expect(first.status).toBe(200);
    expect(first.headers?.["Idempotency-Replayed"]).toBe("false");

    const [, patchInit] = fetchMock1.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, patchInit);

    const fetchMock2 = vi.fn().mockResolvedValueOnce(responseOf(finalRow));
    vi.stubGlobal("fetch", fetchMock2);

    const second = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(second.status).toBe(200);
    expect(second.headers?.["Idempotency-Replayed"]).toBe("true");
    expect(fetchMock2).toHaveBeenCalledOnce();
    // The replay round-trips through JSON storage (dropping undefined-valued
    // keys the live evaluation object still carries), so normalize both
    // sides through JSON before comparing; only correlationId legitimately
    // differs between the two calls.
    const normalize = (value: unknown) => {
      const parsed = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
      delete parsed.correlationId;
      return parsed;
    };
    expect(normalize(second.jsonBody)).toEqual(normalize(first.jsonBody));
  });

  it("replays a retry after a simulated concurrency race instead of erroring", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    // Simulate: this request's PATCH loses a race (412), but the winning
    // concurrent request stored the identical content under the same key.
    // First, produce that winning envelope via one real successful run.
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    await finalizeHandler(httpRequest(body), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);

    const raceFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"')) // initial load: still looks like draft
      .mockResolvedValueOnce(new Response(null, { status: 412 })) // patch loses the race
      .mockResolvedValueOnce(responseOf(finalRow)); // retry load: now final, matching content
    vi.stubGlobal("fetch", raceFetch);

    const retry = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(retry.status).toBe(200);
    expect(retry.headers?.["Idempotency-Replayed"]).toBe("true");
    expect(raceFetch).toHaveBeenCalledTimes(3);
  });

  it("returns a conflict when the same key is reused with a different evaluated ETag", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const originalBody = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(originalBody), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    // Same key, but a different (still well-formed) sourceRecordVersion.
    const differentEtagBody = { ...originalBody, sourceRecordVersion: 'W/"99"' };
    const response = await finalizeHandler(httpRequest(differentEtagBody), {} as InvocationContext);

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "idempotency-conflict" } });
  });

  it("returns a conflict when the same key is reused with a different evaluation fingerprint", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const originalBody = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(originalBody), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const differentFingerprintBody = { ...originalBody, evaluationFingerprint: "0000000000000000" };
    const response = await finalizeHandler(httpRequest(differentFingerprintBody), {} as InvocationContext);

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "idempotency-conflict" } });
  });

  it("returns a conflict when the same key is reused with different acknowledgement data", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const originalBody = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(originalBody), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const differentAckBody = {
      ...originalBody,
      confirmation: { confirmed: true, acknowledgementKind: "manual", manualReason: "Different reason", manualSource: "Different source" },
    };
    const response = await finalizeHandler(httpRequest(differentAckBody), {} as InvocationContext);

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "idempotency-conflict" } });
  });

  it("returns a conflict when the same key is reused with only manualReason changed (manualSource unchanged)", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const originalBody = finalizeRequestBody({
      evaluationFingerprint: evaluationFingerprintFor(draftEncounter),
      confirmation: {
        confirmed: true,
        acknowledgementKind: "manual",
        manualReason: "Original reason",
        manualSource: "Original source",
      },
    });
    await finalizeHandler(httpRequest(originalBody), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const reasonOnlyBody = {
      ...originalBody,
      confirmation: { ...originalBody.confirmation, manualReason: "A different reason only" },
    };
    const response = await finalizeHandler(httpRequest(reasonOnlyBody), {} as InvocationContext);

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "idempotency-conflict" } });
  });

  it("returns a conflict when the same key is reused with only manualSource changed (manualReason unchanged)", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const originalBody = finalizeRequestBody({
      evaluationFingerprint: evaluationFingerprintFor(draftEncounter),
      confirmation: {
        confirmed: true,
        acknowledgementKind: "manual",
        manualReason: "Original reason",
        manualSource: "Original source",
      },
    });
    await finalizeHandler(httpRequest(originalBody), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const sourceOnlyBody = {
      ...originalBody,
      confirmation: { ...originalBody.confirmation, manualSource: "A different source only" },
    };
    const response = await finalizeHandler(httpRequest(sourceOnlyBody), {} as InvocationContext);

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "idempotency-conflict" } });
  });

  it("replays successfully when only manualReason/manualSource whitespace differs (fingerprint normalizes via trim)", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const originalBody = finalizeRequestBody({
      evaluationFingerprint: evaluationFingerprintFor(draftEncounter),
      confirmation: {
        confirmed: true,
        acknowledgementKind: "manual",
        manualReason: "Original reason",
        manualSource: "Original source",
      },
    });
    await finalizeHandler(httpRequest(originalBody), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const whitespacePaddedBody = {
      ...originalBody,
      confirmation: {
        ...originalBody.confirmation,
        manualReason: "  Original reason  ",
        manualSource: "  Original source  ",
      },
    };
    const response = await finalizeHandler(httpRequest(whitespacePaddedBody), {} as InvocationContext);

    expect(response.status).toBe(200);
    expect(response.headers?.["Idempotency-Replayed"]).toBe("true");
  });

  it("returns a conflict when the same key is reused by a different authenticated principal", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const originalBody = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(originalBody), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const response = await finalizeHandler(
      httpRequest(originalBody, { "x-ms-client-principal": otherPrincipalHeader }),
      {} as InvocationContext,
    );

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "idempotency-conflict" } });
  });

  it("replays successfully when the same subject ID reuses the key under a different display name", async () => {
    // The request fingerprint binds on finalizedByUserId (the immutable
    // Entra subject), not on displayName, so a later Entra profile-name
    // change must not itself break a legitimate replay.
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const originalBody = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(originalBody), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const renamedPrincipalHeader = principalHeaderFor("entra-object-id", "Renamed MA User");
    const response = await finalizeHandler(
      httpRequest(originalBody, { "x-ms-client-principal": renamedPrincipalHeader }),
      {} as InvocationContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers?.["Idempotency-Replayed"]).toBe("true");
  });

  it("returns a conflict when a different subject ID reuses the key under the same display name", async () => {
    // Two distinct Entra identities can share a display name; the
    // fingerprint must still bind on the immutable subject ID, not the
    // human-readable name, so this must conflict rather than replay.
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const originalBody = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(originalBody), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const sameNameDifferentSubjectHeader = principalHeaderFor("entra-object-id-imposter", "MA User");
    const response = await finalizeHandler(
      httpRequest(originalBody, { "x-ms-client-principal": sameNameDifferentSubjectHeader }),
      {} as InvocationContext,
    );

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "idempotency-conflict" } });
  });

  it("returns a conflict when a different key is used on an already-finalized action", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const originalBody = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(originalBody), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const response = await finalizeHandler(
      httpRequest(originalBody, { "idempotency-key": otherIdempotencyKey }),
      {} as InvocationContext,
    );

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "idempotency-conflict" } });
  });
});

describe("Stored-final envelope validation on retrieval and replay", () => {
  it("rejects a finalize replay when the stored Final JSON is malformed", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_finaljson: "{not valid json",
      ipmg_workflowstatus: 100000001,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(503);
    expect(response.jsonBody).toMatchObject({ error: { code: "stored-result-invalid" } });
  });

  it("rejects a finalize replay when the stored Final JSON is incomplete", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_finaljson: JSON.stringify({ schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION, status: "finalized" }),
      ipmg_workflowstatus: 100000001,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(503);
    expect(response.jsonBody).toMatchObject({ error: { code: "stored-result-invalid" } });
  });

  it("does not treat a reopened row (status back to draft with stale Final JSON) as finalized, and does not overwrite it", async () => {
    const draftEncounter = encounter();
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(draftRow(draftEncounter), 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(body), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const staleFinalJson = JSON.parse(String(winnerPatchInit.body)).ipmg_finaljson as string;

    // Row was reopened back to draft status directly (e.g. a status-column
    // edit), not through an explicit, audited reset/new-action process, and
    // the stale Final JSON was never cleared. A finalized action must only
    // be reset through that separate process — never by finalizing over a
    // record that still carries residual final artifacts.
    const reopenedRow = draftRow(draftEncounter, {
      ipmg_finaljson: staleFinalJson,
      ipmg_workflowstatus: 100000000,
    });
    const reopenedFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(reopenedRow, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", reopenedFetch);

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "stale-final-artifact" } });
    // No write occurs after rejection — only the load happened, never a PATCH.
    expect(reopenedFetch).toHaveBeenCalledOnce();
  });

  it("fails closed when a draft-status row carries only a stale idempotency key (no Final JSON)", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_workflowstatus: 100000000,
      ipmg_finaljson: "",
      ipmg_idempotencykey: otherIdempotencyKey,
    });
    const fetchMock = vi.fn().mockResolvedValue(responseOf(row, 'W/"42"'));
    vi.stubGlobal("fetch", fetchMock);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "stale-final-artifact" } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails closed when a non-draft, non-final (voided) row retains final data", async () => {
    const draftEncounter = encounter();
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(draftRow(draftEncounter), 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(body), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const staleFinalJson = JSON.parse(String(winnerPatchInit.body)).ipmg_finaljson as string;

    // Neither the configured draft value (100000000) nor the configured
    // final value (100000001) — a distinct "voided" status.
    const voidedRow = draftRow(draftEncounter, {
      ipmg_finaljson: staleFinalJson,
      ipmg_workflowstatus: 100000002,
    });
    const voidedFetch = vi.fn().mockResolvedValue(responseOf(voidedRow, 'W/"42"'));
    vi.stubGlobal("fetch", voidedFetch);

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "invalid-status" } });
    expect(voidedFetch).toHaveBeenCalledOnce();
  });

  const evaluateRequest = (): HttpRequest =>
    ({
      headers: new Headers({ "x-ms-client-principal": principalHeader }),
      json: vi.fn().mockResolvedValue({ schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION, injectionId }),
    }) as unknown as HttpRequest;

  it("evaluate fails closed on a draft-status row carrying residual Final JSON, before any clinical evaluation", async () => {
    const draftEncounter = encounter();
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(draftRow(draftEncounter), 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const finalizeBody = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(finalizeBody), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const staleFinalJson = JSON.parse(String(winnerPatchInit.body)).ipmg_finaljson as string;

    // Row reset back to draft status directly; the stale Final JSON was
    // never cleared.
    const reopenedRow = draftRow(draftEncounter, {
      ipmg_finaljson: staleFinalJson,
      ipmg_workflowstatus: 100000000,
    });
    const reopenedFetch = vi.fn().mockResolvedValue(responseOf(reopenedRow, 'W/"42"'));
    vi.stubGlobal("fetch", reopenedFetch);

    const response = await evaluateHandler(evaluateRequest(), {} as InvocationContext);

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "stale-final-artifact" } });
    expect(response.jsonBody).not.toHaveProperty("evaluation");
    // Nothing beyond the initial load happened — no downstream clinical
    // evaluation, no further Dataverse interaction.
    expect(reopenedFetch).toHaveBeenCalledOnce();
  });

  it("evaluate fails closed on a draft-status row carrying only a residual idempotency key (no Final JSON), before any clinical evaluation", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_workflowstatus: 100000000,
      ipmg_finaljson: "",
      ipmg_idempotencykey: otherIdempotencyKey,
    });
    const fetchMock = vi.fn().mockResolvedValue(responseOf(row, 'W/"42"'));
    vi.stubGlobal("fetch", fetchMock);

    const response = await evaluateHandler(evaluateRequest(), {} as InvocationContext);

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "stale-final-artifact" } });
    expect(response.jsonBody).not.toHaveProperty("evaluation");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects retrieval of a stored final record whose identity does not match the requested injection", async () => {
    const draftEncounter = encounter();
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(draftRow(draftEncounter), 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(body), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const stored = JSON.parse(String(winnerPatchInit.body)).ipmg_finaljson as string;
    const tampered = JSON.stringify({ ...JSON.parse(stored), injectionId: "11111111-1111-1111-1111-111111111111" });
    const finalRow = draftRow(draftEncounter, { ipmg_finaljson: tampered, ipmg_workflowstatus: 100000001 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(503);
    expect(response.jsonBody).toMatchObject({ error: { code: "stored-result-invalid" } });
  });

  it.each([
    ["patientId", "checkInId"],
    ["orderId", "checkInId"],
  ])(
    "rejects a finalize replay whose stored source.%s disagrees with the protected record",
    async (field) => {
      const draftEncounter = encounter();
      const winnerFetch = vi
        .fn()
        .mockResolvedValueOnce(responseOf(draftRow(draftEncounter), 'W/"42"'))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", winnerFetch);
      const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
      await finalizeHandler(httpRequest(body), {} as InvocationContext);
      const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
      const stored = JSON.parse(String(winnerPatchInit.body)).ipmg_finaljson as string;
      const envelope = JSON.parse(stored);
      const tampered = JSON.stringify({
        ...envelope,
        source: { ...envelope.source, [field]: "tampered-value" },
      });
      const finalRow = draftRow(draftEncounter, {
        ipmg_finaljson: tampered,
        ipmg_workflowstatus: 100000001,
        ipmg_idempotencykey: envelope.idempotencyKey,
      });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

      const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

      expect(response.status).toBe(503);
      expect(response.jsonBody).toMatchObject({ error: { code: "stored-result-invalid" } });
    },
  );

  it("rejects a finalize replay whose stored idempotencyKey disagrees with the protected Dataverse idempotency-key column", async () => {
    const draftEncounter = encounter();
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(draftRow(draftEncounter), 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(body), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const stored = JSON.parse(String(winnerPatchInit.body)).ipmg_finaljson as string;
    // The envelope itself is untouched/valid; only the protected Dataverse
    // idempotency-key column has drifted from what the envelope carries —
    // e.g. a corrupted or independently edited column.
    const finalRow = draftRow(draftEncounter, {
      ipmg_finaljson: stored,
      ipmg_workflowstatus: 100000001,
      ipmg_idempotencykey: "a-completely-different-persisted-key",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(503);
    expect(response.jsonBody).toMatchObject({ error: { code: "stored-result-invalid" } });
  });

  it.each([
    [
      "a partial board-provenance set",
      (envelope: Record<string, any>) => ({
        ...envelope,
        acknowledgement: { ...envelope.acknowledgement, boardSource: "tampered-source" },
      }),
    ],
    [
      "acknowledgedByUserId disagreeing with attestation.subject",
      (envelope: Record<string, any>) => ({
        ...envelope,
        acknowledgement: { ...envelope.acknowledgement, acknowledgedByUserId: "tampered-user" },
      }),
    ],
    [
      "attestation.timestamp disagreeing with finalizedAt",
      (envelope: Record<string, any>) => ({
        ...envelope,
        attestation: { ...envelope.attestation, timestamp: "2026-08-30T21:00:00.000Z" },
      }),
    ],
  ])(
    "rejects a finalize replay whose stored envelope has %s",
    async (_label, tamper) => {
      const draftEncounter = encounter();
      const winnerFetch = vi
        .fn()
        .mockResolvedValueOnce(responseOf(draftRow(draftEncounter), 'W/"42"'))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", winnerFetch);
      const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
      await finalizeHandler(httpRequest(body), {} as InvocationContext);
      const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
      const patch = JSON.parse(String(winnerPatchInit.body)) as Record<string, unknown>;
      const envelope = JSON.parse(String(patch.ipmg_finaljson));
      const tampered = JSON.stringify(tamper(envelope));
      const finalRow = draftRow(draftEncounter, {
        ipmg_finaljson: tampered,
        ipmg_workflowstatus: 100000001,
        ipmg_idempotencykey: patch.ipmg_idempotencykey,
      });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

      const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

      expect(response.status).toBe(503);
      expect(response.jsonBody).toMatchObject({ error: { code: "stored-result-invalid" } });
    },
  );

  it("replay tolerates an advanced row ETag — replay never depends on the current ETag matching", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });
    await finalizeHandler(httpRequest(body), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);
    // Dataverse bumps the row ETag on every PATCH; a replay read sees a
    // different (advanced) ETag than what was used to finalize, and that
    // must not affect replay at all.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow, 'W/"43"')));

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(200);
    expect(response.headers?.["Idempotency-Replayed"]).toBe("true");
  });
});

describe("Post-412 race where the winner used different content", () => {
  it("returns a conflict, not a silent success, when the 412 race winner used a different idempotency key", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    // A different caller wins the race using a different Idempotency-Key.
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    await finalizeHandler(httpRequest(body, { "idempotency-key": otherIdempotencyKey }), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);

    const raceFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"')) // initial load: still looks like draft
      .mockResolvedValueOnce(new Response(null, { status: 412 })) // patch loses the race
      .mockResolvedValueOnce(responseOf(finalRow)); // retry load: final, but under the OTHER caller's key
    vi.stubGlobal("fetch", raceFetch);

    // This caller used its own (different) idempotency key throughout.
    const retry = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(retry.status).toBe(409);
    expect(retry.jsonBody).toMatchObject({ error: { code: "idempotency-conflict" } });
  });

  it("returns a conflict, not a silent success, when the 412 race winner used a different evaluation fingerprint under the same key", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const originalBody = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    // The winner reused this exact idempotency key but for a different
    // fingerprint (e.g. a materially different confirmation).
    const winnerBody = {
      ...originalBody,
      confirmation: {
        confirmed: true,
        acknowledgementKind: "manual",
        manualReason: "Different manual reason entirely",
        manualSource: "Different manual source entirely",
      },
    };
    const winnerFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", winnerFetch);
    await finalizeHandler(httpRequest(winnerBody), {} as InvocationContext);
    const [, winnerPatchInit] = winnerFetch.mock.calls[1] as unknown as [string, RequestInit];
    const finalRow = finalizedRowFromPatch(row, winnerPatchInit);

    const raceFetch = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 412 }))
      .mockResolvedValueOnce(responseOf(finalRow));
    vi.stubGlobal("fetch", raceFetch);

    const retry = await finalizeHandler(httpRequest(originalBody), {} as InvocationContext);

    expect(retry.status).toBe(409);
    expect(retry.jsonBody).toMatchObject({ error: { code: "idempotency-conflict" } });
  });
});

describe("Tebra acknowledgement provenance", () => {
  it("records only the finalizer's own attestation when the board provides no acknowledgement provenance", async () => {
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    await finalizeHandler(httpRequest(body), {} as InvocationContext);

    const [, patchInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const stored = JSON.parse(JSON.parse(String(patchInit.body)).ipmg_finaljson);
    expect(stored.acknowledgement).toEqual({
      kind: "tebra",
      acknowledgedAtUtc: "2026-08-30T20:00:00.000Z",
      acknowledgedByUserId: "entra-object-id",
      acknowledgedByDisplayName: "MA User",
    });
    expect(stored.acknowledgement.boardSource).toBeUndefined();
  });

  it("records real board acknowledgement provenance when all four protected columns are configured and populated", async () => {
    process.env.DATAVERSE_ACK_SOURCE_COLUMN = "ipmg_acksource";
    process.env.DATAVERSE_ACK_AT_COLUMN = "ipmg_ackatutc";
    process.env.DATAVERSE_ACK_BY_COLUMN = "ipmg_ackby";
    process.env.DATAVERSE_ACK_CHECKIN_ID_COLUMN = "ipmg_ackcheckinid";
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_acksource: "tebra-sync",
      ipmg_ackatutc: "2026-08-30T19:55:00.000Z",
      ipmg_ackby: "checkin-board-integration",
      ipmg_ackcheckinid: source.checkInId,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    await finalizeHandler(httpRequest(body), {} as InvocationContext);

    const [, patchInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const stored = JSON.parse(JSON.parse(String(patchInit.body)).ipmg_finaljson);
    expect(stored.acknowledgement).toMatchObject({
      kind: "tebra",
      boardSource: "tebra-sync",
      boardAcknowledgedAtUtc: "2026-08-30T19:55:00.000Z",
      boardAcknowledgedBy: "checkin-board-integration",
      boardCheckInId: source.checkInId,
    });
  });

  const withAckColumnsConfigured = () => {
    process.env.DATAVERSE_ACK_SOURCE_COLUMN = "ipmg_acksource";
    process.env.DATAVERSE_ACK_AT_COLUMN = "ipmg_ackatutc";
    process.env.DATAVERSE_ACK_BY_COLUMN = "ipmg_ackby";
    process.env.DATAVERSE_ACK_CHECKIN_ID_COLUMN = "ipmg_ackcheckinid";
  };

  it("fails closed when the board acknowledgement provenance is only partially populated on the row", async () => {
    withAckColumnsConfigured();
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_acksource: "tebra-sync",
      // ipmg_ackatutc intentionally omitted — a partial/corrupt row.
      ipmg_ackby: "checkin-board-integration",
      ipmg_ackcheckinid: source.checkInId,
    });
    const fetchMock = vi.fn().mockResolvedValue(responseOf(row, 'W/"42"'));
    vi.stubGlobal("fetch", fetchMock);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "acknowledgement-provenance-invalid" } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails closed when all four board acknowledgement columns are configured but all four row values are blank", async () => {
    withAckColumnsConfigured();
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_acksource: "",
      ipmg_ackatutc: "",
      ipmg_ackby: "",
      ipmg_ackcheckinid: "",
    });
    const fetchMock = vi.fn().mockResolvedValue(responseOf(row, 'W/"42"'));
    vi.stubGlobal("fetch", fetchMock);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "acknowledgement-provenance-invalid" } });
    // No PATCH occurs — only the load happened.
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails closed when all four board acknowledgement columns are configured but entirely absent from the row (not just blank strings)", async () => {
    withAckColumnsConfigured();
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter);
    const fetchMock = vi.fn().mockResolvedValue(responseOf(row, 'W/"42"'));
    vi.stubGlobal("fetch", fetchMock);
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "acknowledgement-provenance-invalid" } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails closed when the board acknowledgement timestamp is not a valid UTC instant", async () => {
    withAckColumnsConfigured();
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_acksource: "tebra-sync",
      ipmg_ackatutc: "2026-08-30T12:00:00-07:00",
      ipmg_ackby: "checkin-board-integration",
      ipmg_ackcheckinid: source.checkInId,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row, 'W/"42"')));
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "acknowledgement-provenance-invalid" } });
  });

  it("fails closed when the board acknowledgement timestamp is in the future", async () => {
    withAckColumnsConfigured();
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_acksource: "tebra-sync",
      ipmg_ackatutc: "2026-08-30T20:05:00.000Z",
      ipmg_ackby: "checkin-board-integration",
      ipmg_ackcheckinid: source.checkInId,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row, 'W/"42"')));
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "acknowledgement-provenance-invalid" } });
  });

  it("fails closed when the board acknowledgement check-in does not match the protected record", async () => {
    withAckColumnsConfigured();
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_acksource: "tebra-sync",
      ipmg_ackatutc: "2026-08-30T19:55:00.000Z",
      ipmg_ackby: "checkin-board-integration",
      ipmg_ackcheckinid: "a-different-check-in-entirely",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row, 'W/"42"')));
    const body = finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) });

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "acknowledgement-provenance-invalid" } });
  });

  it("does not validate board provenance at all for a manual acknowledgement, even if the row's provenance is broken", async () => {
    withAckColumnsConfigured();
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_acksource: "tebra-sync",
      // Broken/partial provenance that would fail closed on the tebra path.
      ipmg_ackby: "checkin-board-integration",
      ipmg_ackcheckinid: source.checkInId,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = finalizeRequestBody({
      evaluationFingerprint: evaluationFingerprintFor(draftEncounter),
      confirmation: {
        confirmed: true,
        acknowledgementKind: "manual",
        manualReason: "Tebra was already acknowledged before migration",
        manualSource: "Verified against signed encounter note",
      },
    });

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    expect(response.status).toBe(200);
  });
});
