import { describe, expect, it } from "vitest";
import {
  buildInjectionAvsModel,
  formatGutterDate,
  type AvsTimelineStep,
  type InjectionAvsInput,
} from "../../src/domain/injection-avs-content";
import { buildInjectionAvsHtml } from "../../src/domain/injection-avs-render";

/**
 * Combinatorial stress coverage for the printed After Visit Summary.
 *
 * The scenario tests in injection-avs-content.test.ts prove specific wording.
 * This file proves the *invariants* hold across every medication, every
 * initiation protocol, and both administered and non-administered dispositions
 * - the combinations no one renders by hand and where a regression would
 * otherwise reach a patient handout unnoticed.
 */

const base = (overrides: Partial<InjectionAvsInput> = {}): InjectionAvsInput => ({
  patientName: "Rivera, Ana M",
  patientDob: "1988-06-11",
  recordNumber: "INJ-1785900",
  orderingProvider: "Osei, K. MD",
  administeredBy: "Chen, M. LVN",
  medicationKey: "sustenna",
  medicationName: "Invega Sustenna",
  genericName: "paliperidone palmitate",
  dose: "156 mg",
  route: "IM",
  site: "R deltoid",
  intervalKey: "q4wk",
  administrationDate: "2026-08-05",
  administrationTime: "10:20",
  nextDoseDate: "2026-09-02",
  lot: "INV-4471",
  expiration: "2027-11",
  responseLabel: "Tolerated well",
  reason: "scheduled",
  initiationProtocol: "",
  day1Date: "",
  clinicPhone: "(909) 887-6222",
  ...overrides,
});

/** Every catalogued medication, plus the uncatalogued fallback path. */
const MEDICATIONS: ReadonlyArray<Partial<InjectionAvsInput>> = [
  { medicationKey: "sustenna", medicationName: "Invega Sustenna", intervalKey: "q4wk" },
  { medicationKey: "erzofri", medicationName: "Erzofri", intervalKey: "q4wk" },
  { medicationKey: "trinza", medicationName: "Invega Trinza", intervalKey: "q12wk" },
  { medicationKey: "hafyera", medicationName: "Invega Hafyera", intervalKey: "q26wk" },
  { medicationKey: "maintena", medicationName: "Abilify Maintena", intervalKey: "q4wk" },
  { medicationKey: "asimtufii", medicationName: "Abilify Asimtufii", intervalKey: "q8wk", site: "R ventrogluteal" },
  { medicationKey: "aristada", medicationName: "Aristada", intervalKey: "q4wk", site: "R ventrogluteal" },
  { medicationKey: "initio", medicationName: "Aristada Initio", intervalKey: "q4wk", site: "R ventrogluteal" },
  { medicationKey: "uzedy", medicationName: "Uzedy", route: "SubQ", site: "Abdomen LUQ", intervalKey: "q4wk" },
  { medicationKey: "vivitrol", medicationName: "Vivitrol", route: "IM", site: "R ventrogluteal", intervalKey: "q4wk" },
  { medicationKey: "haldol", medicationName: "Haldol Decanoate", intervalKey: "q4wk" },
  { medicationKey: "prolixin", medicationName: "Prolixin Decanoate", intervalKey: "q4wk" },
  { medicationKey: "other", medicationName: "Compounded LAI", genericName: "", intervalKey: "q4wk" },
];

const PROTOCOLS = [
  "",
  "sustenna-day1",
  "sustenna-day8",
  "aristada-initio-sameday",
  "aristada-21day",
  "maintena-14day",
  "asimtufii-14day",
  "maintena-1day",
  "asimtufii-1day",
  "sustenna-provider",
  "maintena-provider",
  "aristada-provider",
] as const;

const NOT_GIVEN_KINDS = ["held", "escalated", "provider"] as const;

const allText = (input: InjectionAvsInput): string => {
  const model = buildInjectionAvsModel(input);
  return JSON.stringify(model);
};

const stepText = (step: AvsTimelineStep) =>
  [step.title, step.dateLong ?? "", ...step.detail].join(" ");

describe("AVS stress: every medication x every protocol", () => {
  const combinations = MEDICATIONS.flatMap((medication) =>
    PROTOCOLS.map((protocol) => ({
      label: `${medication.medicationKey}/${protocol || "routine"}`,
      input: base({
        ...medication,
        reason: protocol ? "initiation" : "scheduled",
        initiationProtocol: protocol,
      }),
    })),
  );

  it("covers a meaningful matrix", () => {
    expect(combinations.length).toBe(MEDICATIONS.length * PROTOCOLS.length);
  });

  it("never emits a timeline step without a title", () => {
    for (const { label, input } of combinations) {
      for (const step of buildInjectionAvsModel(input).timeline) {
        expect(step.title.trim(), `${label} produced a titleless step`).not.toBe("");
      }
    }
  });

  it("always opens with the visit and closes with something due", () => {
    for (const { label, input } of combinations) {
      const { timeline } = buildInjectionAvsModel(input);
      expect(timeline.length, `${label} produced no timeline`).toBeGreaterThan(1);
      expect(["given", "action"], label).toContain(timeline[0]?.state);
      expect(
        timeline.some((step) => step.state === "due"),
        `${label} never tells the patient what is next`,
      ).toBe(true);
    }
  });

  it("never pins a step to a point in time without a date beside it", () => {
    // "Ongoing" is the one qualifier that is legitimately dateless - it names a
    // pattern rather than a day, and prints against an em-dash gutter. The
    // others all assert a specific point in time and must have the date to
    // match.
    const DATED_QUALIFIERS = ["Today", "Next", "Through"];
    for (const { label, input } of combinations) {
      for (const step of buildInjectionAvsModel(input).timeline) {
        if (!step.when) {
          expect(
            DATED_QUALIFIERS,
            `${label} claimed "${step.whenNote}" with no date`,
          ).not.toContain(step.whenNote);
        }
      }
    }
  });

  it("always renders an escaped, non-empty sheet", () => {
    for (const { label, input } of combinations) {
      const html = buildInjectionAvsHtml(input, { runStamp: "08/05/26 1024" });
      expect(html, label).toContain("AFTER VISIT SUMMARY");
      expect(html, label).toContain("END OF DOCUMENT");
      // The record run is what the print-parity canonicaliser anchors on; if
      // this markup moves, tests/e2e/print-regression.spec.js goes silently
      // non-deterministic rather than red.
      expect(html, label).toContain('<span class="avs2-id-k">RECORD NO</span>');
    }
  });
});

describe("AVS stress: nothing was given", () => {
  const notGivenCombos = MEDICATIONS.flatMap((medication) =>
    NOT_GIVEN_KINDS.map((kind) => ({
      label: `${medication.medicationKey}/${kind}`,
      input: base({ ...medication, dispositionKind: kind }),
    })),
  );

  it("never claims a dose was received", () => {
    for (const { label, input } of notGivenCombos) {
      const model = buildInjectionAvsModel(input);
      const first = model.timeline[0];
      expect(first?.state, label).toBe("action");
      expect(first?.title, label).toBe("This injection was not given today");
      expect(model.documentSubtitle, label).toBe("INJECTION NOT GIVEN TODAY");
    }
  });

  it("never prints product traceability for a dose that was not administered", () => {
    for (const { label, input } of notGivenCombos) {
      const text = allText(input);
      expect(text, `${label} leaked a lot number`).not.toContain("INV-4471");
      expect(text, `${label} leaked an expiry`).not.toContain("11/2027");
      expect(text, `${label} leaked a response`).not.toContain("Tolerated well");
    }
  });

  it("drops aftercare and what-to-expect, which presume an injection", () => {
    for (const { label, input } of notGivenCombos) {
      const headings = buildInjectionAvsModel(input).blocks.map((b) => b.heading);
      expect(headings, label).not.toContain("CARING FOR THE INJECTION SITE");
      expect(headings, label).not.toContain("WHAT TO EXPECT");
    }
  });

  it("drops alerts that assert a consequence of having been dosed", () => {
    // Vivitrol's lead alert says opioid tolerance "is now much LOWER". Printing
    // that after a held encounter would be actively dangerous.
    const vivitrol = buildInjectionAvsModel(
      base({
        medicationKey: "vivitrol",
        medicationName: "Vivitrol",
        site: "R ventrogluteal",
        dispositionKind: "held",
      }),
    );
    const headings = vivitrol.leadAlerts.map((block) => block.heading);
    expect(headings.join(" ")).not.toContain("OPIOID TOLERANCE");
    // The cold-chain call-ahead is about the *next* visit, so it survives.
    expect(headings.join(" ")).toContain("CALL BEFORE YOU COME IN");
  });

  it("drops the oral-overlap countdown, which counts from an injection", () => {
    const model = buildInjectionAvsModel(
      base({
        medicationKey: "maintena",
        medicationName: "Abilify Maintena",
        reason: "initiation",
        initiationProtocol: "maintena-14day",
        dispositionKind: "held",
      }),
    );
    expect(model.timeline.some((step) => step.whenNote === "Through")).toBe(false);
    expect(JSON.stringify(model)).not.toContain("KEEP TAKING YOUR ORAL");
  });

  it("still tells the patient when to return and when to get help", () => {
    for (const { label, input } of notGivenCombos) {
      const model = buildInjectionAvsModel(input);
      expect(
        model.timeline.some((step) => step.state === "due"),
        `${label} left the patient with no return plan`,
      ).toBe(true);
      expect(model.emergency.items?.length, label).toBeGreaterThan(0);
      expect(model.nextDose.contactLines.length, label).toBeGreaterThan(0);
    }
  });

  it("treats an undecided disposition exactly like an administered one", () => {
    // The AVS gate deliberately allows printing before a disposition is chosen.
    // If an empty kind ever started neutralising, that preview would break.
    const undecided = buildInjectionAvsModel(base({ dispositionKind: "" }));
    const administered = buildInjectionAvsModel(
      base({ dispositionKind: "administered" }),
    );
    expect(JSON.stringify(undecided)).toBe(JSON.stringify(administered));
    expect(undecided.timeline[0]?.state).toBe("given");
  });
});

describe("AVS stress: dates", () => {
  it("keeps the year whenever it differs from the visit year", () => {
    // Hafyera is dosed q26wk and Trinza q12wk, so their next dose routinely
    // lands in the following calendar year. A bare "Feb 3" would be ambiguous
    // on the one date the whole sheet exists to communicate.
    const hafyera = buildInjectionAvsModel(
      base({
        medicationKey: "hafyera",
        medicationName: "Invega Hafyera",
        intervalKey: "q26wk",
        administrationDate: "2026-08-05",
        nextDoseDate: "2027-02-03",
      }),
    );
    const due = hafyera.timeline.find((step) => step.state === "due");
    expect(due?.when).toBe("Feb 3, 2027");
    // ...and the body still carries the authoritative weekday-and-year form.
    expect(due?.dateLong).toBe("Wednesday, February 3, 2027");
  });

  it("drops the year only when it matches the visit year", () => {
    expect(formatGutterDate("2026-09-02", "2026-08-05")).toBe("Sep 2");
    expect(formatGutterDate("2027-02-03", "2026-08-05")).toBe("Feb 3, 2027");
    // With nothing to compare against, keep the year rather than guess.
    expect(formatGutterDate("2026-09-02", "")).toBe("Sep 2, 2026");
    expect(formatGutterDate("", "2026-08-05")).toBe("");
  });

  it("does not invent a date when none is documented", () => {
    const model = buildInjectionAvsModel(
      base({ administrationDate: "", nextDoseDate: "" }),
    );
    for (const step of model.timeline) {
      if (!step.when) expect(step.whenNote).toBe("");
    }
    const due = model.timeline.find((step) => step.state === "due");
    expect(due?.when).toBe("");
    expect(due?.dateLong).toBe("");
  });

  it("survives a next dose recorded before the administration date", () => {
    // A data-entry inversion should still produce a readable sheet rather than
    // a crash or a blank date; the clinical evaluator owns rejecting it.
    const model = buildInjectionAvsModel(
      base({ administrationDate: "2026-08-05", nextDoseDate: "2026-07-01" }),
    );
    const due = model.timeline.find((step) => step.state === "due");
    expect(due?.when).toBe("Jul 1");
    expect(due?.dateLong).toBe("Wednesday, July 1, 2026");
    expect(buildInjectionAvsHtml(model as never)).toBeTypeOf("string");
  });

  it("rejects malformed dates without throwing", () => {
    for (const bad of ["nonsense", "2026-13-01", "2026-00-10", "26-08-05", "--"]) {
      expect(formatGutterDate(bad, "2026-08-05")).toBe("");
      const model = buildInjectionAvsModel(base({ administrationDate: bad }));
      expect(model.timeline[0]?.when).toBe("");
      expect(model.timeline[0]?.whenNote).toBe("");
    }
  });
});

describe("AVS stress: paired injections", () => {
  const paired = (overrides: Partial<InjectionAvsInput> = {}) =>
    buildInjectionAvsModel(
      base({
        medicationKey: "maintena",
        medicationName: "Abilify Maintena",
        genericName: "aripiprazole",
        dose: "400 mg",
        site: "R deltoid",
        reason: "initiation",
        initiationProtocol: "maintena-1day",
        secondDose: "300 mg",
        secondSite: "L ventrogluteal",
        secondGiven: true,
        oralStatus: "administered",
        ...overrides,
      }),
    );

  it("names the second injection and its site", () => {
    const given = paired().timeline[0];
    expect(given?.state).toBe("given");
    const text = stepText(given as AvsTimelineStep);
    expect(text).toContain("Second injection: 300 mg");
    expect(text).toContain("hip (ventrogluteal)");
    expect(text).toContain("An oral dose was also given today.");
  });

  it("covers aftercare for both sites, without duplicating shared lines", () => {
    const care = paired().blocks.find(
      (block) => block.heading === "CARING FOR THE INJECTION SITE",
    );
    const lines = care?.paragraphs ?? [];
    expect(lines.join(" ")).toContain("arm");
    expect(lines.join(" ")).toContain("hip");
    expect(new Set(lines).size).toBe(lines.length);
    // The two regions' lists overlap in wording without being byte-identical
    // ("Do not rub or massage the site" appears with and without a trailing
    // explanation), so the patient must not be told the same thing twice.
    const openings = lines.map((line) =>
      line.split(/[.]|\s-\s/)[0]!.trim().toLowerCase(),
    );
    expect(new Set(openings).size).toBe(openings.length);
    expect(
      lines.filter((line) => /do not rub or massage/i.test(line)),
    ).toHaveLength(1);
  });

  it("says nothing about a second injection that was not marked given", () => {
    for (const partial of [
      { secondGiven: false },
      { secondDose: "" },
      { secondSite: "" },
    ]) {
      const text = stepText(paired(partial).timeline[0] as AvsTimelineStep);
      expect(text, JSON.stringify(partial)).not.toContain("Second injection");
    }
  });

  it("does not claim an oral dose that was only verified, not given", () => {
    const text = stepText(paired({ oralStatus: "verified" }).timeline[0] as AvsTimelineStep);
    expect(text).not.toContain("oral dose was also given");
  });

  it("says nothing about either when the encounter was held", () => {
    const text = JSON.stringify(paired({ dispositionKind: "held" }));
    expect(text).not.toContain("Second injection");
    expect(text).not.toContain("oral dose was also given");
  });
});

describe("AVS stress: overflow and hostile input", () => {
  it("escapes markup in every free-text field", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const html = buildInjectionAvsHtml(
      base({
        patientName: hostile,
        medicationName: hostile,
        orderingProvider: hostile,
        administeredBy: hostile,
        site: hostile,
        lot: hostile,
        recordNumber: hostile,
      }),
    );
    // The payload must never survive intact. "onerror=" on its own still
    // appears inside the escaped text, which is inert - what matters is that no
    // tag or attribute context is ever created from user input.
    expect(html).not.toContain(hostile);
    expect(html).not.toContain("<img");
    expect(html).not.toContain('="alert(1)"');
    expect(html).toContain("&lt;img");
  });

  it("renders extreme-length values without dropping structure", () => {
    const long = "A".repeat(400);
    const html = buildInjectionAvsHtml(
      base({
        patientName: long,
        medicationName: long,
        dose: long,
        site: long,
        orderingProvider: long,
      }),
    );
    expect(html).toContain("AFTER VISIT SUMMARY");
    expect(html).toContain("END OF DOCUMENT");
    expect(html).toContain('<span class="avs2-id-k">RECORD NO</span>');
  });

  it("produces a sheet when every optional field is blank", () => {
    const html = buildInjectionAvsHtml({
      patientName: "",
      patientDob: "",
      recordNumber: "",
      orderingProvider: "",
      administeredBy: "",
      medicationKey: "",
      medicationName: "",
      genericName: "",
      dose: "",
      route: "",
      site: "",
      intervalKey: "",
      administrationDate: "",
      administrationTime: "",
      nextDoseDate: "",
      lot: "",
      expiration: "",
      responseLabel: "",
      reason: "",
      initiationProtocol: "",
      day1Date: "",
      clinicPhone: "(909) 887-6222",
    });
    expect(html).toContain("AFTER VISIT SUMMARY");
    expect(html).toContain("Injection given");
    expect(html).toContain("END OF DOCUMENT");
  });
});
