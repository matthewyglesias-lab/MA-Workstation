import { describe, expect, it } from "vitest";

import {
  injectionTimingDayFlag,
  injectionTimingTone,
  injectionTimingVerdict,
} from "../../src/presentation/workflows/injection/timing-register";
import {
  projectClinicalReadiness,
  summarizeReadinessVerdict,
} from "../../src/application/readiness-projection";
import { InjectionEngine, emptyInjectionEncounter } from "../../src/domain";
import type { InjectionEncounter, InjectionTimingEvaluation } from "../../src/domain/injection";
import type { WorkstationReadinessItem } from "../../src/application/workstation-projection";

const timing = (partial: Partial<InjectionTimingEvaluation>): InjectionTimingEvaluation => ({
  state: "idle",
  daysSincePrior: null,
  earliestDay: null,
  latestDay: null,
  late: false,
  message: "",
  ...partial,
});

const item = (
  state: WorkstationReadinessItem["state"],
  id: string = state,
): WorkstationReadinessItem => ({ id, label: id, state });

describe("injection timing verdict", () => {
  it("names each engine state without inventing a clearance", () => {
    expect(injectionTimingVerdict(timing({ state: "ok" }))).toBe("ON SCHEDULE");
    expect(injectionTimingVerdict(timing({ state: "stop" }))).toBe("CHECK DATES");
    expect(injectionTimingVerdict(timing({ state: "idle" }))).toBe("NOT EVALUATED");
  });

  // The verdict is about cadence only. Anything that could be read as
  // permission to inject would be a claim the timing engine never made.
  it("never says a dose is safe, cleared, or approved", () => {
    const forbidden = /\b(SAFE|CLEAR|APPROVED|OK TO|PROCEED)\b/;
    const states: InjectionTimingEvaluation[] = [
      timing({ state: "ok" }),
      timing({ state: "stop" }),
      timing({ state: "idle" }),
      timing({ state: "warning", late: true }),
      timing({ state: "warning", daysSincePrior: 10, earliestDay: 21, latestDay: 35 }),
      timing({ state: "warning" }),
    ];
    for (const value of states) {
      expect(injectionTimingVerdict(value)).not.toMatch(forbidden);
    }
  });

  it("separates an overdue warning from an early one", () => {
    expect(injectionTimingVerdict(timing({ state: "warning", late: true }))).toBe("OVERDUE");
    expect(
      injectionTimingVerdict(
        timing({ state: "warning", daysSincePrior: 15, earliestDay: 21, latestDay: 35 }),
      ),
    ).toBe("EARLY");
  });

  // `late` is the engine's own conclusion; a day count that merely looks late
  // must not override it, or the two would disagree on the same screen.
  it("prefers the engine's late flag over the day arithmetic", () => {
    expect(
      injectionTimingVerdict(
        timing({ state: "warning", late: true, daysSincePrior: 5, earliestDay: 21, latestDay: 35 }),
      ),
    ).toBe("OVERDUE");
  });

  it("falls back to a neutral review word when the warning is neither early nor late", () => {
    expect(injectionTimingVerdict(timing({ state: "warning" }))).toBe("REVIEW");
    expect(
      injectionTimingVerdict(
        timing({ state: "warning", daysSincePrior: 28, earliestDay: 21, latestDay: 35 }),
      ),
    ).toBe("REVIEW");
  });
});

describe("injection timing tone", () => {
  it("follows the engine's severity rather than re-deciding it", () => {
    expect(injectionTimingTone(timing({ state: "ok" }))).toBe("ok");
    expect(injectionTimingTone(timing({ state: "warning" }))).toBe("warning");
    expect(injectionTimingTone(timing({ state: "stop" }))).toBe("stop");
    expect(injectionTimingTone(timing({ state: "idle" }))).toBe("neutral");
  });

  // An overdue dose is a provider-review warning in the domain, not a hard
  // stop. Painting it red here would assert a gate the engine never set.
  it("keeps an overdue dose amber, not red", () => {
    expect(injectionTimingTone(timing({ state: "warning", late: true }))).toBe("warning");
  });

  it("pairs a non-neutral tone with a verdict word in every state", () => {
    const states: InjectionTimingEvaluation[] = [
      timing({ state: "ok" }),
      timing({ state: "warning", late: true }),
      timing({ state: "stop" }),
      timing({ state: "idle" }),
    ];
    for (const value of states) {
      // Colour never travels alone: a coloured spine with no word beside it
      // would be unreadable to a staff member with colour deficiency.
      expect(injectionTimingVerdict(value).length).toBeGreaterThan(0);
      expect(injectionTimingTone(value)).toBeTruthy();
    }
  });
});

describe("injection timing day flag", () => {
  it("reports how far outside the window, not merely that it is outside", () => {
    expect(injectionTimingDayFlag(timing({ daysSincePrior: 15, earliestDay: 21, latestDay: 35 })))
      .toBe("6 DAYS EARLY");
    expect(injectionTimingDayFlag(timing({ daysSincePrior: 56, earliestDay: 21, latestDay: 35 })))
      .toBe("21 DAYS LATE");
  });

  it("marks the window boundaries as in window", () => {
    expect(injectionTimingDayFlag(timing({ daysSincePrior: 21, earliestDay: 21, latestDay: 35 })))
      .toBe("IN WINDOW");
    expect(injectionTimingDayFlag(timing({ daysSincePrior: 35, earliestDay: 21, latestDay: 35 })))
      .toBe("IN WINDOW");
    expect(injectionTimingDayFlag(timing({ daysSincePrior: 28, earliestDay: 21, latestDay: 35 })))
      .toBe("IN WINDOW");
  });

  it("keeps the day count grammatical at one day", () => {
    expect(injectionTimingDayFlag(timing({ daysSincePrior: 20, earliestDay: 21, latestDay: 35 })))
      .toBe("1 DAY EARLY");
    expect(injectionTimingDayFlag(timing({ daysSincePrior: 36, earliestDay: 21, latestDay: 35 })))
      .toBe("1 DAY LATE");
  });

  it("shows nothing rather than a guess when the window is unknown", () => {
    expect(injectionTimingDayFlag(timing({ daysSincePrior: 28 }))).toBeUndefined();
    expect(injectionTimingDayFlag(timing({ earliestDay: 21, latestDay: 35 }))).toBeUndefined();
    expect(injectionTimingDayFlag(timing({ daysSincePrior: 28, earliestDay: 21 }))).toBeUndefined();
  });

  it("counts a day-zero repeat as early rather than dropping the flag", () => {
    expect(injectionTimingDayFlag(timing({ daysSincePrior: 0, earliestDay: 21, latestDay: 35 })))
      .toBe("21 DAYS EARLY");
  });
});

describe("readiness verdict", () => {
  it("renders nothing at all before the workflow has any requirements", () => {
    expect(summarizeReadinessVerdict([])).toBeNull();
  });

  it("is clear only when every requirement is complete", () => {
    const verdict = summarizeReadinessVerdict([item("complete", "a"), item("complete", "b")]);
    expect(verdict?.tone).toBe("clear");
    expect(verdict?.completed).toBe(2);
    expect(verdict?.total).toBe(2);
  });

  it("treats an untouched requirement as blocking, not as its own third state", () => {
    const verdict = summarizeReadinessVerdict([item("complete", "a"), item("pending", "b")]);
    expect(verdict?.tone).toBe("blocked");
    expect(verdict?.pending).toBe(1);
  });

  it("blocks on a stop even when nothing is pending", () => {
    const verdict = summarizeReadinessVerdict([item("complete", "a"), item("stop", "b")]);
    expect(verdict?.tone).toBe("blocked");
  });

  it("flags review when the only outstanding rows are warnings", () => {
    const verdict = summarizeReadinessVerdict([
      item("complete", "a"),
      item("warning", "b"),
      item("complete", "c"),
    ]);
    expect(verdict?.tone).toBe("review");
    expect(verdict?.completed).toBe(2);
    expect(verdict?.total).toBe(3);
    expect(verdict?.warnings).toBe(1);
  });

  it("lets a stop outrank a warning", () => {
    const verdict = summarizeReadinessVerdict([item("warning", "a"), item("stop", "b")]);
    expect(verdict?.tone).toBe("blocked");
  });


  /**
   * A colour-coded verdict whose green is unreachable is worse than no verdict
   * at all: staff learn the signal is decorative and stop reading it. This
   * drives a complete encounter through the real engine and the real
   * projection, so the green state is proven end to end rather than only in
   * the summarizer's own arithmetic.
   */
  it("reaches green from a complete encounter through the real engine", () => {
    const encounter: InjectionEncounter = {
      ...emptyInjectionEncounter(),
      patient: { name: "REGISTER, VERDICT", dob: "01/01/1990" },
      medicationKey: "haldol",
      dose: "100 mg",
      route: "IM",
      site: "L deltoid",
      intervalKey: "q4wk",
      reason: "scheduled",
      priorDoseDate: "2026-01-02",
      priorSite: "R deltoid",
      administrationDate: "2026-01-30",
      nextDoseDate: "2026-02-27",
      orderingProvider: "Register Provider",
      administeredBy: "Register MA",
      administrationTime: "09:15",
      allergies: "NKDA verified in active record",
      traceability: { ndc: "12345-6789-01", lot: "REGISTER-LOT", expiration: "2027-12" },
      response: { kind: "well" },
      attestations: {
        id2: true,
        rights: true,
        allergy: true,
        consent: true,
        screen: true,
        hygiene: true,
      },
      verifications: { visualInspection: true, deepZtrack: true },
      acuteSafetyScreenConfirmed: true,
      disposition: { kind: "administered" },
      details: { productSource: "Clinic sample", volume: "1", volumeUnit: "mL" },
    };

    const evaluation = InjectionEngine.evaluate(encounter, {
      today: encounter.administrationDate,
    });
    const projected = projectClinicalReadiness("administer", evaluation);
    const verdict = summarizeReadinessVerdict(projected.items)!;

    expect(evaluation.readiness).toBe("ready");
    expect(verdict.tone).toBe("clear");
    expect(verdict.completed).toBe(verdict.total);
  });

  it("keeps the counts consistent with the rows it was given", () => {
    const verdict = summarizeReadinessVerdict([
      item("complete", "a"),
      item("complete", "b"),
      item("warning", "c"),
      item("stop", "d"),
      item("pending", "e"),
    ])!;
    expect(verdict.total).toBe(5);
    expect(verdict.completed).toBe(2);
    expect(verdict.warnings).toBe(1);
    expect(verdict.blockers).toBe(1);
    expect(verdict.pending).toBe(1);
  });
});
