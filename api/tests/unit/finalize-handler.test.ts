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

  it("finalize fails closed when the encounter disagrees with a configured order context", async () => {
    process.env.DATAVERSE_ORDER_CONTEXT_COLUMN = "ipmg_ordercontextjson";
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_ordercontextjson: JSON.stringify({ medicationKey: "vivitrol" }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const request = httpRequest(
      finalizeRequestBody({ evaluationFingerprint: evaluationFingerprintFor(draftEncounter) }),
    );

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({ error: { code: "order-context-mismatch" } });
  });

  it("finalize succeeds when the encounter matches a configured order context", async () => {
    process.env.DATAVERSE_ORDER_CONTEXT_COLUMN = "ipmg_ordercontextjson";
    const draftEncounter = encounter();
    const row = draftRow(draftEncounter, {
      ipmg_ordercontextjson: JSON.stringify({
        medicationKey: "sustenna",
        dose: "156 mg",
        orderingProvider: "Jane Doe, MD",
      }),
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
    const storedFinalJson = JSON.parse(String(patchInit.body)).ipmg_finaljson as string;
    const finalRow = { ...row, ipmg_finaljson: storedFinalJson, ipmg_workflowstatus: 100000001 };

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
    const storedFinalJson = JSON.parse(String(winnerPatchInit.body)).ipmg_finaljson as string;
    const finalRow = { ...row, ipmg_finaljson: storedFinalJson, ipmg_workflowstatus: 100000001 };

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
    const storedFinalJson = JSON.parse(String(winnerPatchInit.body)).ipmg_finaljson as string;
    const finalRow = { ...row, ipmg_finaljson: storedFinalJson, ipmg_workflowstatus: 100000001 };
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
    const storedFinalJson = JSON.parse(String(winnerPatchInit.body)).ipmg_finaljson as string;
    const finalRow = { ...row, ipmg_finaljson: storedFinalJson, ipmg_workflowstatus: 100000001 };
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
    const storedFinalJson = JSON.parse(String(winnerPatchInit.body)).ipmg_finaljson as string;
    const finalRow = { ...row, ipmg_finaljson: storedFinalJson, ipmg_workflowstatus: 100000001 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const differentAckBody = {
      ...originalBody,
      confirmation: { confirmed: true, acknowledgementKind: "manual", manualReason: "Different reason", manualSource: "Different source" },
    };
    const response = await finalizeHandler(httpRequest(differentAckBody), {} as InvocationContext);

    expect(response.status).toBe(409);
    expect(response.jsonBody).toMatchObject({ error: { code: "idempotency-conflict" } });
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
    const storedFinalJson = JSON.parse(String(winnerPatchInit.body)).ipmg_finaljson as string;
    const finalRow = { ...row, ipmg_finaljson: storedFinalJson, ipmg_workflowstatus: 100000001 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responseOf(finalRow)));

    const response = await finalizeHandler(
      httpRequest(originalBody, { "x-ms-client-principal": otherPrincipalHeader }),
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
    const storedFinalJson = JSON.parse(String(winnerPatchInit.body)).ipmg_finaljson as string;
    const finalRow = { ...row, ipmg_finaljson: storedFinalJson, ipmg_workflowstatus: 100000001 };
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

  it("does not treat a reopened row (status back to draft with stale Final JSON) as finalized", async () => {
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

    // Row was reopened back to draft status, but the stale Final JSON was
    // never cleared. Status, not the mere presence of Final JSON, decides.
    const reopenedRow = draftRow(draftEncounter, {
      ipmg_finaljson: staleFinalJson,
      ipmg_workflowstatus: 100000000,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(responseOf(reopenedRow, 'W/"42"'))
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );

    const response = await finalizeHandler(httpRequest(body), {} as InvocationContext);

    // Treated as a fresh draft finalize, not a replay of the stale content.
    expect(response.status).toBe(200);
    expect(response.headers?.["Idempotency-Replayed"]).toBe("false");
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
});
