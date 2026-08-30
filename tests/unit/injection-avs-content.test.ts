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
import {
  buildInjectionAvsHtml,
  DEFAULT_AVS_CHROME,
  partitionInjectionAvsBlocks,
  renderInjectionAvsHtml,
  requiresInjectionAvsContinuation,
  selectInjectionAvsLayout,
} from "../../src/domain/injection-avs-render";

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
    expect(model.leadAlerts.some((a) => a.heading.includes("Call before you come in"))).toBe(true);
  });
});

describe("due-date framing", () => {
  it("names the exact day and never prints a come-any-day range", () => {
    const model = buildInjectionAvsModel(base());
    expect(model.nextDose.dateLong).toBe("Wednesday, September 2, 2026");
    expect(model.nextDose.instruction).toBe(
      "Due date - call us to schedule or reschedule",
    );
    const text = allText(base());
    expect(text).not.toMatch(/any day from/i);
    expect(text).not.toMatch(/come in between/i);
  });

  it("still offers the call path so a patient who cannot attend does not just skip", () => {
    const text = allText(base());
    expect(text).toContain("not a scheduled appointment");
    expect(text).toContain("schedule or change your visit");
    expect(text).toContain("(909) 887-6222");
  });

  it("degrades to a scheduling prompt when no next date exists", () => {
    const model = buildInjectionAvsModel(base({ nextDoseDate: "" }));
    expect(model.nextDose.dateLong).toBe("");
    expect(model.nextDose.instruction).toBe("Call to schedule your next injection");
    expect(model.nextDose.notes.join(" ")).toContain("has not been scheduled");
  });
});

describe("initiation protocols", () => {
  it("builds the Sustenna day-1 two-dose starting series", () => {
    const model = buildInjectionAvsModel(
      base({ dose: "234 mg", reason: "initiation", initiationProtocol: "sustenna-day1" }),
    );
    expect(model.documentSubtitle).toBe("Starting series - dose 1 of 2");
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
    expect(text).toContain("Keep taking your oral medication for 14 days");
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
    expect(text).toContain("for 21 days");
    // Aug 5 + 20 days = Aug 25.
    expect(text).toContain("Tuesday, August 25, 2026");
  });

  it("tells a day-8 patient the starting series is finished", () => {
    const text = allText(
      base({ reason: "initiation", initiationProtocol: "sustenna-day8", dose: "156 mg" }),
    );
    expect(text).toContain("finished the starting series");
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
    expect(first?.heading).toContain("opioid tolerance");
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
    const callBlock = vivitrol.blocks.find((b) => b.kind === "call-clinic");
    const items = callBlock?.items ?? [];
    // Vivitrol keeps its own two specific site lines and drops the generic one.
    expect(items.some((i) => /rash at the injection site gets worse/i.test(i))).toBe(false);
    expect(items.some((i) => /dark scab/i.test(i))).toBe(true);
    expect(items.some((i) => /not getting better after two weeks/i.test(i))).toBe(true);

    // A medication without its own site wording still gets the generic line.
    const sustenna = buildInjectionAvsModel(base());
    const sustennaCall = sustenna.blocks.find((b) => b.kind === "call-clinic");
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
    expect(text).toContain("Call 911 now");
  });
});

describe("rendered sheet", () => {
  it("emits the semantic clinical-document structure the print stylesheet targets", () => {
    const html = buildInjectionAvsHtml(base(), { runStamp: "08/05/26 1024" });
    for (const hook of [
      "avs2-run",
      "avs2-title",
      "avs2-id",
      "avs2-page-primary",
      "avs2-next",
      "avs2-date",
      "avs2-sec",
      "avs2-alert-bar",
      "avs2-foot",
    ]) {
      expect(html).toContain(hook);
    }
    expect(html).toContain('<article class="avs2');
    expect(html).toContain('<header class="avs2-run">');
    expect(html).toContain('<h1 class="avs2-title" id="avs-document-title">');
    expect(html).toContain('<section class="avs2-overview"');
    expect(html).toContain('<ol class="avs2-spine" aria-label="Treatment timeline">');
    expect(html).toContain("Invega Sustenna, 156 mg");
    expect(html).toContain("IPMG - SAN BERNARDINO");
    expect(html).toContain("(909) 887-6222");
    expect(html).toContain("Printed 08/05/26 1024");
    expect(html).not.toContain("END OF DOCUMENT");
    expect(html).not.toContain("RUN&nbsp;");
  });

  it("uses one deterministic page for routine care and two for initiation", () => {
    const routine = buildInjectionAvsHtml(
      base({ medicationKey: "other", medicationName: "Other", genericName: "" }),
    );
    const initiation = buildInjectionAvsHtml(
      base({ initiationProtocol: "sustenna-day1", reason: "Initiation" }),
    );
    expect(routine.match(/class="avs2-page /g)).toHaveLength(1);
    expect(initiation.match(/class="avs2-page /g)).toHaveLength(2);
    expect(initiation).toContain("After Visit Summary - Continued");
  });

  it("uses an identified continuation page when Vivitrol safety copy cannot fit safely", () => {
    const vivitrol = buildInjectionAvsHtml(
      base({
        medicationKey: "vivitrol",
        medicationName: "Vivitrol",
        genericName: "naltrexone ER",
        dose: "380 mg",
        intervalKey: "q4wk",
        site: "R ventrogluteal",
      }),
    );

    expect(vivitrol.match(/class="avs2-page /g)).toHaveLength(2);
    expect(vivitrol).toContain("Important: opioid tolerance and overdose risk");
    expect(vivitrol).toContain("Call before you come in");
    expect(vivitrol).toContain("After Visit Summary - Continued");
    expect(vivitrol).toContain("Page 1 of 2");
    expect(vivitrol).toContain("Page 2 of 2");
  });

  it("moves content-rich routine guidance to an identified continuation before print layout", () => {
    const input = base({
      medicationKey: "asimtufii",
      medicationName: "Abilify Asimtufii",
      genericName: "aripiprazole",
      dose: "720 mg",
      intervalKey: "q8wk",
      site: "L ventrogluteal",
      nextDoseDate: "2026-10-13",
    });
    const model = buildInjectionAvsModel(input);
    const html = buildInjectionAvsHtml(input);

    expect(requiresInjectionAvsContinuation(model)).toBe(true);
    expect(html.match(/class="avs2-page /g)).toHaveLength(2);
    expect(html).toContain("After Visit Summary - Continued");
    expect(html).toContain("Page 1 of 2");
    expect(html).toContain("Page 2 of 2");
    expect(html).not.toContain("Page 1 of 1");
  });

  it("selects and partitions all three layout variants without dropping guidance", () => {
    const shortRoutine = buildInjectionAvsModel(
      base({ medicationKey: "other", medicationName: "Other", genericName: "" }),
    );
    const longRoutine = buildInjectionAvsModel(
      base({ medicationKey: "asimtufii", medicationName: "Abilify Asimtufii" }),
    );
    const initiation = buildInjectionAvsModel(
      base({ initiationProtocol: "sustenna-day1", reason: "initiation" }),
    );
    const coldChainRoutine = buildInjectionAvsModel(
      base({
        medicationKey: "uzedy",
        medicationName: "Uzedy",
        genericName: "risperidone ER",
        dose: "250 mg",
        intervalKey: "q8wk",
        route: "SubQ",
        site: "L upper arm (SubQ)",
      }),
    );

    expect(selectInjectionAvsLayout(shortRoutine)).toBe("routine-one-page");
    expect(selectInjectionAvsLayout(longRoutine)).toBe("routine-two-page");
    expect(selectInjectionAvsLayout(initiation)).toBe("complex-two-page");
    expect(selectInjectionAvsLayout(coldChainRoutine)).toBe("complex-two-page");
    expect(
      partitionInjectionAvsBlocks(
        coldChainRoutine,
        selectInjectionAvsLayout(coldChainRoutine),
      ).primary,
    ).toEqual([]);

    for (const model of [shortRoutine, longRoutine, initiation, coldChainRoutine]) {
      const layout = selectInjectionAvsLayout(model);
      const pages = partitionInjectionAvsBlocks(model, layout);
      const original = [...model.blocks, model.emergency];
      expect([...pages.primary, ...pages.continuation]).toHaveLength(original.length);
      expect(new Set([...pages.primary, ...pages.continuation])).toEqual(new Set(original));
    }
  });

  it("renders guidance in explicit semantic rows without duplicating a block", () => {
    const model = buildInjectionAvsModel(
      base({
        medicationKey: "uzedy",
        medicationName: "Uzedy",
        genericName: "risperidone ER",
        dose: "250 mg",
        intervalKey: "q8wk",
        route: "SubQ",
        site: "L upper arm (SubQ)",
      }),
    );
    const html = renderInjectionAvsHtml(model, DEFAULT_AVS_CHROME);

    expect(html).toContain('class="avs2-guidance-row"');
    for (const block of [...model.blocks, model.emergency]) {
      expect(html.split(block.heading)).toHaveLength(2);
    }
  });

  it("uses stable section kinds rather than patient-facing copy for rendering", () => {
    const model = buildInjectionAvsModel(base());
    expect(model.blocks.map((block) => block.kind)).toEqual([
      "timing",
      "site-care",
      "expected-effects",
      "call-clinic",
    ]);
    expect(model.emergency.kind).toBe("emergency");

    const renamed = {
      ...model,
      blocks: model.blocks.map((block, index) =>
        index === 0 ? { ...block, heading: "A completely revised timing label" } : block,
      ),
    };
    const html = renderInjectionAvsHtml(renamed, DEFAULT_AVS_CHROME);
    expect(html).toContain('class="avs2-sec avs2-sec-timing"');
    expect(html).toContain('id="avs-timing-guidance-1"');
    expect(html).not.toContain('id="avs-timing-a-completely-revised-timing-label"');
  });

  it("labels previews and released copies without changing clinical content", () => {
    const preview = buildInjectionAvsModel(base({ dispositionKind: "" }));
    const patient = buildInjectionAvsModel(base({ dispositionKind: "administered" }));
    expect(preview.documentStatus).toBe("STAFF PREVIEW - NOT FINAL");
    expect(patient.documentStatus).toBe("PATIENT COPY");
  });

  it("forces STAFF PREVIEW - NOT FINAL for every disposition when previewMode is set, never PATIENT COPY or CARE HANDOFF", () => {
    for (const dispositionKind of ["administered", "held", "escalated", "provider"]) {
      const model = buildInjectionAvsModel(base({ dispositionKind, previewMode: true }));
      expect(model.documentStatus).toBe("STAFF PREVIEW - NOT FINAL");
    }
    // previewMode is independent of the subtitle/body wording, which still
    // reflects the real disposition.
    const heldPreview = buildInjectionAvsModel(base({ dispositionKind: "held", previewMode: true }));
    expect(heldPreview.documentSubtitle).toBe("Injection not given today");
  });

  it("keeps response off the patient AVS and names administering staff only once", () => {
    const html = buildInjectionAvsHtml(base({ responseLabel: "Tolerated well" }));
    expect(html).not.toContain("Tolerated well");
    expect(html.match(/Chen, M\. LVN/g)).toHaveLength(1);
  });

  it("labels the injection-site graphic accessibly and omits it when no injection was given", () => {
    const administered = buildInjectionAvsHtml(base({ dispositionKind: "administered" }));
    const held = buildInjectionAvsHtml(base({ dispositionKind: "held" }));
    expect(administered).toContain('class="avs2-site-marker"');
    expect(administered).toContain(
      'aria-label="Injection site: Right deltoid (upper arm), intramuscular"',
    );
    expect(held).not.toContain('class="avs2-site-marker"');
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
    expect(html).toContain("After Visit Summary");
    expect(html).toContain("Call to schedule your next injection");
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
    expect(due.detail.join(" ")).toContain("has not been scheduled");
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
