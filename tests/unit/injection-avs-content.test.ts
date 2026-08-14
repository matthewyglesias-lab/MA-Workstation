import { describe, expect, it } from "vitest";
import {
  buildInjectionAvsModel,
  describeSite,
  doseNote,
  formatExpiration,
  formatLongDate,
  formatShortDate,
  requiresColdChainCall,
  siteRegion,
  type AvsTimelineStep,
  type InjectionAvsInput,
} from "../../src/domain/injection-avs-content";
import { buildInjectionAvsHtml } from "../../src/domain/injection-avs-render";

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

const allText = (input: InjectionAvsInput): string => {
  const model = buildInjectionAvsModel(input);
  const chunks: string[] = [
    model.documentTitle,
    model.documentSubtitle,
    model.nextDose.heading,
    model.nextDose.instruction,
    ...model.nextDose.notes,
    model.scheduleNote,
    model.administrationNote,
  ];
  for (const block of [...model.leadAlerts, ...model.blocks, model.emergency]) {
    chunks.push(block.heading, ...(block.paragraphs ?? []), ...(block.items ?? []));
  }
  for (const row of [...model.identity, ...model.administration]) {
    chunks.push(row.label, row.value);
  }
  return chunks.join("\n");
};

describe("AVS formatting helpers", () => {
  it("formats the long date without drifting across timezones", () => {
    expect(formatLongDate("2026-09-02")).toBe("Wednesday, September 2, 2026");
    expect(formatLongDate("2026-01-01")).toBe("Thursday, January 1, 2026");
  });

  it("returns empty rather than a broken date for unusable input", () => {
    expect(formatLongDate("")).toBe("");
    expect(formatLongDate("not-a-date")).toBe("");
    expect(formatShortDate("2026-13-40")).toBe("");
  });

  it("renders a month-precision expiration the way a carton reads", () => {
    expect(formatExpiration("2027-11")).toBe("11/2027");
    expect(formatExpiration("see carton")).toBe("see carton");
  });
});

describe("site handling", () => {
  it("maps documented site strings onto aftercare regions", () => {
    expect(siteRegion("R deltoid")).toBe("deltoid");
    expect(siteRegion("L ventrogluteal")).toBe("ventrogluteal");
    expect(siteRegion("R dorsogluteal")).toBe("dorsogluteal");
    expect(siteRegion("Abdomen LUQ (SubQ)")).toBe("abdomen");
    expect(siteRegion("R upper arm (SubQ)")).toBe("upper-arm");
    expect(siteRegion("")).toBe("unspecified");
  });

  it("describes the site in words a patient would use", () => {
    expect(describeSite("R deltoid", "IM")).toBe("Right deltoid (upper arm), intramuscular");
    expect(describeSite("L ventrogluteal", "IM")).toBe("Left hip (ventrogluteal), intramuscular");
    expect(describeSite("Abdomen LUQ (SubQ)", "SubQ")).toBe("Left upper abdomen, subcutaneous");
  });

  it("gives gluteal sites different aftercare than deltoid sites", () => {
    const deltoid = allText(base({ site: "R deltoid" }));
    const gluteal = allText(base({ site: "R ventrogluteal" }));
    expect(deltoid).toContain("heavy lifting");
    expect(gluteal).toContain("sit or walk");
    expect(gluteal).not.toContain("heavy lifting");
  });

  it("gives subcutaneous sites their own aftercare", () => {
    const text = allText(
      base({ medicationKey: "uzedy", route: "SubQ", site: "Abdomen RUQ (SubQ)" }),
    );
    expect(text).toContain("Do not rub or scratch");
    expect(text).toContain("tattooed");
  });
});

describe("dose-specific notes", () => {
  it("flags starting-only strengths", () => {
    expect(doseNote("sustenna", "234 mg", "q4wk")).toContain("starting dose");
    expect(doseNote("erzofri", "351 mg", "q4wk")).toContain("first-day starting dose");
    expect(doseNote("initio", "675 mg", "once")).toContain("one-time");
  });

  it("disambiguates Uzedy strengths that exist on both schedules", () => {
    expect(doseNote("uzedy", "100 mg", "q4wk")).toContain("monthly schedule");
    expect(doseNote("uzedy", "100 mg", "q8wk")).toContain("every-2-month schedule");
  });

  it("explains the higher Uzedy strengths as every-2-month schedules", () => {
    expect(doseNote("uzedy", "150 mg", "q8wk")).toContain("every 2 months");
    expect(doseNote("uzedy", "200 mg", "q8wk")).toContain("every 2 months");
    expect(doseNote("uzedy", "250 mg", "q8wk")).toContain("every 2 months");
  });

  it("disambiguates the Aristada strength that spans two intervals", () => {
    expect(doseNote("aristada", "882 mg", "q4wk")).toContain("monthly");
    expect(doseNote("aristada", "882 mg", "q6wk")).toContain("every 6 weeks");
  });

  it("explains the 1064 mg Aristada schedule and site", () => {
    const note = doseNote("aristada", "1064 mg", "q8wk");
    expect(note).toContain("every 2 months");
    expect(note).toContain("gluteal muscle");
  });

  it("says nothing for an ordinary maintenance strength", () => {
    expect(doseNote("sustenna", "156 mg", "q4wk")).toBe("");
  });
});

describe("cold chain", () => {
  it("only asks patients to call ahead for refrigerated products", () => {
    expect(requiresColdChainCall("uzedy")).toBe(true);
    expect(requiresColdChainCall("vivitrol")).toBe(true);
    expect(requiresColdChainCall("sustenna")).toBe(false);
    expect(requiresColdChainCall("maintena")).toBe(false);
  });

  it("adds a call-ahead banner and shifts the date wording", () => {
    const model = buildInjectionAvsModel(base({ medicationKey: "uzedy", route: "SubQ" }));
    expect(model.nextDose.firmness).toBe("call-first");
    expect(model.leadAlerts.some((a) => a.heading.includes("CALL BEFORE YOU COME IN"))).toBe(true);
  });
});

describe("due-date framing", () => {
  it("names the exact day and never prints a come-any-day range", () => {
    const model = buildInjectionAvsModel(base());
    expect(model.nextDose.dateLong).toBe("Wednesday, September 2, 2026");
    expect(model.nextDose.instruction).toBe("PLEASE COME IN ON THIS DAY");
    const text = allText(base());
    expect(text).not.toMatch(/any day from/i);
    expect(text).not.toMatch(/come in between/i);
  });

  it("still offers the call path so a patient who cannot attend does not just skip", () => {
    const text = allText(base());
    expect(text).toContain("call us before it");
    expect(text).toContain("(909) 887-6222");
  });

  it("degrades to a scheduling prompt when no next date exists", () => {
    const model = buildInjectionAvsModel(base({ nextDoseDate: "" }));
    expect(model.nextDose.dateLong).toBe("");
    expect(model.nextDose.instruction).toBe("NOT YET SCHEDULED");
    expect(model.nextDose.notes.join(" ")).toContain("has not been scheduled");
  });
});

describe("initiation protocols", () => {
  it("builds the Sustenna day-1 two-dose starting series", () => {
    const model = buildInjectionAvsModel(
      base({ dose: "234 mg", reason: "initiation", initiationProtocol: "sustenna-day1" }),
    );
    expect(model.documentSubtitle).toBe("STARTING SERIES - DOSE 1 OF 2");
    expect(model.nextDose.firmness).toBe("firm");
    expect(model.schedule).toHaveLength(2);
    // Day 8 is exactly one week after the documented administration date.
    expect(model.schedule[1]?.date).toBe("08/12/2026");
    expect(model.schedule[1]?.due).toBe(true);
    const text = allText(
      base({ dose: "234 mg", reason: "initiation", initiationProtocol: "sustenna-day1" }),
    );
    expect(text).toContain("very little room to move");
    expect(text).toContain("would not count");
  });

  it("shows the Day 8 return date in the action box, not the monthly projection", () => {
    // The encounter still carries the ordinary monthly next-dose date. Printing
    // that under a "come back for your second injection" banner would send the
    // patient back weeks after the dose was actually due.
    const model = buildInjectionAvsModel(
      base({
        dose: "234 mg",
        reason: "initiation",
        initiationProtocol: "sustenna-day1",
        administrationDate: "2026-08-05",
        nextDoseDate: "2026-09-02",
      }),
    );
    expect(model.nextDose.dateLong).toBe("Wednesday, August 12, 2026");
    expect(model.nextDose.dateLong).not.toContain("September");
    // The action box and the schedule table must agree.
    expect(model.schedule[1]?.date).toBe("08/12/2026");
  });

  it("computes the oral-overlap end date rather than saying '14 days'", () => {
    const text = allText(
      base({
        medicationKey: "maintena",
        medicationName: "Abilify Maintena",
        reason: "initiation",
        initiationProtocol: "maintena-14day",
      }),
    );
    // 14 consecutive days counting the administration date: Aug 5 -> Aug 18.
    expect(text).toContain("Tuesday, August 18, 2026");
    expect(text).toContain("KEEP TAKING YOUR ORAL MEDICATION FOR 14 DAYS");
  });

  it("uses 21 days for the Aristada oral pathway", () => {
    const text = allText(
      base({
        medicationKey: "aristada",
        medicationName: "Aristada",
        reason: "initiation",
        initiationProtocol: "aristada-21day",
      }),
    );
    expect(text).toContain("FOR 21 DAYS");
    // Aug 5 + 20 days = Aug 25.
    expect(text).toContain("Tuesday, August 25, 2026");
  });

  it("tells a day-8 patient the starting series is finished", () => {
    const text = allText(
      base({ reason: "initiation", initiationProtocol: "sustenna-day8", dose: "156 mg" }),
    );
    expect(text).toContain("FINISHED THE STARTING SERIES");
    expect(text).toContain("second of your two starting injections");
  });

  it("does not invent a starting series for a routine encounter", () => {
    const model = buildInjectionAvsModel(base());
    expect(model.schedule).toHaveLength(0);
    expect(model.documentSubtitle).toBe("");
  });
});

describe("medication-specific safety", () => {
  it("leads the Vivitrol sheet with the opioid-tolerance warning", () => {
    const model = buildInjectionAvsModel(
      base({
        medicationKey: "vivitrol",
        medicationName: "Vivitrol",
        genericName: "naltrexone ER",
        dose: "380 mg",
        site: "R ventrogluteal",
      }),
    );
    const first = model.leadAlerts[0];
    expect(first?.heading).toContain("OPIOID TOLERANCE");
    const text = allText(
      base({ medicationKey: "vivitrol", medicationName: "Vivitrol", site: "R ventrogluteal" }),
    );
    expect(text).toContain("LOWER than it was before you started");
    expect(text).toContain("naloxone");
    expect(text).toContain("give naloxone and call 911");
    // Label-driven site-reaction escalation.
    expect(text).toContain("dark scab");
    expect(text).toContain("not getting better after two weeks");
  });

  it("does not stack a generic site warning on top of a product-specific one", () => {
    const vivitrol = buildInjectionAvsModel(
      base({ medicationKey: "vivitrol", medicationName: "Vivitrol", site: "R ventrogluteal" }),
    );
    const callBlock = vivitrol.blocks.find((b) => b.heading.startsWith("CALL THE CLINIC"));
    const items = callBlock?.items ?? [];
    // Vivitrol keeps its own two specific site lines and drops the generic one.
    expect(items.some((i) => /rash at the injection site gets worse/i.test(i))).toBe(false);
    expect(items.some((i) => /dark scab/i.test(i))).toBe(true);
    expect(items.some((i) => /not getting better after two weeks/i.test(i))).toBe(true);

    // A medication without its own site wording still gets the generic line.
    const sustenna = buildInjectionAvsModel(base());
    const sustennaCall = sustenna.blocks.find((b) => b.heading.startsWith("CALL THE CLINIC"));
    expect(
      (sustennaCall?.items ?? []).some((i) => /rash at the injection site gets worse/i.test(i)),
    ).toBe(true);
  });

  it("gives each medication its own reason for keeping the date", () => {
    const sustenna = allText(base());
    const hafyera = allText(
      base({ medicationKey: "hafyera", medicationName: "Invega Hafyera", intervalKey: "q26wk" }),
    );
    const vivitrol = allText(
      base({ medicationKey: "vivitrol", medicationName: "Vivitrol", site: "R ventrogluteal" }),
    );
    expect(sustenna).toContain("released slowly out of the muscle");
    expect(hafyera).toContain("6-month injection");
    expect(vivitrol).toContain("opioid-blocking effect fades");
    expect(hafyera).not.toContain("opioid-blocking");
  });

  it("falls back to safe generic wording for an uncatalogued medication", () => {
    const text = allText(
      base({ medicationKey: "other", medicationName: "Compounded LAI", genericName: "" }),
    );
    expect(text).toContain("long-acting injection");
    expect(text).toContain("EMERGENCY");
  });
});

describe("rendered sheet", () => {
  it("emits the lab-report structure the print stylesheet targets", () => {
    const html = buildInjectionAvsHtml(base(), { runStamp: "08/05/26 1024" });
    for (const hook of [
      "avs2-run",
      "avs2-title",
      "avs2-id",
      "avs2-next",
      "avs2-date",
      "avs2-sec",
      "avs2-alert-bar",
      "avs2-foot",
    ]) {
      expect(html).toContain(hook);
    }
    expect(html).toContain("IPMG - SAN BERNARDINO");
    expect(html).toContain("(909) 887-6222");
    expect(html).toContain("END OF DOCUMENT");
  });

  it("escapes documented values instead of trusting them as markup", () => {
    const html = buildInjectionAvsHtml(base({ patientName: '<img src=x onerror="alert(1)">' }));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("still produces a sheet when almost nothing is documented", () => {
    const html = buildInjectionAvsHtml(
      base({
        medicationKey: "",
        medicationName: "",
        genericName: "",
        dose: "",
        site: "",
        nextDoseDate: "",
        lot: "",
        expiration: "",
        administrationTime: "",
        responseLabel: "",
      }),
    );
    expect(html).toContain("AFTER VISIT SUMMARY");
    expect(html).toContain("NOT YET SCHEDULED");
  });
});

describe("printed timeline", () => {
  const timeline = (overrides: Partial<InjectionAvsInput> = {}) =>
    buildInjectionAvsModel(base(overrides)).timeline;

  const states = (overrides: Partial<InjectionAvsInput> = {}) =>
    timeline(overrides).map((step) => step.state);

  /** Indexing a timeline should fail the test loudly, not throw on undefined. */
  const at = (steps: readonly AvsTimelineStep[], index: number) => {
    const step = steps[index];
    expect(step, `expected a timeline step at index ${index}`).toBeDefined();
    return step as AvsTimelineStep;
  };

  const withState = (
    steps: readonly AvsTimelineStep[],
    state: AvsTimelineStep["state"],
  ) => {
    const step = steps.find((candidate) => candidate.state === state);
    expect(step, `expected a "${state}" timeline step`).toBeDefined();
    return step as AvsTimelineStep;
  };

  it("opens every encounter with what was actually given today", () => {
    const first = at(timeline(), 0);
    expect(first.state).toBe("given");
    expect(first.whenNote).toBe("Today");
    expect(first.when).toBe("Aug 5");
    // Brand and strength headline it; the generic name supports rather than
    // dilutes the one line the sheet most wants read.
    expect(first.title).toBe("Invega Sustenna, 156 mg");
    expect(first.detail.join(" ")).toContain("paliperidone palmitate");
    expect(first.detail.join(" ")).toContain("Lot INV-4471");
  });

  it("reduces a routine dose to just what was given and what is next", () => {
    expect(states()).toEqual(["given", "due"]);
    const due = at(timeline(), 1);
    expect(due.when).toBe("Sep 2");
    expect(due.whenNote).toBe("Next");
    expect(due.title).toBe("Your next injection");
  });

  it("carries the Sustenna day-1 start through to its ongoing schedule", () => {
    const steps = timeline({
      reason: "initiation",
      initiationProtocol: "sustenna-day1",
      dose: "234 mg",
    });
    expect(steps.map((s) => s.state)).toEqual(["given", "due", "ongoing"]);
    // The due step targets day 8, not the monthly projection.
    expect(at(steps, 1).when).toBe("Aug 12");
    expect(at(steps, 1).title).toBe(
      "Come back for your second starting injection",
    );
    expect(at(steps, 2).when).toBe("");
    expect(at(steps, 2).whenNote).toBe("Ongoing");
  });

  it("puts the oral-overlap countdown on the timeline as its own dated step", () => {
    const steps = timeline({
      medicationKey: "maintena",
      medicationName: "Abilify Maintena",
      genericName: "aripiprazole",
      dose: "400 mg",
      reason: "initiation",
      initiationProtocol: "maintena-14day",
    });
    expect(steps.map((s) => s.state)).toEqual(["given", "action", "due"]);

    const oral = at(steps, 1);
    expect(oral.title).toBe("Keep taking your oral medication");
    // 14 days counting today, so the last day is 13 days after 08/05.
    expect(oral.when).toBe("Aug 18");
    expect(oral.whenNote).toBe("Through");
    expect(oral.detail.join(" ")).toContain("14 days in a row");
    // The step stays terse: the gutter already carries the last day and the
    // alert block carries the reasoning, so neither is restated here.
    expect(oral.detail.join(" ")).not.toContain("(909) 887-6222");
    expect(oral.detail).toHaveLength(1);
  });

  it("uses the full 21-day window for the Aristada oral overlap", () => {
    const steps = timeline({
      medicationKey: "aristada",
      medicationName: "Aristada",
      dose: "441 mg",
      site: "R ventrogluteal",
      reason: "initiation",
      initiationProtocol: "aristada-21day",
    });
    const oral = withState(steps, "action");
    expect(oral.when).toBe("Aug 25");
    expect(oral.detail.join(" ")).toContain("21 days in a row");
  });

  it("degrades a provider-directed start to an undated next step", () => {
    const steps = timeline({
      medicationKey: "aristada",
      medicationName: "Aristada",
      reason: "initiation",
      initiationProtocol: "aristada-provider",
      nextDoseDate: "",
    });
    const due = withState(steps, "due");
    expect(due.when).toBe("");
    expect(due.whenNote).toBe("");
    expect(due.title).toBe("Your next dose, as your provider directed");
    expect(due.detail.join(" ")).toContain("has not been scheduled yet");
  });

  it("still produces a usable timeline when nothing is documented", () => {
    const steps = timeline({
      medicationName: "",
      genericName: "",
      dose: "",
      site: "",
      lot: "",
      expiration: "",
      responseLabel: "",
      nextDoseDate: "",
    });
    expect(steps.map((s) => s.state)).toEqual(["given", "due"]);
    expect(at(steps, 0).title).toBe("Injection given");
    expect(at(steps, 1).when).toBe("");
  });

  it("gives initiation encounters strictly more steps than a routine dose", () => {
    const routine = timeline().length;
    for (const protocol of [
      "sustenna-day1",
      "maintena-14day",
      "asimtufii-14day",
      "aristada-21day",
    ]) {
      expect(
        timeline({ reason: "initiation", initiationProtocol: protocol }).length,
        `${protocol} should out-step a routine dose`,
      ).toBeGreaterThan(routine);
    }
  });

  it("never emits a step without a title", () => {
    for (const protocol of [
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
    ]) {
      for (const step of timeline({ initiationProtocol: protocol })) {
        expect(step.title.trim(), `${protocol || "routine"} step title`)
          .not.toBe("");
      }
    }
  });
});
