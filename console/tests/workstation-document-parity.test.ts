import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
  InjectionEngine,
  emptyInjectionEncounter,
  emptyInjectionInitiation,
  injectionAdministrationReviewFingerprint,
  type InjectionEncounter,
  type InjectionInitiationProtocol,
} from "../src/shared/workstation/domain/injection.js";
import { INJECTION_MEDICATIONS } from "../src/shared/workstation/domain/injection-catalog.js";
import { injectionEncounterToDocumentationInput } from "../src/shared/workstation/documentation/adapters/injection-from-encounter.js";
import { mapLegacyInitiationProtocol } from "../src/shared/workstation/documentation/adapters/initiation-protocol.js";
import { formatInjectionDocumentation } from "../src/shared/workstation/documentation/injection.js";
import {
  buildInjectionAvsModel,
  type InjectionAvsInput,
} from "../src/shared/workstation/domain/injection-avs-content.js";
import {
  buildInjectionAvsHtml,
  selectInjectionAvsLayout,
} from "../src/shared/workstation/domain/injection-avs-render.js";

// Load the original application at runtime so this parity gate compares two
// implementations, while the console server build stays scoped to its source.
const originalSource = fileURLToPath(new URL("../../src", import.meta.url));
const originalEngine: typeof import("../src/shared/workstation/domain/injection.js") =
  await import(`${originalSource}/domain/injection.ts`);
const originalAdapter: typeof import("../src/shared/workstation/documentation/adapters/injection-from-encounter.js") =
  await import(
    `${originalSource}/documentation/adapters/injection-from-encounter.ts`
  );
const originalFormatter: typeof import("../src/shared/workstation/documentation/injection.js") =
  await import(`${originalSource}/documentation/injection.ts`);
const originalInitiation: typeof import("../src/shared/workstation/documentation/adapters/initiation-protocol.js") =
  await import(`${originalSource}/legacy/documentation-adapter.ts`);
const originalAvs: typeof import("../src/shared/workstation/domain/injection-avs-content.js") =
  await import(`${originalSource}/domain/injection-avs-content.ts`);
const originalRender: typeof import("../src/shared/workstation/domain/injection-avs-render.js") =
  await import(`${originalSource}/domain/injection-avs-render.ts`);

const baseEncounter = (): InjectionEncounter => ({
  ...emptyInjectionEncounter(),
  patient: { name: "PARITY, TEST", dob: "05/12/1980" },
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
  orderingProvider: "Test Provider, MD",
  administeredBy: "Test MA",
  allergies: "NKDA",
  traceability: {
    ndc: "50458-564-01",
    lot: "PARITY-LOT",
    expiration: "2027-10",
  },
  response: { kind: "well" },
  attestations: {
    id2: true,
    rights: true,
    allergy: true,
    consent: true,
    screen: true,
    hygiene: true,
    prior: true,
  },
  verifications: { resuspend: true },
  acuteSafetyScreenConfirmed: true,
  disposition: { kind: "administered" },
  details: { productSource: "Clinic sample" },
});

const compareNote = (encounter: InjectionEncounter) => {
  const context = { today: encounter.administrationDate || "2026-08-07" };
  const evaluation = InjectionEngine.evaluate(encounter, context);
  const sourceEvaluation = originalEngine.InjectionEngine.evaluate(
    encounter,
    context,
  );
  const input = injectionEncounterToDocumentationInput(encounter, evaluation);
  const sourceInput = originalAdapter.injectionEncounterToDocumentationInput(
    encounter,
    sourceEvaluation,
  );
  expect(input).toEqual(sourceInput);
  expect(input, JSON.stringify(evaluation.stops)).not.toBeNull();
  if (!input || !sourceInput) throw new Error("Expected a chartable fixture");
  const note = formatInjectionDocumentation(input, evaluation);
  expect(note).toEqual(
    originalFormatter.formatInjectionDocumentation(
      sourceInput,
      sourceEvaluation,
    ),
  );
  expect(note.text.length).toBeGreaterThan(0);
  return note;
};

const protocols: InjectionInitiationProtocol[] = [
  "maintena-1day",
  "asimtufii-1day",
  "aristada-initio-sameday",
  "maintena-14day",
  "asimtufii-14day",
  "aristada-21day",
  "maintena-provider",
  "asimtufii-provider",
  "aristada-provider",
  "sustenna-day1",
  "sustenna-day8",
  "sustenna-provider",
];

const baseAvs = (
  overrides: Partial<InjectionAvsInput> = {},
): InjectionAvsInput => ({
  patientName: "PARITY, TEST",
  patientDob: "1980-05-12",
  recordNumber: "PARITY-01",
  orderingProvider: "Test Provider, MD",
  administeredBy: "Test MA",
  medicationKey: "sustenna",
  medicationName: "Invega Sustenna",
  genericName: "paliperidone palmitate",
  dose: "156 mg",
  route: "IM",
  site: "L deltoid",
  intervalKey: "q4wk",
  administrationDate: "2026-08-07",
  administrationTime: "17:50",
  nextDoseDate: "2026-09-04",
  lot: "PARITY-LOT",
  expiration: "2027-10",
  responseLabel: "Tolerated well",
  reason: "scheduled",
  initiationProtocol: "",
  day1Date: "",
  clinicPhone: "(909) 887-6222",
  dispositionKind: "administered",
  ...overrides,
});

const compareAvs = (input: InjectionAvsInput) => {
  const model = buildInjectionAvsModel(input);
  expect(model).toEqual(originalAvs.buildInjectionAvsModel(input));
  expect(selectInjectionAvsLayout(model)).toEqual(
    originalRender.selectInjectionAvsLayout(model),
  );
  expect(buildInjectionAvsHtml(input, { runStamp: "08/07/26 1800" })).toBe(
    originalRender.buildInjectionAvsHtml(input, { runStamp: "08/07/26 1800" }),
  );
};

describe("original workstation Tebra documentation parity", () => {
  it("preserves the exact compact current-UI note and section destinations", () => {
    const note = compareNote(baseEncounter());
    expect(note.sections.map((section) => section.destination)).toEqual([
      "CC",
      "Assessment",
      "Plan",
    ]);
    expect(note.cc).toBe(
      "Scheduled LAI — Invega Sustenna 156 mg IM, L deltoid; tolerated well; next due 9/4/26.\n" +
        "Pt presents today for scheduled LAI administration.",
    );
    expect(note.plan).toContain("Date/time: 8/7/26 1750.");
    expect(note.plan).not.toContain("Pt observed post-inj");
    expect(note.text).not.toContain("\nAssessment\n");
  });

  it("preserves recorded optional assessments, custom response, handling and attribution", () => {
    const encounter = baseEncounter();
    encounter.response = {
      kind: "custom",
      custom: "Pt reported transient dizziness resolved within 5 minutes.",
    };
    encounter.orderingProvider = "amoako-samuel";
    encounter.vitals = { bp: "124/78", hr: "72", temperature: "98.6" };
    encounter.details = {
      ...encounter.details,
      siteAssessed: true,
      educationProvided: true,
      departureStatus: "continued-observation",
      waste: true,
      wasteAmount: "0.1 mL",
      wasteWitness: "Test Witness, RN",
      productIssue: true,
      productIssueDetail: "Packaging damaged before use.",
      productIssueAction: "Used a verified replacement package.",
      productIssueRecipient: "Test Provider",
      productIssueNotificationTime: "2026-08-07T17:40",
      productIssueDirection: "Administer the replacement after verification.",
      productIssueNextStep: "Pharmacy notified.",
    };
    const note = compareNote(encounter);
    expect(note.plan).toContain(encounter.response.custom);
    expect(note.plan).toContain("0.1 mL");
    expect(note.plan).toContain("Amoako, Samuel, PMHNP");
    expect(note.plan).not.toContain("tolerated well");
  });

  it.each(["held", "escalated", "provider"] as const)(
    "preserves the non-administration note for %s",
    (kind) => {
      const encounter = baseEncounter();
      encounter.disposition = {
        kind,
        provider: "Test Provider",
        time: "2026-08-07T17:40",
        outcome: "Held pending provider review of recent symptoms.",
      };
      const note = compareNote(encounter);
      expect(note.plan).toContain("medication not administered".toUpperCase());
      expect(note.plan).not.toContain("Administration:");
    },
  );

  it("preserves all paired injection sites, times and product traceability", () => {
    const encounter: InjectionEncounter = {
      ...baseEncounter(),
      medicationKey: "maintena",
      dose: "400 mg",
      reason: "initiation",
      priorDoseDate: "",
      secondAdministrationTime: "17:53",
      initiation: {
        ...emptyInjectionInitiation(),
        protocol: "maintena-1day",
        planVerified: true,
        oralStatus: "administered",
        second: {
          productKey: "maintena",
          dose: "400 mg",
          site: "R deltoid",
          ndc: "22222-2222-22",
          lot: "SECOND-LOT",
          expiration: "2027-11",
          given: true,
          orderVerified: true,
        },
      },
    };
    const note = compareNote(encounter);
    expect(note.plan).toContain("Component 2");
    expect(note.plan).toContain("R deltoid");
    expect(note.plan).toContain("SECOND-LOT");
  });

  it("preserves an explicit next-date override and its provider authority", () => {
    const encounter = baseEncounter();
    encounter.nextDoseDate = "2026-09-11";
    encounter.details = {
      ...encounter.details,
      nextDose: {
        value: "2026-09-11",
        source: "manual",
        calculatedFrom: "2026-08-07|q4wk",
        overrideKind: "provider-direction",
        overrideProvider: "Test Provider",
        overrideReason: "Return per revised active order.",
        recordedAt: "2026-08-07T18:00:00.000Z",
      },
    };
    const note = compareNote(encounter);
    expect(note.plan).toContain("Next dose due 9/11/26.");
    expect(note.plan).toContain("Test Provider");
    expect(note.plan).toContain("Return per revised active order.");
  });

  it("preserves the stale-review suppression rather than charting changed facts", () => {
    const encounter = baseEncounter();
    encounter.disposition = {
      kind: "administered",
      reviewedBy: "Test MA",
      reviewedAt: "2026-08-07T18:00:00.000Z",
      reviewFingerprint: injectionAdministrationReviewFingerprint(encounter),
    };
    encounter.dose = "234 mg";
    const evaluation = InjectionEngine.evaluate(encounter, {
      today: "2026-08-07",
    });
    const sourceEvaluation = originalEngine.InjectionEngine.evaluate(
      encounter,
      {
        today: "2026-08-07",
      },
    );
    expect(
      injectionEncounterToDocumentationInput(encounter, evaluation),
    ).toBeNull();
    expect(
      originalAdapter.injectionEncounterToDocumentationInput(
        encounter,
        sourceEvaluation,
      ),
    ).toBeNull();
  });

  it.each(protocols)(
    "preserves the extracted pure initiation mapping for %s",
    (protocol) => {
      const snapshot = {
        protocol,
        planVerified: true,
        oralStatus: "verified",
        providerNote: "Provider-directed active order verified.",
        sustennaOrder: "mild",
        day1Date: "2026-07-31",
        second: {
          dose: "400 mg",
          site: "R deltoid",
          ndc: "22222-2222-22",
          lot: "SECOND-LOT",
          exp: "2027-11",
          given: true,
          orderVerified: true,
          note: "Separate injection per active order.",
        },
      };
      expect(
        mapLegacyInitiationProtocol(
          snapshot,
          "Abilify Maintena",
          "2026-08-07",
          "17:53",
        ),
      ).toEqual(
        originalInitiation.mapLegacyInitiationProtocol(
          snapshot,
          "Abilify Maintena",
          "2026-08-07",
          "17:53",
        ),
      );
    },
  );
});

describe("original workstation AVS content and baseline rendering parity", () => {
  // This tests the source port, not clinical clearance. The console adapter
  // separately corrects audited source caveats without changing this baseline.
  it.each(Object.values(INJECTION_MEDICATIONS))(
    "preserves every patient instruction for $key",
    (medication) => {
      compareAvs(
        baseAvs({
          medicationKey: medication.key,
          medicationName: medication.label,
          genericName: medication.generic,
          dose: medication.doses[0] ?? "",
          intervalKey: medication.intervalKey,
          site: medication.defaultSite,
          route: medication.route,
        }),
      );
    },
  );

  it.each(protocols)(
    "preserves the full original %s AVS",
    (initiationProtocol) => {
      compareAvs(
        baseAvs({
          reason: "initiation",
          initiationProtocol,
          day1Date: "2026-07-31",
          secondDose: "400 mg",
          secondSite: "R deltoid",
          secondLot: "SECOND-LOT",
          secondExpiration: "2027-11",
          secondGiven: true,
          oralStatus: "administered",
        }),
      );
    },
  );

  it.each(["", "held", "escalated", "provider"])(
    "preserves original explicit disposition semantics for '%s'",
    (dispositionKind) => compareAvs(baseAvs({ dispositionKind })),
  );

  it("preserves empty fields and escapes staff-entered HTML in the baseline renderer", () => {
    const input = baseAvs({
      patientName: '<img src=x onerror="alert(1)">',
      site: "",
      nextDoseDate: "",
      administrationTime: "",
      medicationKey: "other",
      medicationName: "Other <medicine>",
    });
    compareAvs(input);
    expect(buildInjectionAvsHtml(input)).not.toContain("<img src=x");
    expect(buildInjectionAvsHtml(input)).toContain("&lt;medicine&gt;");
  });
});
