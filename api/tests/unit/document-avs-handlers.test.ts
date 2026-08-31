import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: class {
    getToken = vi.fn().mockResolvedValue({ token: "managed-identity-token" });
  },
}));

import { avsHandler, documentsHandler, finalizeHandler } from "../../src/functions/injections";
import { POWER_APPS_INJECTION_SCHEMA_VERSION } from "../../../src/integrations/power-apps";
import { emptyInjectionEncounter, type InjectionEncounter } from "../../../src/domain/injection";

const injectionId = "9d7f434e-7f47-4c45-bd8e-c88d9a8cfbdd";
const idempotencyKey = "f4d3700d-ec30-4f1f-87e1-9dd6b1bbce31";
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

const baseEncounter = (): InjectionEncounter => ({
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
  traceability: { ndc: "50458-564-01", lot: "LOT-100", expiration: "2027-10" },
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

const heldEncounter = (): InjectionEncounter => ({
  ...baseEncounter(),
  disposition: {
    kind: "held",
    provider: "Jane Doe, MD",
    time: "2026-08-30T13:00",
    outcome: "Held today; provider will reassess.",
  },
});

const escalatedEncounter = (): InjectionEncounter => ({
  ...baseEncounter(),
  disposition: {
    kind: "escalated",
    provider: "Jane Doe, MD",
    time: "2026-08-30T13:00",
    outcome: "Escalated to provider for reassessment.",
  },
});

const providerEncounter = (): InjectionEncounter => ({
  ...baseEncounter(),
  disposition: {
    kind: "provider",
    provider: "Jane Doe, MD",
    time: "2026-08-30T13:00",
    outcome: "Provider directed a change in plan.",
  },
});

const principalHeader = Buffer.from(
  JSON.stringify({ userId: "entra-object-id", userDetails: "MA User", userRoles: [finalizerRole] }),
  "utf8",
).toString("base64");

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
  originalEnvironment.clear();
});

// The protected patient-context snapshot is authoritative over Draft
// JSON's patient identity; matches baseEncounter()'s patient and
// source.patientRecordNumber so existing assertions see the override as a
// no-op.
const patientContext = { name: "Test, Patient", dob: "1980-05-12", mrn: "MRN-500" };
const patientContextJson = JSON.stringify(patientContext);

const draftRow = (draftEncounter: InjectionEncounter, rowOverrides: Record<string, unknown> = {}) => ({
  "@odata.etag": 'W/"42"',
  ipmg_draftjson: JSON.stringify({
    schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
    source: storedSource,
    encounterJson: JSON.stringify(draftEncounter),
  }),
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
    headers: { "Content-Type": "application/json", ...(etagHeader ? { ETag: etagHeader } : {}) },
  });

/** Produces a real, schema-valid stored final row by actually finalizing once. */
const finalizedRow = async (draftEncounter: InjectionEncounter): Promise<Record<string, unknown>> => {
  const { evaluateInjectionForPowerApps } = await import("../../../src/integrations/power-apps");
  const evaluation = evaluateInjectionForPowerApps({
    schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
    source,
    encounter: draftEncounter,
    facilityDate: "2026-08-30",
  });
  if (!evaluation.ok) throw new Error(evaluation.error.message);
  const row = draftRow(draftEncounter);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(responseOf(row, 'W/"42"'))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  const request = {
    headers: new Headers({
      "x-ms-client-principal": principalHeader,
      "idempotency-key": idempotencyKey,
    }),
    json: vi.fn().mockResolvedValue({
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      injectionId,
      sourceRecordVersion: source.sourceRecordVersion,
      evaluationFingerprint: evaluation.value.evaluationFingerprint,
      confirmation: { confirmed: true, acknowledgementKind: "tebra" },
    }),
  } as unknown as HttpRequest;
  const response = await finalizeHandler(request, {} as InvocationContext);
  if (response.status !== 200) throw new Error(`Setup finalize failed: ${JSON.stringify(response.jsonBody)}`);
  const [, patchInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
  const patch = JSON.parse(String(patchInit.body)) as Record<string, unknown>;
  vi.unstubAllGlobals();
  // Item 5's shared validateStoredFinal binds the envelope's idempotencyKey
  // back to the protected Dataverse idempotency-key column, so a realistic
  // finalized-row fixture must carry it too, not just Final JSON/status.
  return draftRow(draftEncounter, {
    ipmg_finaljson: patch.ipmg_finaljson,
    ipmg_workflowstatus: patch.ipmg_workflowstatus,
    ipmg_idempotencykey: patch.ipmg_idempotencykey,
  });
};

const lookupRequest = (body: unknown = { schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION, injectionId }): HttpRequest =>
  ({
    headers: new Headers({ "x-ms-client-principal": principalHeader }),
    json: vi.fn().mockResolvedValue(body),
  }) as unknown as HttpRequest;

describe("GetInjectionDocuments / GenerateInjectionAvs retrieval validation", () => {
  it("rejects retrieval for a row that has never been finalized", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(draftRow(baseEncounter()))));

    const documents = await documentsHandler(lookupRequest(), {} as InvocationContext);
    expect(documents.status).toBe(409);
    expect(documents.jsonBody).toMatchObject({ error: { code: "not-finalized" } });
  });

  it("rejects retrieval when the stored Final JSON fails strict schema validation", async () => {
    const row = draftRow(baseEncounter(), {
      ipmg_finaljson: JSON.stringify({ schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION }),
      ipmg_workflowstatus: 100000001,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));

    const avs = await avsHandler(
      lookupRequest({ schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION, injectionId, locale: "en-US" }),
      {} as InvocationContext,
    );

    expect(avs.status).toBe(503);
    expect(avs.jsonBody).toMatchObject({ error: { code: "stored-result-invalid" } });
  });

  it("rejects retrieval of a stored record whose identity does not match the requested injection", async () => {
    const row = await finalizedRow(baseEncounter());
    const tamperedFinalJson = JSON.stringify({
      ...JSON.parse(String(row.ipmg_finaljson)),
      injectionId: "11111111-1111-1111-1111-111111111111",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(responseOf({ ...row, ipmg_finaljson: tamperedFinalJson })),
    );

    const documents = await documentsHandler(lookupRequest(), {} as InvocationContext);

    expect(documents.status).toBe(503);
    expect(documents.jsonBody).toMatchObject({ error: { code: "stored-result-invalid" } });
  });

  it.each([
    ["patientId"],
    ["orderId"],
  ])("rejects retrieval whose stored source.%s disagrees with the protected record", async (field) => {
    const row = await finalizedRow(baseEncounter());
    const envelope = JSON.parse(String(row.ipmg_finaljson));
    const tampered = JSON.stringify({
      ...envelope,
      source: { ...envelope.source, [field]: "tampered-value" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf({ ...row, ipmg_finaljson: tampered })));

    const documents = await documentsHandler(lookupRequest(), {} as InvocationContext);

    expect(documents.status).toBe(503);
    expect(documents.jsonBody).toMatchObject({ error: { code: "stored-result-invalid" } });
  });

  it("rejects retrieval whose stored idempotencyKey disagrees with the protected Dataverse idempotency-key column", async () => {
    const row = await finalizedRow(baseEncounter());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseOf({ ...row, ipmg_idempotencykey: "a-completely-different-persisted-key" }),
      ),
    );

    const avs = await avsHandler(
      lookupRequest({ schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION, injectionId, locale: "en-US" }),
      {} as InvocationContext,
    );

    expect(avs.status).toBe(503);
    expect(avs.jsonBody).toMatchObject({ error: { code: "stored-result-invalid" } });
  });

  it("returns the validated final documents and AVS for a genuinely finalized row", async () => {
    const row = await finalizedRow(baseEncounter());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));

    const documents = await documentsHandler(lookupRequest(), {} as InvocationContext);
    expect(documents.status).toBe(200);
    expect(documents.jsonBody).toMatchObject({ mode: "final" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));
    const avs = await avsHandler(
      lookupRequest({ schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION, injectionId, locale: "en-US" }),
      {} as InvocationContext,
    );
    expect(avs.status).toBe(200);
    expect((avs.jsonBody as any).avs.documentStatus).toBe("PATIENT COPY");
  });
});

describe("AVS preview is visibly non-final for every disposition", () => {
  const previewRequest = (previewEncounter: InjectionEncounter): HttpRequest =>
    ({
      headers: new Headers({ "x-ms-client-principal": principalHeader }),
      json: vi.fn().mockResolvedValue({
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        source,
        encounterJson: JSON.stringify(previewEncounter),
        locale: "en-US",
      }),
    }) as unknown as HttpRequest;

  it.each([
    ["administered", baseEncounter()],
    ["held", heldEncounter()],
    ["escalated", escalatedEncounter()],
    ["provider", providerEncounter()],
  ])("shows STAFF PREVIEW - NOT FINAL for a %s disposition preview, never PATIENT COPY or CARE HANDOFF", async (_label, previewEncounter) => {
    const response = await avsHandler(previewRequest(previewEncounter), {} as InvocationContext);

    expect(response.status).toBe(200);
    const body = response.jsonBody as any;
    expect(body.avs.documentStatus).toBe("STAFF PREVIEW - NOT FINAL");
    expect(body.avs.html).toContain("STAFF PREVIEW - NOT FINAL");
  });

  it("only a successful finalize response reads PATIENT COPY for an administered disposition", async () => {
    const row = await finalizedRow(baseEncounter());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseOf(row)));

    const avs = await avsHandler(
      lookupRequest({ schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION, injectionId, locale: "en-US" }),
      {} as InvocationContext,
    );

    expect((avs.jsonBody as any).avs.documentStatus).toBe("PATIENT COPY");
  });
});
