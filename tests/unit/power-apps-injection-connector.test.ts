import { describe, expect, it } from "vitest";

import {
  emptyInjectionEncounter,
  injectionAdministrationReviewFingerprint,
  type InjectionEncounter,
} from "../../src/domain/injection";
import {
  POWER_APPS_INJECTION_SCHEMA_VERSION,
  evaluateInjectionForPowerApps,
  prepareInjectionFinalization,
  type EvaluateInjectionRequest,
  type FinalizeInjectionRequest,
  type InjectionClinicConfiguration,
} from "../../src/integrations/power-apps";

const clinic: InjectionClinicConfiguration = {
  facilityName: "IPMG - SAN BERNARDINO",
  facilityUnit: "MEDICATION ADMINISTRATION CLINIC",
  clinicPhone: "(909) 887-6222",
  timeZone: "America/Los_Angeles",
};

const administeredEncounter = (): InjectionEncounter => {
  const encounter: InjectionEncounter = {
    ...emptyInjectionEncounter(),
    patient: { name: "Doe, Jane", dob: "1980-05-12" },
    medicationKey: "sustenna",
    dose: "156 mg",
    route: "IM",
    site: "L deltoid",
    intervalKey: "q4wk",
    reason: "scheduled",
    priorDoseDate: "2026-07-10",
    administrationDate: "2026-08-07",
    administrationTime: "17:50",
    nextDoseDate: "2026-09-04",
    orderingProvider: "Jane Doe, MD",
    administeredBy: "Matthew Y.",
    allergies: "NKDA",
    traceability: {
      ndc: "50458-564-01",
      lot: "PAB1234",
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
    disposition: { kind: "" },
    details: { productSource: "Clinic stock" },
  };
  encounter.disposition = {
    kind: "administered",
    reviewedBy: "Matthew Y.",
    reviewedAt: "2026-08-08T00:52:00.000Z",
    reviewFingerprint: injectionAdministrationReviewFingerprint(encounter),
  };
  return encounter;
};

const evaluateRequest = (
  encounter = administeredEncounter(),
): EvaluateInjectionRequest => ({
  schemaVersion: POWER_APPS_INJECTION_SCHEMA_VERSION,
  source: {
    actionId: "action-1001",
    checkInId: "checkin-1001",
    patientId: "patient-1001",
    orderId: "order-1001",
    sourceRecordVersion: "W/\"845322\"",
    patientRecordNumber: "MRN-1001",
  },
  encounter,
  facilityDate: "2026-08-07",
});

const finalizeRequest = (
  base: EvaluateInjectionRequest,
  expectedEvaluationFingerprint: string,
): FinalizeInjectionRequest => ({
  ...base,
  acknowledgement: {
    kind: "tebra",
    acknowledgedAtUtc: "2026-08-08T00:30:00.000Z",
    acknowledgedByUserId: "entra-user-1001",
    acknowledgedByDisplayName: "Matthew Y.",
  },
  expectedEvaluationFingerprint,
  idempotencyKey: "f4d3700d-ec30-4f1f-87e1-9dd6b1bbce31",
  finalizedByUserId: "entra-user-1001",
  finalizedByDisplayName: "Matthew Y.",
  finalizedAtUtc: "2026-08-08T00:53:00.000Z",
});

describe("Power Apps injection connector facade", () => {
  it("returns MA-engine guidance and an opaque stale-data fingerprint", () => {
    const result = evaluateInjectionForPowerApps(evaluateRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stops).toEqual([]);
    expect(result.value.canFinalize).toBe(true);
    expect(result.value.recordStatus).toBe("ready-to-lock");
    expect(result.value.allowedRoutes).toContain("IM");
    expect(result.value.repeatsPreviousSite).toBe(false);
    expect(result.value.needle).toBeDefined();
    expect(result.value.evaluationFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(result.value.evaluationFingerprint).not.toContain("Doe");
  });

  it("finalizes note and patient AVS from the same evaluated encounter", () => {
    const base = evaluateRequest();
    const evaluation = evaluateInjectionForPowerApps(base);
    if (!evaluation.ok) throw new Error(evaluation.error.message);

    const result = prepareInjectionFinalization(
      finalizeRequest(base, evaluation.value.evaluationFingerprint),
      clinic,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.disposition).toBe("administered");
    expect(result.value.patientDocument.kind).toBe("patient-avs");
    expect(result.value.patientDocument.model.documentStatus).toBe("PATIENT COPY");
    expect(result.value.clinicalNote.assessment).toContain(
      "28 days since prior inj (7/10/26–8/7/26)",
    );
    expect(result.value.clinicalNote.plan).toContain("Date/time: 8/7/26 1750.");
    expect(result.value.patientDocument.html).toContain("MRN-1001");
    expect(result.value.provenance.evaluationFingerprint).toBe(
      evaluation.value.evaluationFingerprint,
    );
  });

  it("rejects a stale evaluation instead of silently reusing it", () => {
    const base = evaluateRequest();
    const result = prepareInjectionFinalization(
      finalizeRequest(base, "0000000000000000"),
      clinic,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "stale-evaluation" },
    });
  });

  it("requires a current attributed administration review", () => {
    const encounter = administeredEncounter();
    encounter.site = "R deltoid";
    const base = evaluateRequest(encounter);
    const evaluation = evaluateInjectionForPowerApps(base);
    if (!evaluation.ok) throw new Error(evaluation.error.message);

    const result = prepareInjectionFinalization(
      finalizeRequest(base, evaluation.value.evaluationFingerprint),
      clinic,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "administration-review-required" },
    });
  });

  it("requires reason and source for a manual check-in acknowledgement", () => {
    const base = evaluateRequest();
    const evaluation = evaluateInjectionForPowerApps(base);
    if (!evaluation.ok) throw new Error(evaluation.error.message);
    const request = finalizeRequest(base, evaluation.value.evaluationFingerprint);
    request.acknowledgement = {
      kind: "manual",
      acknowledgedAtUtc: "2026-08-08T00:30:00.000Z",
      acknowledgedByUserId: "entra-user-1001",
      acknowledgedByDisplayName: "Matthew Y.",
      reason: "",
      source: "",
    };

    expect(prepareInjectionFinalization(request, clinic)).toMatchObject({
      ok: false,
      error: { code: "invalid-acknowledgement" },
    });
  });

  it("produces a care handoff instead of claiming a held injection was given", () => {
    const encounter = administeredEncounter();
    encounter.disposition = {
      kind: "held",
      provider: "Jane Doe, MD",
      time: "2026-08-07T17:45",
      outcome: "Held today; provider will reassess before rescheduling.",
    };
    const base = evaluateRequest(encounter);
    const evaluation = evaluateInjectionForPowerApps(base);
    if (!evaluation.ok) throw new Error(evaluation.error.message);

    const result = prepareInjectionFinalization(
      finalizeRequest(base, evaluation.value.evaluationFingerprint),
      clinic,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.patientDocument.kind).toBe("care-handoff");
    expect(result.value.patientDocument.model.documentStatus).toBe("CARE HANDOFF");
    expect(result.value.patientDocument.model.administration).toEqual([]);
    expect(result.value.clinicalNote.text).toContain("medication not administered");
  });

  it("fails closed for Spanish until reviewed parity content is installed", () => {
    const base = evaluateRequest();
    const evaluation = evaluateInjectionForPowerApps(base);
    if (!evaluation.ok) throw new Error(evaluation.error.message);

    expect(
      prepareInjectionFinalization(
        finalizeRequest(base, evaluation.value.evaluationFingerprint),
        clinic,
        "es-US",
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "locale-not-approved" },
    });
  });
});
