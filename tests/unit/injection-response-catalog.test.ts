import { describe, expect, it } from "vitest";

import {
  INJECTION_RESPONSE_OPTIONS,
  findInjectionResponseDetail,
  findInjectionResponseOption,
  injectionResponseFragment,
  injectionResponseHeadline,
  injectionResponseNote,
  legacyInjectionResponseMirror,
  type InjectionResponse,
} from "../../src/domain/injection";

const response = (partial: Partial<InjectionResponse>): InjectionResponse => ({
  kind: "",
  ...partial,
});

describe("injection response catalog", () => {
  it("keeps every key unique and every sub-choice key unique within its parent", () => {
    const keys = INJECTION_RESPONSE_OPTIONS.map((option) => option.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const option of INJECTION_RESPONSE_OPTIONS) {
      const detailKeys = (option.details ?? []).map((detail) => detail.key);
      expect(new Set(detailKeys).size).toBe(detailKeys.length);
    }
  });

  // The compatibility runtime already offered these three while the typed
  // panel did not, so the two layers documented different things.
  it("carries the kinds the compatibility runtime's extension added", () => {
    for (const key of ["obsok", "flowres", "devicehold"] as const) {
      expect(findInjectionResponseOption(key)).toBeDefined();
    }
  });

  it("gives every non-custom option real note and headline wording", () => {
    for (const option of INJECTION_RESPONSE_OPTIONS) {
      if (option.key === "custom") continue;
      expect(option.note.length).toBeGreaterThan(0);
      expect(option.note).toMatch(/[.!?]$/);
      expect(option.fragment.length).toBeGreaterThan(0);
      expect(injectionResponseHeadline(response({ kind: option.key }))).not.toBe("");
    }
  });

  it("gives every sub-choice its own complete sentence, never a fragment", () => {
    for (const option of INJECTION_RESPONSE_OPTIONS) {
      for (const detail of option.details ?? []) {
        expect(detail.note).toMatch(/[.!?]$/);
        expect(detail.note.length).toBeGreaterThan(0);
        expect(detail.fragment.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps CC headlines terse and in mid-sentence voice", () => {
    for (const option of INJECTION_RESPONSE_OPTIONS) {
      if (option.key === "custom") continue;
      const headline = injectionResponseHeadline(response({ kind: option.key }));
      expect(headline).not.toMatch(/[.!?]$/);
      expect(headline.charAt(0)).toBe(headline.charAt(0).toLocaleLowerCase());
    }
  });
});

describe("injectionResponseNote", () => {
  it("uses the parent sentence when no sub-choice is set", () => {
    expect(injectionResponseNote(response({ kind: "well" }))).toBe(
      "Pt tolerated inj well; no immediate complication, bleeding, or swelling at site.",
    );
  });

  it("replaces the parent sentence with the sub-choice's own", () => {
    const parent = injectionResponseNote(response({ kind: "bleed" }));
    const detailed = injectionResponseNote(
      response({ kind: "bleed", detail: "extended" }),
    );
    expect(detailed).not.toBe(parent);
    expect(detailed).toContain("extended pressure");
    // A replacement, not a concatenation of both sentences.
    expect(detailed).not.toContain(parent);
  });

  it("ignores a sub-choice key that does not belong to the selected kind", () => {
    expect(injectionResponseNote(response({ kind: "well", detail: "extended" }))).toBe(
      injectionResponseNote(response({ kind: "well" })),
    );
  });

  it("emits nothing when no response is documented", () => {
    expect(injectionResponseNote(response({ kind: "" }))).toBe("");
  });

  it("passes custom text through, punctuated once", () => {
    expect(injectionResponseNote(response({ kind: "custom", custom: "Pt reported nausea" })))
      .toBe("Pt reported nausea.");
    expect(injectionResponseNote(response({ kind: "custom", custom: "Pt reported nausea." })))
      .toBe("Pt reported nausea.");
    expect(injectionResponseNote(response({ kind: "custom", custom: "  " }))).toBe("");
  });
});

describe("legacyInjectionResponseMirror", () => {
  // The runtime renders these natively; leaving them alone keeps stored
  // records byte-identical to what they produced before the catalog existed.
  it("passes through the kinds the runtime handles on its own", () => {
    for (const kind of ["well", "bleed", "disc"] as const) {
      expect(legacyInjectionResponseMirror(response({ kind }))).toEqual({
        kind,
        custom: "",
      });
    }
  });

  // responseSnapshot() ends in `return "tolerated well"`, so an unrecognized
  // kind would otherwise be documented as a well-tolerated injection.
  it("routes kinds the runtime cannot resolve through its custom path", () => {
    for (const kind of ["reaction", "vasovagal", "anxiety", "obsok", "flowres"] as const) {
      const mirror = legacyInjectionResponseMirror(response({ kind }));
      expect(mirror.kind).toBe("custom");
      expect(mirror.custom.length).toBeGreaterThan(0);
      expect(mirror.custom).toBe(injectionResponseFragment(response({ kind })));
    }
  });

  it("routes a sub-choice through custom even on a natively handled kind", () => {
    const mirror = legacyInjectionResponseMirror(
      response({ kind: "bleed", detail: "extended" }),
    );
    expect(mirror.kind).toBe("custom");
    expect(mirror.custom).toContain("extended pressure");
  });

  it("never hands the runtime an empty custom string it would gate on", () => {
    for (const option of INJECTION_RESPONSE_OPTIONS) {
      if (option.key === "custom") continue;
      for (const detail of [undefined, ...(option.details ?? [])]) {
        const mirror = legacyInjectionResponseMirror(
          response({ kind: option.key, detail: detail?.key }),
        );
        if (mirror.kind === "custom") expect(mirror.custom.trim()).not.toBe("");
      }
    }
  });

  it("preserves an explicit custom response unchanged", () => {
    expect(
      legacyInjectionResponseMirror(response({ kind: "custom", custom: "Pt reported nausea" })),
    ).toEqual({ kind: "custom", custom: "Pt reported nausea" });
  });

  it("stays empty for an undocumented response", () => {
    expect(legacyInjectionResponseMirror(response({ kind: "" }))).toEqual({
      kind: "",
      custom: "",
    });
  });
});

describe("findInjectionResponseDetail", () => {
  it("resolves a sub-choice only within its own parent", () => {
    expect(findInjectionResponseDetail(response({ kind: "bleed", detail: "dressing" }))?.key)
      .toBe("dressing");
    expect(findInjectionResponseDetail(response({ kind: "well", detail: "dressing" }))).toBeUndefined();
    expect(findInjectionResponseDetail(response({ kind: "bleed" }))).toBeUndefined();
  });
});
