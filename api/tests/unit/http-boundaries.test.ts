import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HttpRequest } from "@azure/functions";

import { authenticatedPrincipal } from "../../src/http/auth";
import { facilityDate, readApiConfiguration } from "../../src/config";
import {
  asSourceReference,
  avsPreviewHttpBodySchema,
  documentPreviewHttpBodySchema,
  evaluateHttpBodySchema,
  finalizeHttpBodySchema,
  orderContextSchema,
  parseEncounterJson,
  storedDraftEnvelopeSchema,
  storedFinalEnvelopeSchema,
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

    const result = documentPreviewHttpBodySchema.safeParse({
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
      documentPreviewHttpBodySchema.safeParse({
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
      documentPreviewHttpBodySchema.safeParse({
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        source: { ...validSource, unexpected: "must not be silently accepted" },
        encounterJson: JSON.stringify(validEncounter),
      }).success,
    ).toBe(false);
    expect(
      documentPreviewHttpBodySchema.safeParse({
        schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
        source: { ...validSource, sourceRecordVersion: "42" },
        encounterJson: JSON.stringify(validEncounter),
      }).success,
    ).toBe(false);
  });

  it("splits document vs. AVS preview schemas so locale requiredness matches Swagger exactly", () => {
    const base = {
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source: validSource,
      encounterJson: JSON.stringify(validEncounter),
    };
    // GetInjectionDocuments never declares locale, so the field is not part
    // of the schema at all — sending one is rejected, matching Swagger.
    expect(documentPreviewHttpBodySchema.safeParse(base).success).toBe(true);
    expect(
      documentPreviewHttpBodySchema.safeParse({ ...base, locale: "en-US" }).success,
    ).toBe(false);
    // GenerateInjectionAvs requires locale, matching Swagger's required list.
    expect(avsPreviewHttpBodySchema.safeParse(base).success).toBe(false);
    expect(
      avsPreviewHttpBodySchema.safeParse({ ...base, locale: "en-US" }).success,
    ).toBe(true);
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

  it("checks an optional order-context snapshot but never invents fields not present", () => {
    expect(orderContextSchema.safeParse({}).success).toBe(true);
    expect(
      orderContextSchema.safeParse({ medicationKey: "sustenna", dose: "156 mg" }).success,
    ).toBe(true);
    expect(
      orderContextSchema.safeParse({ unexpected: "must not be silently accepted" }).success,
    ).toBe(false);
  });

  it("validates a complete stored-final envelope and rejects an incomplete one", () => {
    const complete = {
      schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
      source: validSource,
      injectionId: "9d7f434e-7f47-4c45-bd8e-c88d9a8cfbdd",
      status: "finalized",
      disposition: "administered",
      idempotencyKey: "f4d3700d-ec30-4f1f-87e1-9dd6b1bbce31",
      requestFingerprint: "a".repeat(64),
      finalEncounter: validEncounter,
      evaluation: { workflow: "injection" },
      evaluationFingerprint: "0123456789abcdef",
      finalizedAt: "2026-08-30T20:00:00.000Z",
      attestation: {
        staff: "MA User",
        subject: "entra-object-id",
        timestamp: "2026-08-30T20:00:00.000Z",
        statementVersion: "clinical-action-v1",
        acknowledgementKind: "tebra",
      },
      acknowledgement: {
        kind: "tebra",
        acknowledgedAtUtc: "2026-08-30T20:00:00.000Z",
        acknowledgedByUserId: "entra-object-id",
        acknowledgedByDisplayName: "MA User",
      },
      documents: {
        note: {
          workflow: "injection",
          sections: [],
          text: "note",
          cc: "",
          assessment: "",
          plan: "",
          all: "note",
        },
      },
      avs: {
        documentStatus: "PATIENT COPY",
        contentType: "text/html",
        fileName: "injection-avs-action-100.html",
        html: "<article></article>",
        generatedAt: "2026-08-30T20:00:00.000Z",
      },
      clinicalReferenceVersion: "injection-clinical-reference-v1",
    };
    expect(storedFinalEnvelopeSchema.safeParse(complete).success).toBe(true);

    const { requestFingerprint: _omitted, ...missingFingerprint } = complete;
    expect(storedFinalEnvelopeSchema.safeParse(missingFingerprint).success).toBe(false);
    expect(
      storedFinalEnvelopeSchema.safeParse({ ...complete, status: "draft" }).success,
    ).toBe(false);
    expect(
      storedFinalEnvelopeSchema.safeParse({
        ...complete,
        avs: { ...complete.avs, documentStatus: "not-a-real-status" },
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

  it("prefers the documented App Service name_typ/role_typ indirection", () => {
    // The documented App Service Easy Auth principal shape carries name_typ
    // and role_typ pointing at the exact claim type the identity uses,
    // mirroring .NET ClaimsIdentity's NameClaimType/RoleClaimType.
    const principal = authenticatedPrincipal(
      requestWithPrincipal({
        name_typ: "http://contoso.example/claims/displayname",
        role_typ: "http://contoso.example/claims/approle",
        claims: [
          { typ: "http://contoso.example/claims/displayname", val: "Nurse Practitioner" },
          { typ: "sub", val: "aad-subject-1" },
          { typ: "http://contoso.example/claims/approle", val: "ClinicalActions.Finalize" },
        ],
      }),
      "ClinicalActions.Finalize",
    );

    expect(principal).toEqual({
      userId: "aad-subject-1",
      displayName: "Nurse Practitioner",
      roles: ["ClinicalActions.Finalize"],
      scopes: [],
    });
  });

  it("matches exact short claim types (name, preferred_username, email, role, roles)", () => {
    const byExactName = authenticatedPrincipal(
      requestWithPrincipal({
        claims: [
          { typ: "sub", val: "oid-3" },
          { typ: "preferred_username", val: "ma.user@example.com" },
          { typ: "roles", val: "ClinicalActions.Finalize" },
        ],
      }),
      "ClinicalActions.Finalize",
    );
    expect(byExactName?.displayName).toBe("ma.user@example.com");
    expect(byExactName?.roles).toContain("ClinicalActions.Finalize");

    const byExactRole = authenticatedPrincipal(
      requestWithPrincipal({
        claims: [
          { typ: "sub", val: "oid-4" },
          { typ: "email", val: "nurse@example.com" },
          { typ: "role", val: "ClinicalActions.Finalize" },
        ],
      }),
      "ClinicalActions.Finalize",
    );
    expect(byExactRole?.displayName).toBe("nurse@example.com");
    expect(byExactRole?.roles).toContain("ClinicalActions.Finalize");
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

  it("(authorization scope) grants any holder of the single required role access without record/facility scoping", () => {
    // Documents the deployment's actual authorization boundary (see
    // api/README.md "Authorization scope"): two different authenticated
    // principals holding the same required role are indistinguishable to
    // the API's own authorization check. This build's safety therefore
    // depends on ENTRA_REQUIRED_ROLE being held only by this single
    // facility's tightly controlled injection staff, not on any per-record
    // or per-facility check performed here.
    const first = authenticatedPrincipal(
      requestWithPrincipal({
        userId: "staff-1",
        userDetails: "Staff One",
        userRoles: ["Injection.ReadWrite"],
      }),
      "Injection.ReadWrite",
    );
    const second = authenticatedPrincipal(
      requestWithPrincipal({
        userId: "staff-2",
        userDetails: "Staff Two",
        userRoles: ["Injection.ReadWrite"],
      }),
      "Injection.ReadWrite",
    );
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.roles).toEqual(second?.roles);
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
    "DATAVERSE_CHECKIN_ID_COLUMN",
    "DATAVERSE_PATIENT_ID_COLUMN",
    "DATAVERSE_ORDER_ID_COLUMN",
    "DATAVERSE_ORDER_CONTEXT_COLUMN",
    "DATAVERSE_ACK_SOURCE_COLUMN",
    "DATAVERSE_ACK_AT_COLUMN",
    "DATAVERSE_ACK_BY_COLUMN",
    "DATAVERSE_ACK_CHECKIN_ID_COLUMN",
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

  it("preserves text statuses, parses Dataverse Choice values as integers, and leaves optional columns undefined when unset", () => {
    Object.assign(process.env, {
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
      DATAVERSE_FINAL_STATUS_VALUE: "finalized",
    });

    expect(readApiConfiguration({ requireDataverse: true }).dataverse).toMatchObject({
      draftStatusValue: 100000000,
      finalStatusValue: "finalized",
      checkInIdColumn: "ipmg_checkinid",
      patientIdColumn: "ipmg_patientid",
      orderIdColumn: "ipmg_orderid",
      orderContextColumn: undefined,
      acknowledgmentSourceColumn: undefined,
    });
  });

  it("loads the optional order-context and acknowledgement provenance columns when configured", () => {
    Object.assign(process.env, {
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
      DATAVERSE_ORDER_CONTEXT_COLUMN: "ipmg_ordercontextjson",
      DATAVERSE_ACK_SOURCE_COLUMN: "ipmg_acksource",
      DATAVERSE_ACK_AT_COLUMN: "ipmg_ackatutc",
      DATAVERSE_ACK_BY_COLUMN: "ipmg_ackby",
      DATAVERSE_ACK_CHECKIN_ID_COLUMN: "ipmg_ackcheckinid",
      DATAVERSE_DRAFT_STATUS_VALUE: "100000000",
      DATAVERSE_FINAL_STATUS_VALUE: "100000001",
    });

    expect(readApiConfiguration({ requireDataverse: true }).dataverse).toMatchObject({
      orderContextColumn: "ipmg_ordercontextjson",
      acknowledgmentSourceColumn: "ipmg_acksource",
      acknowledgedAtColumn: "ipmg_ackatutc",
      acknowledgedByColumn: "ipmg_ackby",
      acknowledgedCheckInIdColumn: "ipmg_ackcheckinid",
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

  it("rejects a Dataverse configuration missing the protected check-in/patient/order columns", () => {
    Object.assign(process.env, {
      DATAVERSE_URL: "https://example.crm.dynamics.com",
      DATAVERSE_ACTION_ENTITY_SET: "ipmg_clinicalactions",
      DATAVERSE_DRAFT_JSON_COLUMN: "ipmg_draftjson",
      DATAVERSE_FINAL_JSON_COLUMN: "ipmg_finaljson",
      DATAVERSE_STATUS_COLUMN: "ipmg_workflowstatus",
      DATAVERSE_IDEMPOTENCY_COLUMN: "ipmg_idempotencykey",
      DATAVERSE_TEBRA_ACKNOWLEDGED_COLUMN: "ipmg_tebraacknowledged",
      DATAVERSE_DRAFT_STATUS_VALUE: "100000000",
      DATAVERSE_FINAL_STATUS_VALUE: "100000001",
      // DATAVERSE_CHECKIN_ID_COLUMN intentionally omitted
    });

    expect(() => readApiConfiguration({ requireDataverse: true })).toThrow(
      /DATAVERSE_CHECKIN_ID_COLUMN/,
    );
  });
});
