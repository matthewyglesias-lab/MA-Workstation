import { describe, expect, it } from "vitest";

import {
  INJECTION_KIOSK_STEPS,
  defaultInjectionKioskStepForTab,
  injectionKioskStepDefinition,
  projectInjectionKioskSteps,
} from "../../src/presentation/kiosk/InjectionStepper";

import { InjectionEngine } from "../../src/domain/injection";
import { projectInjectionWorkflowProgress } from "../../src/application/injection-workflow-progress";
import { documentedInjection } from "./injection-progress-fixture";
const projection = (encounter = documentedInjection(), locked = false) => {
  const evaluation = InjectionEngine.evaluate(encounter, {today: "2026-10-02"});
  return projectInjectionWorkflowProgress({
    encounter, evaluation,
    canSign: evaluation.output.recordStatus === "ready-to-lock", canSave: true, lifecycle: locked ? "locked" : "draft",
  });
};

describe("Injection focus stepper", () => {
  it("maps seven presentation steps onto the existing four worksheet pages", () => {
    expect(INJECTION_KIOSK_STEPS.map((step) => step.id)).toEqual([
      "identify",
      "verify-order",
      "prepare",
      "site",
      "administer",
      "response",
      "sign",
    ]);
    expect(injectionKioskStepDefinition("identify")).toMatchObject({
      tab: "order",
      field: "patient.name",
    });
    expect(injectionKioskStepDefinition("site")).toMatchObject({
      tab: "administration",
      field: "site",
    });
    expect(injectionKioskStepDefinition("sign")).toMatchObject({
      tab: "review",
      action: "sign",
    });
    expect(defaultInjectionKioskStepForTab("product")).toBe("prepare");
    expect(defaultInjectionKioskStepForTab("review")).toBe("response");
  });

  it("uses per-step evidence rather than final-readiness suffixes", () => {
    const encounter = documentedInjection(); encounter.response = {kind: ""};
    const progress = projection(encounter);
    const steps = projectInjectionKioskSteps(progress);
    expect(steps.find(step => step.id === "identify")).toMatchObject({state: "complete", stateLabel: "Documented"});
    // An untouched response is unfinished documentation, not an alert-colored
    // clinical event. The actual requirement and sign prohibition remain.
    expect(steps.find(step => step.id === "response")).toMatchObject({state: "pending"});
    expect(progress.concerns).toEqual(expect.arrayContaining([expect.objectContaining({code: "response.required", severity: "stop"})]));
    expect(progress.canSign).toBe(false);
    expect(steps.find(step => step.id === "site")).toMatchObject({state: "complete"});
  });
  it("marks administration-only steps not needed for a handoff", () => {
    const encounter = documentedInjection(); encounter.disposition = {kind:"held", provider:"Synthetic Provider",time:"2026-10-02T09:15",outcome:"Hold and call provider."};
    const steps = projectInjectionKioskSteps(projection(encounter));
    expect(steps.filter(step => step.state === "skipped").map(step => step.id)).toEqual(["prepare","site","administer"]);
    expect(steps.find(step => step.id === "sign")).toMatchObject({label:"Finish handoff",stateLabel:"Save handoff"});
  });
  it("shows signing as locally signed only after durable locking", () => {
    expect(projectInjectionKioskSteps(projection(documentedInjection(), true)).find(step => step.id === "sign"))
      .toMatchObject({state:"complete", stateLabel:"Signed locally"});
  });
});
