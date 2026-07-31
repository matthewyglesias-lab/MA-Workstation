import { describe, expect, it } from "vitest";

import {
  InjectionEngine,
  UDS_PANELS,
  UdsEngine,
  emptyInjectionEncounter,
  emptyInjectionInitiation,
  emptyUdsEncounter,
  type InjectionEncounter,
  type InjectionInitiationProtocol,
  type InjectionMedicationKey,
  type UdsEncounter,
} from "../../src/domain";
import { formatInjectionDocumentation } from "../../src/documentation";

const requiredInjectionAttestations = {
  id2: true,
  rights: true,
  allergy: true,
  consent: true,
  screen: true,
  hygiene: true,
};

const pairedInjection = (
  medicationKey: InjectionMedicationKey,
  protocol: InjectionInitiationProtocol,
): InjectionEncounter => {
  const encounter: InjectionEncounter = {
    ...emptyInjectionEncounter(),
    patient: { name: "HARDENING, INJECTION", dob: "01/01/1990" },
    medicationKey,
    dose: "400 mg",
    route: "IM",
    site: "R deltoid",
    intervalKey: "q4wk",
    reason: "initiation",
    administrationDate: "2026-07-30",
    nextDoseDate: "2026-08-27",
    orderingProvider: "Safety Provider",
    administeredBy: "Safety MA",
    administrationTime: "09:15",
    secondAdministrationTime: "09:18",
    allergies: "NKDA verified in active record",
    traceability: {
      ndc: "11111-1111-11",
      lot: "PRIMARY-LOT",
      expiration: "2027-12",
    },
    response: { kind: "well" },
    attestations: requiredInjectionAttestations,
    verifications: { resuspend: true },
    acuteSafetyScreenConfirmed: true,
    disposition: { kind: "administered" },
    initiation: {
      ...emptyInjectionInitiation(),
      protocol,
      planVerified: true,
      oralStatus: "administered",
      second: {
        productKey: "maintena",
        dose: "400 mg",
        site: "L deltoid",
        ndc: "22222-2222-22",
        lot: "SECOND-LOT",
        expiration: "2027-11",
        given: true,
        orderVerified: true,
      },
    },
  };

  if (medicationKey === "asimtufii") {
    encounter.dose = "960 mg";
    encounter.site = "R ventrogluteal";
    encounter.intervalKey = "q8wk";
    encounter.nextDoseDate = "2026-09-24";
    encounter.verifications = {
      resuspend: true,
      aripiprazoleTolerability: true,
      glutealOnly: true,
      noMassage: true,
    };
  } else if (medicationKey === "aristada") {
    encounter.dose = "882 mg";
    encounter.site = "R ventrogluteal";
    encounter.initiation!.second.productKey = "initio";
    encounter.initiation!.second.dose = "675 mg";
  } else if (medicationKey === "initio") {
    encounter.dose = "675 mg";
    encounter.intervalKey = "once";
    encounter.nextDoseDate = "";
    encounter.initiation!.second.productKey = "aristada";
    encounter.initiation!.second.dose = "882 mg";
    encounter.initiation!.second.site = "L ventrogluteal";
  }

  return encounter;
};

const stopCodes = (
  result: ReturnType<typeof InjectionEngine.evaluate>,
): string[] => result.stops.map((entry) => entry.code);

describe("paired aripiprazole component-2 hardening", () => {
  it.each([
    ["maintena", "maintena-1day"],
    ["asimtufii", "asimtufii-1day"],
    ["aristada", "aristada-initio-sameday"],
    ["initio", "aristada-initio-sameday"],
  ] as const)(
    "accepts the cataloged product, dose, and site for %s",
    (medicationKey, protocol) => {
      const result = InjectionEngine.evaluate(
        pairedInjection(medicationKey, protocol),
        { today: "2026-07-30" },
      );

      expect(stopCodes(result)).not.toEqual(
        expect.arrayContaining([
          "initiation.protocol.medication",
          "initiation.second.product",
          "initiation.second.dose-guidance",
          "initiation.second.site-guidance",
          "initiation.second.expired",
        ]),
      );
    },
  );

  it("blocks expired component-2 stock independently of the primary product", () => {
    const encounter = pairedInjection("maintena", "maintena-1day");
    encounter.initiation!.second.expiration = "2026-06";

    const result = InjectionEngine.evaluate(encounter, {
      today: "2026-07-30",
    });

    expect(stopCodes(result)).toContain("initiation.second.expired");
    expect(result.output.canFinalize).toBe(false);
  });

  it("rejects a paired protocol that does not match the primary product", () => {
    const encounter = pairedInjection("maintena", "maintena-1day");
    encounter.medicationKey = "sustenna";

    const result = InjectionEngine.evaluate(encounter, {
      today: "2026-07-30",
    });

    expect(stopCodes(result)).toContain("initiation.protocol.medication");
  });

  it("rejects an explicitly mismatched component-2 product", () => {
    const encounter = pairedInjection("asimtufii", "asimtufii-1day");
    encounter.initiation!.second.productKey = "asimtufii";

    const result = InjectionEngine.evaluate(encounter, {
      today: "2026-07-30",
    });

    expect(stopCodes(result)).toContain("initiation.second.product");
  });

  it("rejects a component-2 dose outside the expected product catalog", () => {
    const encounter = pairedInjection("maintena", "maintena-1day");
    encounter.initiation!.second.dose = "960 mg";

    const result = InjectionEngine.evaluate(encounter, {
      today: "2026-07-30",
    });

    expect(stopCodes(result)).toContain("initiation.second.dose-guidance");
  });

  it("rejects a cross-paired Maintena 1-day dose", () => {
    const encounter = pairedInjection("maintena", "maintena-1day");
    encounter.initiation!.second.dose = "300 mg";

    const result = InjectionEngine.evaluate(encounter, {
      today: "2026-07-30",
    });

    expect(stopCodes(result)).toContain("initiation.paired-dose-regimen");
  });

  it.each([
    ["960 mg", "300 mg"],
    ["720 mg", "400 mg"],
  ] as const)(
    "rejects a cross-paired Asimtufii 1-day regimen of %s + %s",
    (primaryDose, secondDose) => {
      const encounter = pairedInjection("asimtufii", "asimtufii-1day");
      encounter.dose = primaryDose;
      encounter.initiation!.second.dose = secondDose;

      const result = InjectionEngine.evaluate(encounter, {
        today: "2026-07-30",
      });

      expect(stopCodes(result)).toContain("initiation.paired-dose-regimen");
    },
  );

  it.each([
    ["maintena", "maintena-1day", "300 mg", "300 mg"],
    ["asimtufii", "asimtufii-1day", "720 mg", "300 mg"],
  ] as const)(
    "accepts the ordered adjusted %s paired pathway",
    (medicationKey, protocol, primaryDose, secondDose) => {
      const encounter = pairedInjection(medicationKey, protocol);
      encounter.dose = primaryDose;
      encounter.initiation!.second.dose = secondDose;

      const result = InjectionEngine.evaluate(encounter, {
        today: "2026-07-30",
      });

      expect(stopCodes(result)).not.toContain("initiation.paired-dose-regimen");
    },
  );

  it("applies the expected component-2 product's dose-specific site rule", () => {
    const encounter = pairedInjection("initio", "aristada-initio-sameday");
    encounter.initiation!.second.site = "L deltoid";

    const result = InjectionEngine.evaluate(encounter, {
      today: "2026-07-30",
    });

    expect(stopCodes(result)).toContain("initiation.second.site-guidance");
  });
});

const interpretableUds = (): UdsEncounter => ({
  ...emptyUdsEncounter(),
  patient: { name: "HARDENING, UDS", dob: "02/02/1991" },
  collectionDateTime: "2026-07-30T09:00",
  device: "SAFE life 14-Panel Cup",
  physicalReadingsVerified: true,
  lot: "UDS-HARDENING",
  expiration: "2027-06",
  collector: "Safety MA",
  temperature: "acceptable",
  control: "valid",
  validity: "acceptable",
  results: Object.fromEntries(
    UDS_PANELS.map((panel) => [panel, "neg"]),
  ) as UdsEncounter["results"],
});

describe("UDS interpretation validity", () => {
  it("allows interpretation only when the device and result validity inputs are verified", () => {
    const result = UdsEngine.evaluate(interpretableUds(), {
      today: "2026-07-30",
    });

    expect(result.output.interpretationAllowed).toBe(true);
  });

  it.each([
    [
      "expired device",
      (encounter: UdsEncounter) => {
        encounter.expiration = "2026-06";
      },
    ],
    [
      "undocumented expiration",
      (encounter: UdsEncounter) => {
        encounter.expiration = "";
      },
    ],
    [
      "invalid control",
      (encounter: UdsEncounter) => {
        encounter.control = "invalid";
      },
    ],
    [
      "unverified readings",
      (encounter: UdsEncounter) => {
        encounter.physicalReadingsVerified = false;
      },
    ],
    [
      "unverified custom profile",
      (encounter: UdsEncounter) => {
        encounter.device = "Other integrated cup";
        encounter.customPanelSetVerified = false;
      },
    ],
    [
      "incomplete 13-panel profile",
      (encounter: UdsEncounter) => {
        encounter.device = "SAFE life 13-Panel Cup";
        encounter.omittedPanel = "";
      },
    ],
    [
      "invalid panel",
      (encounter: UdsEncounter) => {
        encounter.results.THC = "invalid";
      },
    ],
    [
      "no tested panels",
      (encounter: UdsEncounter) => {
        encounter.results = Object.fromEntries(
          UDS_PANELS.map((panel) => [panel, "nt"]),
        ) as UdsEncounter["results"];
      },
    ],
    [
      "unacceptable temperature",
      (encounter: UdsEncounter) => {
        encounter.temperature = "not acceptable";
      },
    ],
    [
      "unverified validity markers",
      (encounter: UdsEncounter) => {
        encounter.validity = "needs review";
      },
    ],
  ] as const)(
    "disallows interpretation for %s",
    (_label, mutate) => {
      const encounter = interpretableUds();
      mutate(encounter);

      const result = UdsEngine.evaluate(encounter, {
        today: "2026-07-30",
      });

      expect(result.output.interpretationAllowed).toBe(false);
    },
  );

  it("keeps a valid preliminary positive interpretable while routing it to review", () => {
    const encounter = interpretableUds();
    encounter.results.THC = "pos";

    const result = UdsEngine.evaluate(encounter, {
      today: "2026-07-30",
    });

    expect(result.output.interpretationAllowed).toBe(true);
    expect(result.output.activityStatus).toBe("needs_review");
  });
});

describe("structured product-issue follow-up", () => {
  it("requires a started structured follow-up to retain each decision field", () => {
    const encounter = pairedInjection("maintena", "maintena-1day");
    encounter.details = {
      productIssue: true,
      productIssueDetail: "Syringe resistance noted.",
      productIssueAction: "Remaining product quarantined.",
      productIssueRecipient: "On-call clinician",
    };

    const partial = InjectionEngine.evaluate(encounter, {
      today: "2026-07-30",
    });
    expect(stopCodes(partial)).toEqual(
      expect.arrayContaining([
        "trace.product-issue-time",
        "trace.product-issue-direction",
        "trace.product-issue-next-step",
      ]),
    );

    encounter.details.productIssueNotificationTime = "2026-07-30T09:24";
    encounter.details.productIssueDirection = "Do not repeat the dose.";
    encounter.details.productIssueNextStep =
      "Provider will reassess after product review.";
    const complete = InjectionEngine.evaluate(encounter, {
      today: "2026-07-30",
    });
    expect(stopCodes(complete)).not.toEqual(
      expect.arrayContaining([
        "trace.product-issue-recipient",
        "trace.product-issue-time",
        "trace.product-issue-direction",
        "trace.product-issue-next-step",
      ]),
    );
  });

  it("formats recipient, time, direction, and next step inside the product-issue block", () => {
    const note = formatInjectionDocumentation({
      disposition: { kind: "administered" },
      components: [{ medication: "Abilify Maintena", dose: "400 mg" }],
      handling: {
        productIssue: "Syringe resistance noted.",
        productIssueAction: "Remaining product quarantined.",
        productIssueNotified: "B. Clinician, MD",
        productIssueNotificationTime: "Jul 30, 2026 at 9:24 AM",
        productIssueDirection: "Do not repeat the dose today.",
        productIssueNextStep:
          "Provider will reassess after product investigation.",
      },
    });

    expect(note.plan).toContain(
      [
        "PRODUCT / DEVICE ISSUE",
        "Issue: Syringe resistance noted.",
        "Action / disposition: Remaining product quarantined.",
        "Notification recipient: B. Clinician, MD",
        "Notification / decision time: Jul 30, 2026 at 9:24 AM",
        "Direction received: Do not repeat the dose today.",
        "Next step: Provider will reassess after product investigation.",
      ].join("\n"),
    );
  });
});
