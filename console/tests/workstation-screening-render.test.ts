import type { ComponentChildren, VNode } from "preact";
import { describe, expect, it } from "vitest";
import { emptyInjectionEncounter } from "../src/shared/workstation/domain/injection.js";
import { buildInjectionPatientScreenDocument } from "../src/shared/workstation/domain/injection-patient-screening.js";
import { WorkstationScreeningDocument } from "../src/web/WorkstationPatientScreening.js";

// Read the pure document tree without a browser or patient data. This checks
// that the presentation preserves the existing questionnaire and blank paper
// responses independently of the source-model parity tests.
function elements(node: ComponentChildren): VNode<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as VNode<Record<string, unknown>>;
  if (typeof element.type === "function") {
    const component = element.type as (
      props: Record<string, unknown>,
    ) => ComponentChildren;
    return elements(component(element.props));
  }
  return [element, ...elements(element.props.children as ComponentChildren)];
}
function text(node: ComponentChildren): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  const element = node as VNode<Record<string, unknown>>;
  if (typeof element.type === "function") {
    const component = element.type as (
      props: Record<string, unknown>,
    ) => ComponentChildren;
    return text(component(element.props));
  }
  return text(element.props.children as ComponentChildren);
}

describe("original patient-screening presentation", () => {
  it.each(["en", "es"] as const)(
    "keeps exact %s questions, directions, and blank responses for the selected phase",
    (language) => {
      for (const reason of ["scheduled", "initiation"] as const) {
        const encounter = {
          ...emptyInjectionEncounter(),
          patient: { name: "SCREENING, SYNTHETIC", dob: "01/01/1990" },
          medicationKey: "sustenna" as const,
          dose: "156 mg",
          route: "IM",
          intervalKey: "q4wk" as const,
          reason,
          administrationDate: "2026-09-15",
        };
        const model = buildInjectionPatientScreenDocument(encounter, language);
        const tree = WorkstationScreeningDocument({ model });
        const nodes = elements(tree);
        const questions = nodes.filter((node) => node.props["data-rule-id"]);
        const expectedQuestions = model.sections.flatMap(
          (section) => section.items,
        );
        expect(questions.map((node) => node.props["data-rule-id"])).toEqual(
          expectedQuestions.map((question) => question.id),
        );
        questions.forEach((question, index) => {
          const prompt = elements(question).find((node) => node.type === "p");
          expect(text(prompt)).toBe(expectedQuestions[index]!.prompt);
        });
        expect(
          nodes.filter(
            (node) => node.props.class === "workstation-screening-empty-box",
          ),
        ).toHaveLength(expectedQuestions.length * 3);
        expect(
          nodes.some((node) =>
            ["input", "textarea"].includes(String(node.type)),
          ),
        ).toBe(false);
        expect(text(tree)).toContain(model.labels.responseInstruction);
        expect(text(tree)).toContain(model.labels.staffResponseNote);
        expect(text(tree)).toContain(encounter.patient.name);
        expect(nodes.some((node) => "data-review-status" in node.props)).toBe(
          false,
        );
        expect(text(tree).includes(model.labels.consentBody)).toBe(
          model.showsConsent,
        );
      }
    },
  );

  it("retains the original custom-medication limitation instead of inventing product-specific screening", () => {
    const model = buildInjectionPatientScreenDocument(
      {
        ...emptyInjectionEncounter(),
        medicationKey: "other",
        customMedication: "Synthetic ordered product",
      },
      "en",
    );
    const tree = WorkstationScreeningDocument({ model });
    expect(text(tree)).toContain(
      "No product-specific screening or consent content is available",
    );
    expect(text(tree)).toContain(model.labels.noProductSource);
    expect(text(tree)).not.toContain(model.labels.consentBody);
  });
});
