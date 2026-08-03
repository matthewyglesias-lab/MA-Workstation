import { describe, expect, it } from "vitest";

import {
  applyUdsDeviceProfileDefaults,
  emptyUdsEncounter,
  UDS_PANELS,
  UdsEngine,
  type UdsEncounter,
} from "../../src/domain/uds";
import { udsEncounterToDocumentationInput } from "../../src/documentation/adapters/uds-from-encounter";
import { DocumentationEngine } from "../../src/documentation";

const baseEncounter = (): UdsEncounter => ({
  ...emptyUdsEncounter(),
  patient: { name: "Draft, Patient", dob: "01/02/1990" },
  collector: "Staff, MA",
  device: "SAFE life 14-Panel Cup",
  lot: "LOT-1",
  expiration: "2027-06",
  collectionDateTime: "2026-07-30T10:30",
});

describe("applyUdsDeviceProfileDefaults", () => {
  it("pre-fills every panel negative for the 14-panel cup and resets verification", () => {
    const encounter: UdsEncounter = {
      ...emptyUdsEncounter(),
      physicalReadingsVerified: true,
      device: "SAFE life 14-Panel Cup",
    };
    const next = applyUdsDeviceProfileDefaults(encounter);
    UDS_PANELS.forEach((panel) => expect(next.results[panel]).toBe("neg"));
    expect(next.physicalReadingsVerified).toBe(false);
  });

  it("pre-fills all but the omitted panel for the 13-panel cup", () => {
    const encounter: UdsEncounter = {
      ...emptyUdsEncounter(),
      device: "SAFE life 13-Panel Cup",
      omittedPanel: "THC",
    };
    const next = applyUdsDeviceProfileDefaults(encounter);
    expect(next.results.THC).toBe("nt");
    UDS_PANELS.filter((panel) => panel !== "THC").forEach((panel) =>
      expect(next.results[panel]).toBe("neg"),
    );
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
      temperature: "acceptable",
      control: "valid",
      results,
    };
    expect(ready({ ...other, physicalReadingsVerified: false }).stops.map((s) => s.code)).toContain(
      "device.readings",
    );
    expect(ready({ ...other, physicalReadingsVerified: true }).stops).toHaveLength(0);
  });
});
