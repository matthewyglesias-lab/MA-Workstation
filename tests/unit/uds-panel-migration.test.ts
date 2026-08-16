import { describe, expect, it } from "vitest";

import {
  applyUdsDeviceProfileDefaults,
  deriveUdsReportStatus,
  displayedUdsPanels,
  emptyUdsEncounter,
  nextUdsResultState,
  UDS_PANELS,
  UdsEngine,
  type UdsEncounter,
} from "../../src/domain/uds";
import { udsEncounterToDocumentationInput } from "../../src/documentation/adapters/uds-from-encounter";
import { DocumentationEngine } from "../../src/documentation";

const baseEncounter = (): UdsEncounter => ({
  ...emptyUdsEncounter(),
  patient: { name: "Draft, Patient", dob: "01/02/1990" },
  reason: "routine",
  collector: "Staff, MA",
  device: "SAFE life 14-Panel Cup",
  lot: "LOT-1",
  expiration: "2027-06",
  collectionDateTime: "2026-07-30T10:30",
});

describe("applyUdsDeviceProfileDefaults", () => {
  it("leaves every 14-panel result neutral and resets device QC", () => {
    const encounter: UdsEncounter = {
      ...emptyUdsEncounter(),
      physicalReadingsVerified: true,
      device: "SAFE life 14-Panel Cup",
    };
    const next = applyUdsDeviceProfileDefaults(encounter);
    UDS_PANELS.forEach((panel) => expect(next.results[panel]).toBe("nt"));
    expect(next.physicalReadingsVerified).toBe(false);
    expect(next.control).toBe("not documented");
    expect(next.validity).toBe("not documented");
  });

  it("leaves every 13-panel result neutral even after the omitted panel is chosen", () => {
    const encounter: UdsEncounter = {
      ...emptyUdsEncounter(),
      device: "SAFE life 13-Panel Cup",
      omittedPanel: "THC",
    };
    const next = applyUdsDeviceProfileDefaults(encounter);
    UDS_PANELS.forEach((panel) => expect(next.results[panel]).toBe("nt"));
  });

  it("leaves every panel not-tested for the 13-panel cup until an omitted panel is chosen", () => {
    const encounter: UdsEncounter = {
      ...emptyUdsEncounter(),
      device: "SAFE life 13-Panel Cup",
      omittedPanel: "",
    };
    const next = applyUdsDeviceProfileDefaults(encounter);
    UDS_PANELS.forEach((panel) => expect(next.results[panel]).toBe("nt"));
  });

  it("leaves every panel not-tested for an unrecognized/custom device", () => {
    const encounter: UdsEncounter = {
      ...emptyUdsEncounter(),
      device: "Other point-of-care UDS cup",
    };
    const next = applyUdsDeviceProfileDefaults(encounter);
    UDS_PANELS.forEach((panel) => expect(next.results[panel]).toBe("nt"));
  });
});

describe("udsEncounterToDocumentationInput", () => {
  it("returns null for an encounter with nothing documented yet", () => {
    expect(udsEncounterToDocumentationInput(emptyUdsEncounter())).toBeNull();
  });

  it("maps a verified, fully-documented encounter into the documentation input shape", () => {
    const encounter: UdsEncounter = {
      ...baseEncounter(),
      physicalReadingsVerified: true,
      control: "valid",
      results: {
        ...Object.fromEntries(UDS_PANELS.map((panel) => [panel, "neg"])),
        THC: "pos",
      } as UdsEncounter["results"],
    };

    const input = udsEncounterToDocumentationInput(encounter);
    expect(input).not.toBeNull();
    expect(input!.patient).toBe("Draft, Patient");
    expect(input!.dob).toBe("01/02/1990");
    expect(input!.collection?.reason).toBe("Routine monitoring");
    expect(input!.collection?.specimen).toBe("Urine");
    expect(input!.collection?.device).toBe("SAFE life 14-Panel Cup");
    expect(input!.controlReview?.control).toBe("Valid control line");
    expect(input!.resultGroups?.[0]?.results).toContainEqual({
      analyte: "Cannabinoids / THC",
      result: "Preliminary positive",
    });
    expect(input!.clinicianAttention).toContain(
      "Cannabinoids / THC preliminary positive requires provider review.",
    );
    expect(input!.plan).toContain(
      "Route preliminary positive finding(s) for clinician review in clinical context.",
    );

    const note = DocumentationEngine.format("uds", input!);
    expect(note.text).toBeTruthy();
  });

  it("omits verification-gated fields (results, control, validity, specimen) until readings are verified", () => {
    const encounter: UdsEncounter = {
      ...baseEncounter(),
      physicalReadingsVerified: false,
      results: { THC: "pos" },
    };
    const input = udsEncounterToDocumentationInput(encounter);
    expect(input).not.toBeNull();
    expect(input!.resultGroups).toBeUndefined();
    expect(input!.controlReview).toBeUndefined();
    expect(input!.collection?.specimen).toBeUndefined();
    expect(input!.collection?.temperature).toBeUndefined();
    expect(input!.collection?.collectedAt).toBeUndefined();
  });

  it("flags an invalid control line for clinician attention regardless of individual panel results", () => {
    const encounter: UdsEncounter = {
      ...baseEncounter(),
      physicalReadingsVerified: true,
      control: "invalid",
    };
    const input = udsEncounterToDocumentationInput(encounter);
    expect(input!.clinicianAttention).toContain(
      "Invalid / missing control; do not interpret the screening result.",
    );
    expect(input!.plan).toContain(
      "Do not interpret; repeat collection or use outside laboratory confirmation per provider direction.",
    );
  });

  it("omits the outside-lab plan when it's still the default placeholder", () => {
    const deferred = udsEncounterToDocumentationInput(baseEncounter());
    expect(deferred!.outsideLabPlan).toBeUndefined();

    const decided = udsEncounterToDocumentationInput({
      ...baseEncounter(),
      labPlan: "ordered",
    });
    expect(decided!.outsideLabPlan).toBe("ordered");
  });
});

describe("UdsEngine device-profile gating", () => {
  const ready = (encounter: UdsEncounter) =>
    UdsEngine.evaluate(encounter, { today: "2026-08-03" });

  it("clears every stop for a 13-panel cup when the omitted analyte stays not-tested", () => {
    const results = Object.fromEntries(
      UDS_PANELS.map((panel) => [panel, panel === "PPX" ? "nt" : "neg"]),
    ) as UdsEncounter["results"];
    const evaluation = ready({
      ...baseEncounter(),
      device: "SAFE life 13-Panel Cup",
      omittedPanel: "PPX",
      physicalReadingsVerified: true,
      temperature: "acceptable",
      control: "valid",
      validity: "acceptable",
      medicationAlignment: "no unexpected",
      results,
    });
    expect(evaluation.stops).toHaveLength(0);
  });

  it("stops when a result is recorded against the analyte the 13-panel cup omits", () => {
    // The panel's bulk actions ("All tested negative", "THC positive · rest
    // negative") must skip the omitted analyte or they create this stop on
    // the operator's behalf, one click into the encounter.
    const results = Object.fromEntries(
      UDS_PANELS.map((panel) => [panel, "neg"]),
    ) as UdsEncounter["results"];
    const evaluation = ready({
      ...baseEncounter(),
      device: "SAFE life 13-Panel Cup",
      omittedPanel: "PPX",
      physicalReadingsVerified: true,
      temperature: "acceptable",
      control: "valid",
      validity: "acceptable",
      medicationAlignment: "no unexpected",
      results,
    });
    expect(evaluation.stops.map((stop) => stop.code)).toContain("device.13.omitted-result");
  });

  it("requires the readings confirmation for an uncatalogued device, not just the 13/14 cups", () => {
    // The engine gates every named device on this flag. The panel therefore
    // has to render the control for every named device too - rendering it
    // only for 13/14 left "Other point-of-care UDS cup" unfinishable.
    const results = Object.fromEntries(
      UDS_PANELS.map((panel) => [panel, "neg"]),
    ) as UdsEncounter["results"];
    const other: UdsEncounter = {
      ...baseEncounter(),
      device: "Other point-of-care UDS cup",
      customPanelSetVerified: true,
      customDeviceName: "Clinic 14-panel cup",
      customPanels: [...UDS_PANELS],
      temperature: "acceptable",
      control: "valid",
      validity: "acceptable",
      medicationAlignment: "no unexpected",
      results,
    };
    expect(ready({ ...other, physicalReadingsVerified: false }).stops.map((s) => s.code)).toContain(
      "device.readings",
    );
    expect(ready({ ...other, physicalReadingsVerified: true }).stops).toHaveLength(0);
  });

  it("does not normalize an impossible local collection date into documentation", () => {
    const input = udsEncounterToDocumentationInput({
      ...baseEncounter(),
      collectionDateTime: "2026-02-30T10:30",
      physicalReadingsVerified: true,
    });
    expect(input?.collection?.collectedAt).toBeUndefined();
  });
});

describe("physical device panel sequence", () => {
  it("preserves the exact custom top-to-bottom panel order", () => {
    const encounter = {
      ...emptyUdsEncounter(),
      device: "Other point-of-care UDS cup",
      customDeviceName: "Clinic five-panel card",
      customPanels: ["THC", "COC", "BZO", "OXY", "BUP"],
    } satisfies UdsEncounter;
    expect(displayedUdsPanels(encounter)).toEqual(["THC", "COC", "BZO", "OXY", "BUP"]);
  });

  it("fails closed when a result exists outside the documented custom device", () => {
    const encounter = {
      ...baseEncounter(),
      device: "Other point-of-care UDS cup",
      customDeviceName: "Clinic two-panel card",
      customPanels: ["THC", "COC"],
      physicalReadingsVerified: true,
      temperature: "acceptable",
      control: "valid",
      validity: "acceptable",
      medicationAlignment: "no unexpected",
      results: { ...emptyUdsEncounter().results, THC: "neg", COC: "neg", BZO: "pos" },
    } satisfies UdsEncounter;
    const evaluation = UdsEngine.evaluate(encounter, { today: "2026-08-03" });
    expect(evaluation.stops.map((stop) => stop.code)).toContain("results.outside-profile");
    expect(evaluation.output.testedCount).toBe(2);
    expect(evaluation.output.preliminaryPositive).not.toContain("BZO");
  });
});

describe("intentional UDS entry states", () => {
  it("starts every safety-relevant default as not documented", () => {
    const encounter = emptyUdsEncounter();
    expect(encounter.reason).toBe("");
    expect(encounter.temperature).toBe("not documented");
    expect(encounter.control).toBe("not documented");
    expect(encounter.validity).toBe("not documented");
    expect(encounter.medicationAlignment).toBe("");
    expect(Object.values(encounter.results).every((result) => result === "nt")).toBe(true);
  });

  it("requires an explicit encounter type once UDS documentation starts", () => {
    const encounter = { ...baseEncounter(), reason: "" as const };
    const evaluation = UdsEngine.evaluate(encounter, { today: "2026-08-03" });
    expect(evaluation.stops.map((stop) => stop.code)).toContain("reason.required");
  });

  it("projects untouched fields as pending context while encounter type stays explicitly required", () => {
    const evaluation = UdsEngine.evaluate(emptyUdsEncounter(), { today: "2026-08-03" });
    expect(evaluation.output.requirements.reason?.state).toBe("required");
    expect(evaluation.output.requirements["patient.name"]?.state).toBe("pending");
    expect(evaluation.output.requirements.device?.state).toBe("pending");
    expect(evaluation.output.requirements.medicationAlignment?.state).toBe("pending");
    expect(evaluation.output.requirements.devicePhoto?.state).toBe("optional");
  });

  it("uses encounter type as the context-setting action for the remaining requirements", () => {
    const evaluation = UdsEngine.evaluate(
      { ...emptyUdsEncounter(), reason: "routine" },
      { today: "2026-08-03" },
    );
    expect(evaluation.readiness).toBe("blocked");
    expect(evaluation.output.requirements["patient.name"]?.state).toBe("required");
    expect(evaluation.output.requirements.collectionDateTime?.state).toBe("required");
    expect(evaluation.output.requirements.medicationAlignment?.state).toBe("required");
  });

  it("projects conditional device fields without making irrelevant fields loud", () => {
    const thirteenPanel = UdsEngine.evaluate(
      { ...baseEncounter(), device: "SAFE life 13-Panel Cup" },
      { today: "2026-08-03" },
    );
    expect(thirteenPanel.output.requirements.omittedPanel?.state).toBe("required");
    expect(thirteenPanel.output.requirements.customDeviceName?.state).toBe("hidden");

    const custom = UdsEngine.evaluate(
      { ...baseEncounter(), device: "Clinic-approved other" },
      { today: "2026-08-03" },
    );
    expect(custom.output.requirements.omittedPanel?.state).toBe("hidden");
    expect(custom.output.requirements.customDeviceName?.state).toBe("required");
    expect(custom.output.requirements.customPanels?.state).toBe("required");
  });

  it("cycles a result through NT, NEG, POS, INV, and back to NT", () => {
    expect(nextUdsResultState("nt")).toBe("neg");
    expect(nextUdsResultState("neg")).toBe("pos");
    expect(nextUdsResultState("pos")).toBe("invalid");
    expect(nextUdsResultState("invalid")).toBe("nt");
  });

  it("derives the preliminary all-negative report status only after explicit review", () => {
    const encounter: UdsEncounter = {
      ...baseEncounter(),
      physicalReadingsVerified: true,
      temperature: "acceptable",
      control: "valid",
      validity: "acceptable",
      medicationAlignment: "no unexpected",
      results: Object.fromEntries(UDS_PANELS.map((panel) => [panel, "neg"])),
    };
    const evaluation = UdsEngine.evaluate(encounter, { today: "2026-08-03" });
    expect(deriveUdsReportStatus(encounter, evaluation).label).toBe(
      "PRELIMINARY — ALL NEGATIVE",
    );
  });

  it("uses a STOP marker, rather than a second pending label, for an incomplete report", () => {
    const encounter: UdsEncounter = { ...baseEncounter(), medicationAlignment: "" };
    const evaluation = UdsEngine.evaluate(encounter, { today: "2026-08-03" });

    expect(deriveUdsReportStatus(encounter, evaluation)).toMatchObject({
      state: "incomplete",
      label: "INCOMPLETE",
      marker: "STOP",
    });
  });
});
