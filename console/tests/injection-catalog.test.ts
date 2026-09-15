import { describe, expect, it } from "vitest";
import { getInjectionReference } from "../src/shared/injection-catalog.js";

describe("medication reference selection", () => {
  it("separates formulations and gives Initio precedence over its shared brand", () => {
    expect(getInjectionReference("ARISTADA® INITIO™ 675 mg kit")?.name).toBe(
      "Aristada Initio",
    );
    expect(getInjectionReference("Aristada 882 mg syringe")?.name).toBe(
      "Aristada",
    );
    expect(getInjectionReference("Abilify Maintena 400 mg")?.name).toBe(
      "Abilify Maintena",
    );
    expect(getInjectionReference("Abilify Asimtufii 960 mg")?.name).toBe(
      "Abilify Asimtufii",
    );
  });

  it("does not choose a product for ambiguous, incomplete, or substring names", () => {
    for (const name of [
      "aripiprazole",
      "Abilify injection",
      "Invega",
      "paliperidone palmitate",
      "Haldol injection",
      "Prolixin",
      "Zyprexa 10 mg",
      "UzedyLike product",
      "XAristada",
      "Maintena / Asimtufii",
      "Aristada plus Initio",
      "Aristada Initio + Aristada",
    ]) {
      expect(getInjectionReference(name), name).toBeUndefined();
    }
  });

  it("flags restricted-setting context only for the exact Relprevv formulation", () => {
    expect(
      getInjectionReference("Zyprexa Relprevv 300 mg")
        ?.requiresSpecialistSetting,
    ).toBe(true);
    expect(
      getInjectionReference("Zyprexa")?.requiresSpecialistSetting,
    ).toBeUndefined();
    expect(
      getInjectionReference("Vivitrol 380 mg")?.requiresSpecialistSetting,
    ).toBeUndefined();
  });

  it("does not let a caller overwrite subsequent reference guidance", () => {
    const reference = getInjectionReference("Uzedy")!;
    reference.reviewPoints.length = 0;
    expect(getInjectionReference("Uzedy")!.reviewPoints.length).toBeGreaterThan(
      0,
    );
  });
});
