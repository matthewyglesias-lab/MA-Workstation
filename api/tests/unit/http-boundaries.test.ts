import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HttpRequest } from "@azure/functions";

import { authenticatedPrincipal } from "../../src/http/auth";
import { facilityDate, readApiConfiguration } from "../../src/config";
import {
  asSourceReference,
  evaluateHttpBodySchema,
  finalizeHttpBodySchema,
  parseEncounterJson,
  previewHttpBodySchema,
  storedDraftEnvelopeSchema,
} from "../../src/http/schema";
import { POWER_APPS_INJECTION_SCHEMA_VERSION } from "../../../src/integrations/power-apps";

const validSource = {
  actionId: "action-100",
  checkInId: "check-in-200",
  patientId: "patient-300",
  orderId: "order-400",
  sourceRecordVersion: "W/\"42\"",
  patientRecordNumber: "MRN-500",
};

const { sourceRecordVersion: _version, ...validStoredSource } = validSource;

const validEncounter = {
  patient: { name: "Test Patient", dob: "1980-02-29" },
  medicationKey: "",
  dose: "",
  route: "",
  site: "",
  intervalKey: "",
  reason: "",
  priorDoseDate: "",
  administrationDate: "",
  nextDoseDate: "",
  orderingProvider: "",
  administeredBy: "",
  administrationTime: "",
  allergies: "",
  traceability: { ndc: "", lot: "", expiration: "" },
  response: { kind: "" },
  attestations: {},
  verifications: {},
  acuteSafetyScreenConfirmed: false,
  disposition: { kind: "" },
};

const evaluateBody = {
  schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
  injectionId: "9d7f434e-7f47-4c45-bd8e-c88d9a8cfbdd",
};

const requestWithPrincipal = (principal: unknown): HttpRequest =>
  ({
    headers: new Headers({
      "x-ms-client-principal": Buffer.from(JSON.stringify(principal), "utf8").toString(
        "base64",
      ),
    }),
  }) as HttpRequest;

describe("Power Apps HTTP request schemas", () => {
  it("accepts an ID-only authoritative evaluation lookup", () => {
    expect(evaluateHttpBodySchema.safeParse(evaluateBody).success).toBe(true);
    expect(
      evaluateHttpBodySchema.safeParse({
        ...evaluateBody,
        encounterJson: JSON.stringify(validEncounter),
      }).success,
    ).toBe(false);
  });

  it("accepts complete stored and preview source attribution", () => {
    const stored = storedDraftEnvelopeSchema.safeParse({
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source: validStoredSource,
      encounterJson: JSON.stringify(validEncounter),
    });
    expect(stored.success).toBe(true);

    const result = previewHttpBodySchema.safeParse({
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source: validSource,
      encounterJson: JSON.stringify(validEncounter),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(asSourceReference(result.data.source)).toEqual(validSource);
  });

  it("fails closed for missing preview attribution and unknown fields", () => {
    const { orderId: _omitted, ...sourceWithoutOrder } = validSource;

    expect(
      previewHttpBodySchema.safeParse({
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        source: sourceWithoutOrder,
        encounterJson: JSON.stringify(validEncounter),
      }).success,
    ).toBe(false);
    expect(
      evaluateHttpBodySchema.safeParse({
        ...evaluateBody,
        unexpected: "must not be silently accepted",
      }).success,
    ).toBe(false);
    expect(
      previewHttpBodySchema.safeParse({
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        source: { ...validSource, unexpected: "must not be silently accepted" },
        encounterJson: JSON.stringify(validEncounter),
      }).success,
    ).toBe(false);
    expect(
      previewHttpBodySchema.safeParse({
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        source: { ...validSource, sourceRecordVersion: "42" },
        encounterJson: JSON.stringify(validEncounter),
      }).success,
    ).toBe(false);
  });

  it("strictly validates the encounter JSON and real calendar dates", () => {
    expect(parseEncounterJson(JSON.stringify(validEncounter)).success).toBe(true);
    expect(
      parseEncounterJson(
        JSON.stringify({ ...validEncounter, patient: { name: "Test", dob: "2025-02-29" } }),
      ).success,
    ).toBe(false);
    expect(
      parseEncounterJson(JSON.stringify({ ...validEncounter, unexpected: true })).success,
    ).toBe(false);
    expect(parseEncounterJson("{not valid json").success).toBe(false);
  });

  it("requires complete manual acknowledgement provenance", () => {
    const base = {
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      injectionId: "9d7f434e-7f47-4c45-bd8e-c88d9a8cfbdd",
      sourceRecordVersion: 'W/"42"',
      evaluationFingerprint: "0123456789abcdef",
      confirmation: {
        confirmed: true,
        acknowledgementKind: "manual",
      },
    };

    expect(finalizeHttpBodySchema.safeParse(base).success).toBe(false);
    const complete = finalizeHttpBodySchema.safeParse({
        ...base,
        confirmation: {
          ...base.confirmation,
          manualReason: "Tebra was already acknowledged before migration",
          manualSource: "Verified against signed encounter note",
        },
      });
    expect(complete.success).toBe(true);
    if (complete.success) expect(complete.data.sourceRecordVersion).toBe('W/"42"');

    expect(
      finalizeHttpBodySchema.safeParse({
        ...base,
        confirmation: {
          confirmed: true,
          acknowledgementKind: "tebra",
          manualReason: "must not be accepted",
        },
      }).success,
    ).toBe(false);
  });
});

describe("clinic-local facility date", () => {
  it("uses the configured IANA zone at a UTC date boundary", () => {
    const instant = new Date("2026-01-01T01:30:00.000Z");

    expect(facilityDate("America/Los_Angeles", instant)).toBe("2025-12-31");
    expect(facilityDate("Asia/Tokyo", instant)).toBe("2026-01-01");
  });
});

describe("Easy Auth principal enforcement", () => {
  it("accepts a principal carrying the required app role", () => {
    const principal = authenticatedPrincipal(
      requestWithPrincipal({
        userId: "entra-object-id",
        userDetails: "Clinical User",
        userRoles: ["ClinicalActions.Finalize"],
      }),
      "ClinicalActions.Finalize",
    );

    expect(principal).toEqual({
      userId: "entra-object-id",
      displayName: "Clinical User",
      roles: ["ClinicalActions.Finalize"],
      scopes: [],
    });
  });

  it("resolves identity claims and permits scope-based authorization", () => {
    const principal = authenticatedPrincipal(
      requestWithPrincipal({
        claims: [
          { typ: "http://schemas.microsoft.com/identity/claims/objectidentifier", val: "oid-1" },
          {
            typ: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
            val: "MA User",
          },
          { typ: "scp", val: "openid ClinicalActions.Finalize" },
        ],
      }),
      "ClinicalActions.Finalize",
    );

    expect(principal?.userId).toBe("oid-1");
    expect(principal?.displayName).toBe("MA User");
    expect(principal?.scopes).toContain("ClinicalActions.Finalize");
  });

  it("parses the required role from Easy Auth claims", () => {
    const principal = authenticatedPrincipal(
      requestWithPrincipal({
        userId: "oid-2",
        userDetails: "Nurse User",
        claims: [
          {
            typ: "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
            val: "ClinicalActions.Finalize",
          },
        ],
      }),
      "ClinicalActions.Finalize",
    );

    expect(principal?.roles).toContain("ClinicalActions.Finalize");
  });

  it("rejects missing, malformed, unidentified, and unauthorized principals", () => {
    expect(authenticatedPrincipal({ headers: new Headers() } as HttpRequest, "role")).toBeNull();
    expect(
      authenticatedPrincipal(
        { headers: new Headers({ "x-ms-client-principal": "not-base64-json" }) } as HttpRequest,
        "role",
      ),
    ).toBeNull();
    expect(
      authenticatedPrincipal(
        requestWithPrincipal({ userId: "oid", userDetails: "User", userRoles: ["Other"] }),
        "ClinicalActions.Finalize",
      ),
    ).toBeNull();
    expect(
      authenticatedPrincipal(
        requestWithPrincipal({ userId: "", userDetails: "", userRoles: ["role"] }),
        "role",
      ),
    ).toBeNull();
  });
});

describe.sequential("API configuration", () => {
  const managedNames = [
    "CLINIC_TIME_ZONE",
    "CLINIC_PROVIDER_REGISTER",
    "CLINIC_FACILITY_NAME",
    "CLINIC_FACILITY_UNIT",
    "CLINIC_PHONE",
    "ENTRA_REQUIRED_ROLE",
    "DATAVERSE_URL",
    "DATAVERSE_ACTION_ENTITY_SET",
    "DATAVERSE_DRAFT_JSON_COLUMN",
    "DATAVERSE_FINAL_JSON_COLUMN",
    "DATAVERSE_STATUS_COLUMN",
    "DATAVERSE_IDEMPOTENCY_COLUMN",
    "DATAVERSE_TEBRA_ACKNOWLEDGED_COLUMN",
    "DATAVERSE_DRAFT_STATUS_VALUE",
    "DATAVERSE_FINAL_STATUS_VALUE",
  ] as const;
  const original = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const name of managedNames) {
      original.set(name, process.env[name]);
      delete process.env[name];
    }
    Object.assign(process.env, {
      CLINIC_TIME_ZONE: "America/Los_Angeles",
      CLINIC_PROVIDER_REGISTER: "san-bernardino-v1",
      CLINIC_FACILITY_NAME: "IPMG",
      CLINIC_FACILITY_UNIT: "Clinic",
      CLINIC_PHONE: "555-0100",
      ENTRA_REQUIRED_ROLE: "ClinicalActions.Finalize",
    });
  });

  afterEach(() => {
    for (const name of managedNames) {
      const value = original.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    original.clear();
  });

  it("loads reviewed clinic configuration without requiring Dataverse for evaluation", () => {
    expect(readApiConfiguration()).toEqual({
      clinic: {
        facilityName: "IPMG",
        facilityUnit: "Clinic",
        clinicPhone: "555-0100",
        timeZone: "America/Los_Angeles",
      },
      requiredRole: "ClinicalActions.Finalize",
    });
  });

  it("preserves text statuses and parses Dataverse Choice values as integers", () => {
    Object.assign(process.env, {
      DATAVERSE_URL: "https://example.crm.dynamics.com",
      DATAVERSE_ACTION_ENTITY_SET: "ipmg_clinicalactions",
      DATAVERSE_DRAFT_JSON_COLUMN: "ipmg_draftjson",
      DATAVERSE_FINAL_JSON_COLUMN: "ipmg_finaljson",
      DATAVERSE_STATUS_COLUMN: "ipmg_workflowstatus",
      DATAVERSE_IDEMPOTENCY_COLUMN: "ipmg_idempotencykey",
      DATAVERSE_TEBRA_ACKNOWLEDGED_COLUMN: "ipmg_tebraacknowledged",
      DATAVERSE_DRAFT_STATUS_VALUE: "100000000",
      DATAVERSE_FINAL_STATUS_VALUE: "finalized",
    });

    expect(readApiConfiguration({ requireDataverse: true }).dataverse).toMatchObject({
      draftStatusValue: 100000000,
      finalStatusValue: "finalized",
    });
  });

  it("rejects invalid zones, unreviewed provider registers, and missing Dataverse", () => {
    process.env.CLINIC_TIME_ZONE = "Not/A_Time_Zone";
    expect(() => readApiConfiguration()).toThrow(/valid IANA time zone/);

    process.env.CLINIC_TIME_ZONE = "America/Los_Angeles";
    process.env.CLINIC_PROVIDER_REGISTER = "unreviewed-v1";
    expect(() => readApiConfiguration()).toThrow(/reviewed San Bernardino provider register/);

    process.env.CLINIC_PROVIDER_REGISTER = "san-bernardino-v1";
    expect(() => readApiConfiguration({ requireDataverse: true })).toThrow(
      /DATAVERSE_URL is required/,
    );
  });
});
