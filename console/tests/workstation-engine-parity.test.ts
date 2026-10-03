import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as original from "../../src/domain/injection.js";
import * as originalCatalog from "../../src/domain/injection-catalog.js";
import * as originalDates from "../../src/domain/dates.js";
import * as originalNeedle from "../../src/domain/injection-needle.js";
import * as originalNdc from "../../src/domain/injection-ndc.js";
import * as originalScreening from "../../src/domain/injection-patient-screening.js";
import * as port from "../src/shared/workstation/domain/injection.js";
import * as catalog from "../src/shared/workstation/domain/injection-catalog.js";
import * as dates from "../src/shared/workstation/domain/dates.js";
import * as needle from "../src/shared/workstation/domain/injection-needle.js";
import * as ndc from "../src/shared/workstation/domain/injection-ndc.js";
import * as screening from "../src/shared/workstation/domain/injection-patient-screening.js";

const medicationKeys = Object.keys(
  catalog.INJECTION_MEDICATIONS,
) as catalog.InjectionMedicationKey[];
const reasons: port.InjectionReason[] = [
  "scheduled",
  "initiation",
  "reinit",
  "loading",
  "prn",
];

// Evaluation contains the medication's administrationRule function. Compare its
// actual routes/sites separately, and compare every serialized engine decision,
// issue, field requirement, guidance fact, and source-provenance field here.
const serializable = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value));

function encounterFor(
  key: catalog.InjectionMedicationKey,
): port.InjectionEncounter {
  const medication = catalog.INJECTION_MEDICATIONS[key];
  return {
    ...port.emptyInjectionEncounter(),
    patient: { name: "PARITY, SYNTHETIC", dob: "01/01/1990" },
    medicationKey: key,
    ...(key === "other"
      ? { customMedication: "Synthetic ordered medication" }
      : {}),
    dose: medication.doses[0] ?? "100 mg",
    route: medication.route,
    site: medication.defaultSite || "L deltoid",
    intervalKey: medication.intervalKey,
    reason: "scheduled",
    priorDoseDate: "2026-01-02",
    priorSite: "R deltoid",
    administrationDate: "2026-01-30",
    nextDoseDate: "2026-02-27",
    orderingProvider: "Synthetic Provider",
    administeredBy: "Synthetic MA",
    administrationTime: "09:15",
    allergies: "Synthetic allergy review recorded",
    traceability: {
      ndc: "12345-6789-01",
      lot: "PARITY-LOT",
      expiration: "2027-12",
    },
    vitals: {
      bp: "118/74",
      hr: "72",
      temperature: "98.4 F",
      weight: "89.9",
      weightUnit: "kg",
    },
    habitus: "average",
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
    verifications: Object.fromEntries(
      Object.keys(port.verificationLabels).map((key) => [key, true]),
    ),
    acuteSafetyScreenConfirmed: true,
    disposition: { kind: "administered" },
    details: { productSource: "Synthetic clinic stock" },
  };
}

function expectEvaluationParity(encounter: port.InjectionEncounter) {
  const context = { today: "2026-09-15", previousSite: "R deltoid" };
  const actual = port.InjectionEngine.evaluate(encounter, context);
  const expected = original.InjectionEngine.evaluate(encounter, context);
  expect(serializable(actual)).toEqual(serializable(expected));
  expect(actual.output.medication?.administrationRule(encounter.dose)).toEqual(
    expected.output.medication?.administrationRule(encounter.dose),
  );
  return actual;
}

describe("original MA-Workstation engine parity", () => {
  it("keeps all clinical source bytes synchronized after the documented ESM/format transformation", () => {
    const output = execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../scripts/sync-workstation-engine.mjs", import.meta.url),
        ),
        "--check",
      ],
      { encoding: "utf8" },
    );
    expect(output).toContain("Verified all 8 workstation engine modules");
  });

  it.each(medicationKeys)(
    "preserves complete %s timing, dose, phase, and requirement decisions",
    (key) => {
      const encounter = encounterFor(key);
      const medication = catalog.INJECTION_MEDICATIONS[key];
      const oldMedication = originalCatalog.INJECTION_MEDICATIONS[key];
      const doses = [...new Set([...medication.doses, "999 mg"])];
      for (const dose of doses) {
        encounter.dose = dose;
        expect(medication.administrationRule(dose)).toEqual(
          oldMedication.administrationRule(dose),
        );
        for (const interval of catalog.INJECTION_INTERVAL_OPTIONS) {
          expect(
            catalog.allowedDosesForInterval(medication, interval.key),
          ).toEqual(
            originalCatalog.allowedDosesForInterval(
              oldMedication,
              interval.key,
            ),
          );
        }
        expectEvaluationParity(encounter);
      }
      encounter.dose = medication.doses[0] ?? "100 mg";
      for (const interval of catalog.INJECTION_INTERVAL_OPTIONS) {
        encounter.intervalKey = interval.key;
        const days = catalog.INJECTION_INTERVAL_DAYS[interval.key];
        const window = catalog.effectiveInjectionWindow(
          medication,
          interval.key,
        );
        for (const offset of new Set([
          -1,
          0,
          days - window.windowBefore - 1,
          days - window.windowBefore,
          days,
          days + window.windowAfter,
          days + window.windowAfter + 1,
          365,
        ])) {
          encounter.administrationDate = dates.addCalendarDays(
            encounter.priorDoseDate,
            offset,
          );
          encounter.nextDoseDate = dates.addCalendarDays(
            encounter.administrationDate,
            365,
          );
          expectEvaluationParity(encounter);
        }
      }
      for (const reason of reasons) {
        encounter.reason = reason;
        encounter.verifications = {};
        expectEvaluationParity(encounter);
      }
    },
  );

  it("preserves every supported initiation protocol, paired component requirement, and oral-status decision", () => {
    for (const key of medicationKeys) {
      expect(port.injectionInitiationOptions(key)).toEqual(
        original.injectionInitiationOptions(key),
      );
      for (const option of port.injectionInitiationOptions(key)) {
        expect(port.injectionInitiationConfig(option.id, key)).toEqual(
          original.injectionInitiationConfig(option.id, key),
        );
        const encounter = encounterFor(key);
        encounter.reason = "initiation";
        encounter.initiation = {
          ...port.emptyInjectionInitiation(),
          protocol: option.id,
        };
        expectEvaluationParity(encounter);
        encounter.initiation.planVerified = true;
        encounter.initiation.providerNote =
          "Synthetic documented active provider plan";
        encounter.initiation.sustennaOrder = "standard";
        encounter.initiation.day1Date = "2026-01-23";
        encounter.initiation.second = {
          dose: "400 mg",
          site: "L ventrogluteal",
          ndc: "59148-072-80",
          lot: "PAIR-LOT",
          expiration: "2027-12",
          given: true,
          orderVerified: true,
        };
        for (const oralStatus of ["", "verified", "administered"] as const) {
          encounter.initiation.oralStatus = oralStatus;
          expectEvaluationParity(encounter);
        }
        encounter.initiation.second.site = encounter.site;
        expectEvaluationParity(encounter);
        encounter.initiation.second.productKey = "vivitrol";
        expectEvaluationParity(encounter);
      }
    }
  });

  it("retains urgent vital signs and unresolved active safety concerns, including truthful handoffs", () => {
    const variations: Partial<port.InjectionEncounter>[] = [
      { administrationDate: "2026-02-30" },
      { nextDoseDate: "2025-01-01" },
      { traceability: { ndc: "test", lot: "test", expiration: "not-a-month" } },
      { vitals: { bp: "180/120" } },
      { vitals: { bp: "89/49" } },
      { vitals: { hr: "120" } },
      { vitals: { temperature: "38 C" } },
      { activeSafetyConcerns: [port.INJECTION_SAFETY_TRIGGERS[0]!.key] },
      { details: { volume: "3.1", volumeUnit: "mL" } },
      {
        details: {
          administrationException: true,
          exceptionSummary: "Synthetic administration deviation",
        },
      },
      {
        details: {
          productIssue: true,
          productIssueDetail: "Synthetic incomplete delivery",
        },
      },
      {
        disposition: {
          kind: "held",
          provider: "Synthetic Provider",
          time: "09:20",
          outcome: "Hold for assessment",
        },
      },
      {
        disposition: {
          kind: "escalated",
          provider: "Synthetic Provider",
          time: "09:20",
          outcome: "Provider evaluation",
        },
      },
    ];
    for (const patch of variations)
      expectEvaluationParity({ ...encounterFor("haldol"), ...patch });
    const urgent = expectEvaluationParity({
      ...encounterFor("haldol"),
      vitals: { bp: "180/120" },
    });
    expect(urgent.stops.map((issue) => issue.code)).toContain(
      "vitals.bp.urgent",
    );
    expect(urgent.output.canFinalize).toBe(false);
  });

  it("preserves late-review and administration-review fingerprints when encounter facts change", () => {
    const encounter = encounterFor("erzofri");
    encounter.administrationDate = "2026-02-10";
    encounter.details = {
      ...encounter.details,
      lateDoseReview: "provider-authorized",
      lateDoseReviewProvider: "Synthetic Provider",
      lateDoseReviewTime: "09:10",
      lateDoseReviewFingerprint:
        port.injectionTimingReviewFingerprint(encounter),
    };
    expect(port.injectionTimingReviewFingerprint(encounter)).toBe(
      original.injectionTimingReviewFingerprint(encounter),
    );
    expect(port.hasCurrentLateDoseReview(encounter)).toBe(true);
    expectEvaluationParity(encounter);
    encounter.dose = "234 mg";
    expect(port.hasCurrentLateDoseReview(encounter)).toBe(false);
    expect(port.hasCurrentLateDoseReview(encounter)).toBe(
      original.hasCurrentLateDoseReview(encounter),
    );
    expect(port.injectionAdministrationReviewFingerprint(encounter)).toBe(
      original.injectionAdministrationReviewFingerprint(encounter),
    );
    expectEvaluationParity(encounter);
  });

  it("preserves needle selection at weight thresholds, all tissue-depth bands, and unresolved assessment", () => {
    for (const key of medicationKeys) {
      const medication = catalog.INJECTION_MEDICATIONS[key];
      const oldMedication = originalCatalog.INJECTION_MEDICATIONS[key];
      for (const site of [
        "L deltoid",
        "R ventrogluteal",
        "Abdomen LUQ (SubQ)",
        "",
        "ordered site",
      ]) {
        for (const weightKg of [null, 89.9, 90, 90.1, 140]) {
          for (const habitus of ["", "lean", "average", "larger"] as const) {
            const context = { weightKg, habitus };
            const dose = medication.doses[0] ?? "100 mg";
            expect(
              needle.resolveNeedle(medication, dose, site, context),
            ).toEqual(
              originalNeedle.resolveNeedle(oldMedication, dose, site, context),
            );
            expect(needle.techniqueNotesFor(medication, dose, site)).toEqual(
              originalNeedle.techniqueNotesFor(oldMedication, dose, site),
            );
          }
        }
      }
    }
    const under = needle.resolveNeedle(
      catalog.INJECTION_MEDICATIONS.sustenna,
      "156 mg",
      "L deltoid",
      { weightKg: 89.9 },
    );
    const at = needle.resolveNeedle(
      catalog.INJECTION_MEDICATIONS.sustenna,
      "156 mg",
      "L deltoid",
      { weightKg: 90 },
    );
    expect(needle.formatNeedleSpec(under.needle!)).toBe('23G 1"');
    expect(needle.formatNeedleSpec(at.needle!)).toBe('22G 1½"');
  });

  it("preserves all response narratives and their optional detail choices", () => {
    expect(port.INJECTION_RESPONSE_OPTIONS).toEqual(
      original.INJECTION_RESPONSE_OPTIONS,
    );
    for (const option of port.INJECTION_RESPONSE_OPTIONS) {
      for (const detail of [
        undefined,
        ...(option.details ?? []).map((item) => item.key),
      ]) {
        const response = {
          kind: option.key,
          detail,
          custom: "Synthetic staff observation",
        };
        expect(port.injectionResponseNote(response)).toBe(
          original.injectionResponseNote(response),
        );
        expect(port.injectionResponseFragment(response)).toBe(
          original.injectionResponseFragment(response),
        );
        expect(port.injectionResponseHeadline(response)).toBe(
          original.injectionResponseHeadline(response),
        );
        expect(port.legacyInjectionResponseMirror(response)).toEqual(
          original.legacyInjectionResponseMirror(response),
        );
        expectEvaluationParity({ ...encounterFor("haldol"), response });
      }
    }
  });

  it("retains package-specific NDC choices, custom-code preservation, and provenance without any network lookup", () => {
    expect(ndc.BUNDLED_INJECTION_NDC_OPTIONS).toEqual(
      originalNdc.BUNDLED_INJECTION_NDC_OPTIONS,
    );
    for (const key of medicationKeys) {
      for (const dose of catalog.INJECTION_MEDICATIONS[key].doses) {
        const query = { medicationKey: key, dose };
        const options = ndc.resolveNdcOptions(query);
        expect(options).toEqual(originalNdc.resolveNdcOptions(query));
        for (const option of options) {
          for (const value of [
            option.ndc,
            option.ndc.replaceAll("-", ""),
            "custom package code",
          ]) {
            expect(ndc.resolveNdcEntry(value)).toEqual(
              originalNdc.resolveNdcEntry(value),
            );
            expect(ndc.selectionForNdcInput(value, query, options)).toEqual(
              originalNdc.selectionForNdcInput(value, query, options),
            );
          }
        }
      }
    }
    expect(ndc.resolveNdcEntry("x65757-401-03")).toEqual({
      value: "x65757-401-03",
      source: "custom",
    });
  });

  it("preserves bilingual product- and phase-specific patient-screening documents", () => {
    for (const key of medicationKeys) {
      for (const reason of reasons) {
        const encounter = { ...encounterFor(key), reason };
        expect(
          screening.canBuildInjectionPatientScreenDocument(encounter),
        ).toBe(
          originalScreening.canBuildInjectionPatientScreenDocument(encounter),
        );
        for (const language of ["en", "es"] as const) {
          expect(
            screening.buildInjectionPatientScreenDocument(encounter, language),
          ).toEqual(
            originalScreening.buildInjectionPatientScreenDocument(
              encounter,
              language,
            ),
          );
        }
      }
    }
  });

  it("preserves original date and Sustenna Day 8 calculations across leap years and year boundaries", () => {
    for (const date of [
      "2024-02-29",
      "2026-01-31",
      "2026-12-28",
      "2026-02-30",
      "",
    ]) {
      expect(dates.calculateSustennaDay8Window(date)).toEqual(
        originalDates.calculateSustennaDay8Window(date),
      );
      for (const days of [-1, 0, 7, 28, 84, 182]) {
        expect(dates.addCalendarDays(date, days)).toBe(
          originalDates.addCalendarDays(date, days),
        );
      }
    }
  });
});
