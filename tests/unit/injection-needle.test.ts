import { describe, expect, it } from "vitest";

import { INJECTION_MEDICATIONS, injectionSiteGroup } from "../../src/domain/injection-catalog";
import type { InjectionMedicationKey } from "../../src/domain/injection-catalog";
import {
  formatNeedleSpec,
  formatTechniquePrefill,
  normalizeWeightKg,
  resolveNeedle,
  techniqueNotesFor,
} from "../../src/domain/injection-needle";
import { INJECTION_CLINICAL_REFERENCE_BUNDLE } from "../../src/domain/injection-clinical-reference";
import {
  InjectionEngine,
  emptyInjectionEncounter,
  medicationPreparationGuidance,
  type InjectionEncounter,
} from "../../src/domain/injection";

const med = (key: InjectionMedicationKey) => INJECTION_MEDICATIONS[key];

/** Resolve and render in one step - every assertion below is about the
 * rendered needle an MA would read off the panel. */
const needleFor = (
  key: InjectionMedicationKey,
  dose: string,
  site: string,
  context: Parameters<typeof resolveNeedle>[3] = {},
): string => {
  const resolution = resolveNeedle(med(key), dose, site, context);
  return resolution.needle ? formatNeedleSpec(resolution.needle) : "";
};

describe("injectionSiteGroup", () => {
  it("maps both sides of each muscle to one anatomical family", () => {
    expect(injectionSiteGroup("R deltoid")).toBe("deltoid");
    expect(injectionSiteGroup("L deltoid")).toBe("deltoid");
    expect(injectionSiteGroup("R ventrogluteal")).toBe("gluteal");
    expect(injectionSiteGroup("L dorsogluteal")).toBe("gluteal");
    expect(injectionSiteGroup("Abdomen LUQ (SubQ)")).toBe("subq");
    expect(injectionSiteGroup("R upper arm (SubQ)")).toBe("subq");
  });

  it("returns empty for free-text and unset sites", () => {
    // Correct for the order-directed products: their labels name a gauge but
    // no anatomical site, so there is nothing to key a site rule to.
    expect(injectionSiteGroup("")).toBe("");
    expect(injectionSiteGroup("per active order")).toBe("");
  });
});

describe("normalizeWeightKg", () => {
  it("passes kilograms through and converts pounds", () => {
    expect(normalizeWeightKg("90", "kg")).toBe(90);
    expect(normalizeWeightKg("198.4", "lb")).toBeCloseTo(90, 1);
  });

  it("rejects blank, zero, negative, and non-numeric entry", () => {
    expect(normalizeWeightKg("", "kg")).toBeNull();
    expect(normalizeWeightKg("0", "kg")).toBeNull();
    expect(normalizeWeightKg("-5", "kg")).toBeNull();
    expect(normalizeWeightKg("abc", "kg")).toBeNull();
    expect(normalizeWeightKg(undefined, "kg")).toBeNull();
  });
});

describe("paliperidone needle selection — the 90 kg threshold", () => {
  it("flips the deltoid needle at exactly 90 kg for Invega Sustenna", () => {
    expect(needleFor("sustenna", "156 mg", "L deltoid", { weightKg: 89.9 })).toBe('23G 1"');
    expect(needleFor("sustenna", "156 mg", "L deltoid", { weightKg: 90 })).toBe('22G 1½"');
    expect(needleFor("sustenna", "156 mg", "L deltoid", { weightKg: 90.1 })).toBe('22G 1½"');
  });

  it("uses one gluteal needle regardless of weight", () => {
    expect(needleFor("sustenna", "156 mg", "R ventrogluteal", { weightKg: 60 })).toBe('22G 1½"');
    expect(needleFor("sustenna", "156 mg", "R ventrogluteal", { weightKg: 140 })).toBe('22G 1½"');
  });

  it("applies the same threshold to Erzofri", () => {
    expect(needleFor("erzofri", "117 mg", "R deltoid", { weightKg: 70 })).toBe('23G 1"');
    expect(needleFor("erzofri", "117 mg", "R deltoid", { weightKg: 95 })).toBe('22G 1½"');
  });

  it("changes only length, not gauge, for Invega Trinza deltoid", () => {
    // TRINZA is 22G thin wall on both sides of the threshold, unlike
    // SUSTENNA/ERZOFRI which change gauge too. A copy-paste of the Sustenna
    // rules would break this.
    expect(needleFor("trinza", "273 mg", "L deltoid", { weightKg: 70 })).toBe(
      '22G 1" (thin wall)',
    );
    expect(needleFor("trinza", "273 mg", "L deltoid", { weightKg: 95 })).toBe(
      '22G 1½" (thin wall)',
    );
  });

  it("reports deltoid as unresolved when weight is undocumented", () => {
    const resolution = resolveNeedle(med("sustenna"), "156 mg", "L deltoid", {});
    expect(resolution.unresolved).toBe(true);
    expect(resolution.needle).toBeUndefined();
    expect(resolution.needs).toEqual(["weight"]);
    expect(resolution.unresolvedReason).toMatch(/weight/i);
  });

  it("still resolves gluteal without weight, since no rule depends on it", () => {
    const resolution = resolveNeedle(med("sustenna"), "156 mg", "R ventrogluteal", {});
    expect(resolution.unresolved).toBe(false);
    expect(formatNeedleSpec(resolution.needle!)).toBe('22G 1½"');
  });
});

describe("aripiprazole needle selection — habitus band", () => {
  it("selects the Asimtufii needle by habitus and names the kit pack", () => {
    expect(needleFor("asimtufii", "960 mg", "R ventrogluteal", { habitus: "average" })).toBe(
      '22G 1½" (black pack)',
    );
    expect(needleFor("asimtufii", "960 mg", "R ventrogluteal", { habitus: "larger" })).toBe(
      '21G 2" (green pack)',
    );
  });

  it("treats lean and average alike, matching the label's non-obese wording", () => {
    expect(needleFor("asimtufii", "720 mg", "L ventrogluteal", { habitus: "lean" })).toBe(
      needleFor("asimtufii", "720 mg", "L ventrogluteal", { habitus: "average" }),
    );
  });

  it("varies the Maintena needle across both site and habitus", () => {
    expect(needleFor("maintena", "400 mg", "R deltoid", { habitus: "average" })).toBe('23G 1"');
    expect(needleFor("maintena", "400 mg", "R deltoid", { habitus: "larger" })).toBe('22G 1½"');
    expect(needleFor("maintena", "400 mg", "R ventrogluteal", { habitus: "average" })).toBe(
      '22G 1½"',
    );
    expect(needleFor("maintena", "400 mg", "R ventrogluteal", { habitus: "larger" })).toBe(
      '21G 2"',
    );
  });

  it("reports unresolved when habitus is undocumented", () => {
    const resolution = resolveNeedle(med("asimtufii"), "960 mg", "R ventrogluteal", {});
    expect(resolution.unresolved).toBe(true);
    expect(resolution.needs).toEqual(["habitus"]);
  });

  it("does not accept weight as a substitute for habitus", () => {
    // The aripiprazole labels say non-obese/obese, which weight alone cannot
    // establish without height. Supplying weight must not resolve these.
    const resolution = resolveNeedle(med("asimtufii"), "960 mg", "R ventrogluteal", {
      weightKg: 120,
    });
    expect(resolution.unresolved).toBe(true);
  });
});

describe("Vivitrol needle selection", () => {
  it("selects the longer customized needle for larger habitus", () => {
    expect(needleFor("vivitrol", "380 mg", "R ventrogluteal", { habitus: "larger" })).toBe(
      '20G 2" (customized kit needle)',
    );
    expect(needleFor("vivitrol", "380 mg", "R ventrogluteal", { habitus: "lean" })).toBe(
      '20G 1½" (customized kit needle)',
    );
  });

  it("explains that habitus must be assessed before each injection", () => {
    const resolution = resolveNeedle(med("vivitrol"), "380 mg", "R ventrogluteal", {});
    expect(resolution.unresolved).toBe(true);
    expect(resolution.unresolvedReason).toMatch(/before each injection/i);
  });

  it("carries the wrong-route and kit-needle cautions", () => {
    const notes = techniqueNotesFor(med("vivitrol"), "380 mg", "R ventrogluteal");
    const statements = notes.map((note) => note.statement).join(" ");
    expect(statements).toMatch(/must not be injected using any other needle/i);
    expect(statements).toMatch(/necrosis/i);
    expect(statements).toMatch(/administer immediately/i);
  });

  it("returns the room-temp and immediate-use preparation guidance plus the discoloration check", () => {
    const text = medicationPreparationGuidance(med("vivitrol"), "380 mg", "R ventrogluteal");
    expect(text).toMatch(/room temperature/i);
    expect(text).toMatch(/administer immediately/i);
    expect(text).toMatch(/particulate matter or discoloration/i);
  });

  it("returns empty guidance for a ready-to-use product with no real prep step", () => {
    expect(medicationPreparationGuidance(med("haldol"), "100 mg", "L deltoid")).toBe("");
  });
});

describe("choice-of-two-needles products", () => {
  it("offers both Aristada gluteal needles when habitus is unknown", () => {
    const resolution = resolveNeedle(med("aristada"), "882 mg", "R ventrogluteal", {});
    expect(resolution.unresolved).toBe(false);
    expect(formatNeedleSpec(resolution.needle!)).toBe('20G 1½"');
    expect(formatNeedleSpec(resolution.alternate!)).toBe('20G 2"');
  });

  it("commits to the longer needle once larger habitus is documented", () => {
    const resolution = resolveNeedle(med("aristada"), "882 mg", "R ventrogluteal", {
      habitus: "larger",
    });
    expect(formatNeedleSpec(resolution.needle!)).toBe('20G 2"');
    expect(resolution.alternate).toBeUndefined();
  });

  it("scopes the Aristada deltoid rule to the 441 mg strength", () => {
    expect(needleFor("aristada", "441 mg", "R deltoid", {})).toBe('21G 1"');
    // Higher strengths are gluteal-only, so no deltoid rule should match.
    expect(needleFor("aristada", "882 mg", "R deltoid", {})).toBe("");
  });
});

describe("resolving before a specific side is chosen", () => {
  // The MA draws the needle up before deciding left versus right, so a
  // single-group product must resolve as soon as drug and dose are set.
  it("resolves a gluteal-only product with no site documented yet", () => {
    const resolution = resolveNeedle(med("asimtufii"), "960 mg", "", { habitus: "larger" });
    expect(formatNeedleSpec(resolution.needle!)).toBe('21G 2" (green pack)');
    expect(resolution.siteGroup).toBe("gluteal");
  });

  it("resolves a SubQ-only product with no site documented yet", () => {
    const resolution = resolveNeedle(med("uzedy"), "100 mg", "", {});
    expect(formatNeedleSpec(resolution.needle!)).toBe(
      '21G 5⁄8" (attached to prefilled syringe)',
    );
    expect(resolution.siteGroup).toBe("subq");
  });

  it("waits for the site when the product permits more than one muscle group", () => {
    // Sustenna's needle genuinely differs between deltoid and gluteal, so
    // guessing a group here would put a specific wrong needle on screen.
    const resolution = resolveNeedle(med("sustenna"), "156 mg", "", { weightKg: 70 });
    expect(resolution.needle).toBeUndefined();
    expect(resolution.unresolved).toBe(false);
  });

  it("prefers the documented site over the implied group once one is chosen", () => {
    const resolution = resolveNeedle(med("maintena"), "400 mg", "R deltoid", {
      habitus: "larger",
    });
    expect(resolution.siteGroup).toBe("deltoid");
    expect(formatNeedleSpec(resolution.needle!)).toBe('22G 1½"');
  });
});

describe("order-directed products", () => {
  it("recommends the Haldol gauge without implying a site", () => {
    const resolution = resolveNeedle(med("haldol"), "100 mg", "", {});
    expect(formatNeedleSpec(resolution.needle!)).toBe(
      "21G (length per ordered site and depth)",
    );
    expect(INJECTION_CLINICAL_REFERENCE_BUNDLE.medications.haldol.administration.siteRestriction)
      .toBeUndefined();
  });

  it("keeps the Prolixin dry-syringe requirement", () => {
    const notes = techniqueNotesFor(med("prolixin"), "25 mg", "");
    expect(notes.map((note) => note.statement).join(" ")).toMatch(/dry syringe/i);
  });

  it("does not assert a Z-track requirement for either decanoate", () => {
    const haldol = techniqueNotesFor(med("haldol"), "100 mg", "").map((n) => n.statement).join(" ");
    expect(haldol).toMatch(/does not prescribe a gluteal-only site or a Z-track requirement/i);
  });
});

describe("products with no needle data", () => {
  it("returns nothing resolvable for the uncataloged 'other' entry", () => {
    const resolution = resolveNeedle(med("other"), "", "R deltoid", {});
    expect(resolution.unresolved).toBe(false);
    expect(resolution.needle).toBeUndefined();
    expect(techniqueNotesFor(med("other"), "", "R deltoid")).toEqual([]);
  });

  it("returns nothing for a null medication", () => {
    expect(resolveNeedle(null, "", "", {}).unresolved).toBe(false);
  });
});

describe("technique prefill string", () => {
  it("reads as the needle, placement, and angle an MA would type", () => {
    const resolution = resolveNeedle(med("asimtufii"), "960 mg", "R ventrogluteal", {
      habitus: "larger",
    });
    expect(
      formatTechniquePrefill(med("asimtufii"), resolution, "IM"),
    ).toBe('21G 2" (green pack), gluteal IM at 90°.');
  });

  it("uses the subcutaneous angle range for Uzedy", () => {
    const resolution = resolveNeedle(med("uzedy"), "100 mg", "Abdomen RUQ (SubQ)", {});
    expect(formatTechniquePrefill(med("uzedy"), resolution, "SubQ")).toBe(
      '21G 5⁄8" (attached to prefilled syringe), SubQ at 45–90°.',
    );
  });

  it("does not carry the IM angle into a Prolixin SubQ technique prefill", () => {
    const resolution = resolveNeedle(med("prolixin"), "25 mg", "abdomen", {});
    expect(formatTechniquePrefill(med("prolixin"), resolution, "SubQ")).not.toMatch(/90°/);
  });

  it("produces nothing when the needle is unresolved", () => {
    const resolution = resolveNeedle(med("sustenna"), "156 mg", "L deltoid", {});
    expect(formatTechniquePrefill(med("sustenna"), resolution, "IM")).toBe("");
  });
});

describe("engine warning scope", () => {
  const administered = (
    key: InjectionMedicationKey,
    dose: string,
    site: string,
  ): InjectionEncounter => ({
    ...emptyInjectionEncounter(),
    patient: { name: "Doe, Jane", dob: "05/12/1980" },
    medicationKey: key,
    dose,
    route: key === "uzedy" ? "SubQ" : "IM",
    site,
    intervalKey: "q4wk",
    reason: "scheduled",
    administrationDate: "2026-08-07",
    administrationTime: "10:00",
    orderingProvider: "Jane Doe, MD",
    administeredBy: "Matthew Y.",
    response: { kind: "well" },
    disposition: { kind: "administered" },
  });

  const warningCodes = (encounter: InjectionEncounter): string[] =>
    InjectionEngine.evaluate(encounter, { today: encounter.administrationDate }).warnings.map(
      (warning) => warning.code,
    );

  it("warns when Vivitrol habitus is undocumented, because its label requires the assessment", () => {
    expect(warningCodes(administered("vivitrol", "380 mg", "R ventrogluteal"))).toContain(
      "needle.unresolved",
    );
  });

  it("stops warning once habitus is documented", () => {
    const encounter = administered("vivitrol", "380 mg", "R ventrogluteal");
    encounter.habitus = "average";
    expect(warningCodes(encounter)).not.toContain("needle.unresolved");
  });

  it("does not soft-gate ordinary encounters whose needle merely needs input", () => {
    // Sustenna deltoid needs a weight to resolve, and Asimtufii needs a
    // habitus band, but neither label requires the assessment itself. An
    // undocumented value must leave these advisory - raising a warning would
    // move every such record from "ready" to "review".
    expect(warningCodes(administered("sustenna", "156 mg", "L deltoid"))).not.toContain(
      "needle.unresolved",
    );
    expect(warningCodes(administered("asimtufii", "960 mg", "R ventrogluteal"))).not.toContain(
      "needle.unresolved",
    );
  });

  it("keeps a Vivitrol encounter finalizable — the warning is never a stop", () => {
    const evaluation = InjectionEngine.evaluate(
      administered("vivitrol", "380 mg", "R ventrogluteal"),
      { today: "2026-08-07" },
    );
    expect(evaluation.stops.map((stop) => stop.code)).not.toContain("needle.unresolved");
  });

  it("projects the needle resolution and site restriction onto the evaluation output", () => {
    const encounter = administered("asimtufii", "960 mg", "R ventrogluteal");
    encounter.habitus = "larger";
    const { needle } = InjectionEngine.evaluate(encounter, { today: "2026-08-07" }).output;

    expect(formatNeedleSpec(needle.resolution.needle!)).toBe('21G 2" (green pack)');
    expect(needle.siteRestriction?.headline).toMatch(/gluteal/i);
    expect(needle.angle?.degrees).toBe("90");
  });

  it("carries the documented weight through to the projection in kilograms", () => {
    const encounter = administered("sustenna", "156 mg", "L deltoid");
    encounter.vitals = { weight: "200", weightUnit: "lb" };
    const { needle } = InjectionEngine.evaluate(encounter, { today: "2026-08-07" }).output;

    expect(needle.weightKg).toBeCloseTo(90.7, 1);
    expect(formatNeedleSpec(needle.resolution.needle!)).toBe('22G 1½"');
  });

  it("resolves a pound entry by its exact converted weight, not a rounded one", () => {
    // 198.4 lb is 89.99 kg - below the labeled 90 kg threshold, so it takes
    // the shorter deltoid needle even though it rounds to 90. The threshold
    // is compared against the exact conversion, never a display value.
    const encounter = administered("sustenna", "156 mg", "L deltoid");
    encounter.vitals = { weight: "198.4", weightUnit: "lb" };
    const { needle } = InjectionEngine.evaluate(encounter, { today: "2026-08-07" }).output;

    expect(needle.weightKg).toBeLessThan(90);
    expect(formatNeedleSpec(needle.resolution.needle!)).toBe('23G 1"');
  });
});

describe("administration reference integrity", () => {
  const entries = Object.values(INJECTION_CLINICAL_REFERENCE_BUNDLE.medications);

  it("gives every cataloged product an administration block with at least one rule", () => {
    entries.forEach((entry) => {
      expect(entry.administration.needleRules.length).toBeGreaterThan(0);
      expect(entry.administration.angle.degrees).toBeTruthy();
    });
  });

  it("gives every needle rule a real needle and a rationale", () => {
    entries.forEach((entry) => {
      entry.administration.needleRules.forEach((rule) => {
        expect(Boolean(rule.needle.gauge || rule.needle.length)).toBe(true);
        expect(rule.rationale.trim()).not.toBe("");
      });
    });
  });

  it("gives every technique note a source, a classification, and a statement", () => {
    entries.forEach((entry) => {
      entry.administration.notes.forEach((note) => {
        expect(note.statement.trim()).not.toBe("");
        expect(note.source.url).toMatch(/^https:\/\//);
        expect(note.source.title.trim()).not.toBe("");
        expect(["label constraint", "order-dependent review", "local policy"]).toContain(
          note.classification,
        );
      });
    });
  });

  it("keeps technique note ids unique across the bundle", () => {
    const ids = entries.flatMap((entry) => entry.administration.notes.map((note) => note.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("explains itself whenever a rule depends on undocumented input", () => {
    entries.forEach((entry) => {
      const dependsOnContext = entry.administration.needleRules.some(
        (rule) => rule.weightKg || rule.habitus?.length,
      );
      if (!dependsOnContext) return;
      expect(entry.administration.needleUnresolved.trim()).not.toBe("");
    });
  });

  it("states a site restriction for every product whose sites are filtered", () => {
    // If the engine narrows the site list, the MA must be told why rather
    // than seeing tiles silently disappear.
    (["asimtufii", "hafyera", "uzedy"] as const).forEach((key) => {
      const restriction =
        INJECTION_CLINICAL_REFERENCE_BUNDLE.medications[key].administration.siteRestriction;
      expect(restriction?.headline.trim()).not.toBe("");
      expect(restriction?.detail.trim()).not.toBe("");
    });
  });
});
