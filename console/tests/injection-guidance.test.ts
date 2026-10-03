import { describe, expect, it } from "vitest";
import { injectionAssessment } from "../src/shared/injections.js";
import {
  getInjectionGuidance,
  INJECTION_GUIDANCE_VERSION,
} from "../src/shared/injection-guidance.js";

const productNames = [
  "Aristada Initio",
  "Aristada",
  "Invega Sustenna",
  "Invega Trinza",
  "Invega Hafyera",
  "Erzofri",
  "Abilify Maintena",
  "Abilify Asimtufii",
  "Uzedy",
  "Vivitrol",
  "Haloperidol decanoate",
  "Fluphenazine decanoate",
  "Zyprexa Relprevv",
];

describe("source-linked injection guidance", () => {
  it("preserves exact formulations and declines incomplete or ambiguous names", () => {
    for (const name of [
      "paliperidone palmitate",
      "Abilify",
      "aripiprazole lauroxil",
      "Haloperidol lactate",
      "Sustenna / Trinza",
      "Aristada and Vivitrol",
      "unknown",
    ])
      expect(getInjectionGuidance(name), name).toBeUndefined();
    expect(getInjectionGuidance("ARISTADA® INITIO 675 mg")?.id).toBe(
      "aristada-initio",
    );
    expect(getInjectionGuidance("Aristada 441 mg")?.id).toBe("aristada");
    expect(getInjectionGuidance("Erzofri")?.id).not.toBe(
      getInjectionGuidance("Sustenna")?.id,
    );
  });

  it("provides auditable versions and answerable checks without default clinical findings", () => {
    const ids = new Set<string>();
    for (const name of productNames) {
      const guide = getInjectionGuidance(name)!;
      expect(guide.productName).toBe(name);
      expect(guide.version).toBe(`${INJECTION_GUIDANCE_VERSION}:${guide.id}`);
      expect(guide.source.url).toMatch(
        /^https:\/\/(dailymed\.nlm\.nih\.gov|labeling\.alkermes\.com|www\.uzedy\.com|www\.accessdata\.fda\.gov)\//,
      );
      expect(guide.source.sections.length).toBeGreaterThan(0);
      expect(new Set(guide.clinicalChecks.map((x) => x.id)).size).toBe(
        guide.clinicalChecks.length,
      );
      expect(guide.clinicalChecks.length).toBeGreaterThan(0);
      for (const item of guide.clinicalChecks) {
        expect(Object.keys(item).sort()).toEqual(["id", "label", "prompt"]);
        expect([
          "interval_changes",
          "previous_response",
          "current_symptoms",
        ]).not.toContain(item.id);
      }
      expect(guide.aftercare.en.length).toBe(guide.aftercare.es.length);
      expect(
        injectionAssessment.safeParse({
          screening: guide.clinicalChecks.map((item) => ({
            id: item.id,
            label: item.label,
            result: "concern",
            detail:
              "Synthetic compatibility fixture: provider review required.",
          })),
          weightKg: null,
          needle: null,
          providerCommunication: null,
          education: guide.counseling,
        }).success,
        name,
      ).toBe(true);
      ids.add(guide.id);
    }
    expect(ids.size).toBe(productNames.length);
  });

  it("does not carry one product's incomplete-delivery pathway into another", () => {
    for (const name of ["Trinza", "Hafyera"])
      expect(getInjectionGuidance(name)?.incompleteDelivery).toContain(
        "Do not re-inject",
      );
    expect(getInjectionGuidance("Vivitrol")?.incompleteDelivery).toContain(
      "spare-needle",
    );
    expect(
      getInjectionGuidance("Vivitrol")?.clinicalChecks.find(
        (x) => x.id === "opioid-withdrawal",
      )?.prompt,
    ).toContain("Negative urine testing alone cannot establish safety");
    expect(getInjectionGuidance("Uzedy")?.preparation.join(" ")).toContain(
      "do not expel the bubble",
    );
    expect(getInjectionGuidance("Relprevv")?.requiresSpecialistSetting).toBe(
      true,
    );
    expect(
      getInjectionGuidance("Vivitrol")?.requiresSpecialistSetting,
    ).toBeUndefined();
  });

  it("includes actionable bilingual antipsychotic aftercare while preserving formulation-specific precautions", () => {
    for (const name of productNames.filter((name) => name !== "Vivitrol")) {
      const guide = getInjectionGuidance(name)!;
      expect(guide.aftercare.en.join(" "), name).toContain("Call 911");
      expect(guide.aftercare.es.join(" "), name).toContain("Llame al 911");
      expect(guide.aftercare.en.join(" "), name).toContain(
        "uncontrolled movements",
      );
      expect(guide.aftercare.es.join(" "), name).toContain(
        "movimientos involuntarios",
      );
    }
    expect(getInjectionGuidance("Hafyera")!.aftercare.en.join(" ")).toContain(
      "Do not rub",
    );
    expect(getInjectionGuidance("Asimtufii")!.aftercare.en.join(" ")).toContain(
      "Do not massage",
    );
    expect(getInjectionGuidance("Relprevv")!.aftercare.en.join(" ")).toContain(
      "Do not drive today",
    );
    expect(getInjectionGuidance("Vivitrol")!.aftercare.en.join(" ")).toContain(
      "naloxone",
    );
    expect(
      getInjectionGuidance("Vivitrol")!.aftercare.en.join(" "),
    ).not.toContain("uncontrolled movements");
  });

  it("returns independent data so encounter rendering cannot mutate later references", () => {
    const first = getInjectionGuidance("Vivitrol")!;
    const original = getInjectionGuidance("Vivitrol")!;
    first.clinicalChecks[0]!.prompt = "Changed";
    first.aftercare.en.push("Changed");
    first.preparation.length = 0;
    first.source.url = "https://invalid.example";
    expect(getInjectionGuidance("Vivitrol")).toEqual(original);
  });
});
