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

const principalHeader = Buffer.from(
  JSON.stringify({
    userId: "entra-object-id",
    userDetails: "MA User",
    userRoles: [finalizerRole],
  }),
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
    const evaluation = evaluateInjectionForPowerApps({
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source,
      encounter: draftEncounter,
      facilityDate: "2026-08-30",
    });
    if (!evaluation.ok) throw new Error(evaluation.error.message);
    const storedEnvelope = {
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source: storedSource,
      encounterJson: JSON.stringify(draftEncounter),
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          "@odata.etag": source.sourceRecordVersion,
          ipmg_draftjson: JSON.stringify(storedEnvelope),
          ipmg_finaljson: "",
          ipmg_workflowstatus: 100000000,
          ipmg_idempotencykey: "",
          ipmg_tebraacknowledged: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
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
        confirmation: {
          confirmed: true,
          acknowledgementKind: "tebra",
        },
      }),
    } as unknown as HttpRequest;

    const response = await finalizeHandler(request, {} as InvocationContext);

    expect(response.status).toBe(422);
    expect(response.jsonBody).toMatchObject({
      error: { code: "check-in-acknowledgement-required" },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reloads, re-evaluates, attributes, renders, and persists one final bundle", async () => {
    const draftEncounter = encounter();
    const evaluation = evaluateInjectionForPowerApps({
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source,
      encounter: draftEncounter,
      facilityDate: "2026-08-30",
    });
    if (!evaluation.ok) throw new Error(evaluation.error.message);

    const storedEnvelope = {
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source: storedSource,
      encounterJson: JSON.stringify(draftEncounter),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            "@odata.etag": 'W/"42"',
            ipmg_draftjson: JSON.stringify(storedEnvelope),
            ipmg_finaljson: "",
            ipmg_workflowstatus: 100000000,
            ipmg_idempotencykey: "",
            ipmg_tebraacknowledged: true,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ETag: 'W/"42"',
            },
          },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const requestBody = {
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      injectionId,
      sourceRecordVersion: source.sourceRecordVersion,
      evaluationFingerprint: evaluation.value.evaluationFingerprint,
      confirmation: {
        confirmed: true,
        acknowledgementKind: "tebra",
      },
    };
    const request = {
      headers: new Headers({
        "x-ms-client-principal": principalHeader,
        "idempotency-key": idempotencyKey,
        "x-correlation-id": "finalize-test-1",
      }),
      json: vi.fn().mockResolvedValue(requestBody),
    } as unknown as HttpRequest;

    const response = await finalizeHandler(
      request,
      {} as InvocationContext,
    );

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
    const body = response.jsonBody as Record<string, any>;
    expect(body.documents.note.text).toContain("Invega Sustenna 156 mg");
    expect(body.avs.html).toContain("MRN-500");
    expect(body.evaluation.output.needle).toBeDefined();
    expect(body.evaluation.output.requirements).toBeInstanceOf(Array);
    expect(body.evaluationFingerprint).not.toBe(
      evaluation.value.evaluationFingerprint,
    );

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
  });
});
