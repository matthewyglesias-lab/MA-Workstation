import { describe, expect, it } from "vitest";

import type { WorkstationReadinessItem } from "../../src/application/workstation-projection";
import {
  INJECTION_KIOSK_STEPS,
  defaultInjectionKioskStepForTab,
  injectionKioskStepDefinition,
  projectInjectionKioskSteps,
} from "../../src/presentation/kiosk/InjectionStepper";

const item = (
  id: string,
  state: WorkstationReadinessItem["state"],
): WorkstationReadinessItem => ({ id: `injection.${id}`, label: id, state });

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

  it("rolls up only the engine-projected readiness stages", () => {
    const steps = projectInjectionKioskSteps({
      readiness: [
        item("patient-order", "complete"),
        item("medication-schedule", "warning"),
        item("product-trace", "complete"),
        item("administration", "stop"),
        item("safety", "complete"),
        item("disposition-followup", "pending"),
      ],
      locked: false,
      canComplete: false,
      nonAdministration: false,
    });

    expect(Object.fromEntries(steps.map((step) => [step.id, step.state]))).toEqual({
      identify: "complete",
      "verify-order": "warning",
      prepare: "complete",
      site: "stop",
      administer: "stop",
      response: "pending",
      sign: "pending",
    });
  });

  it("marks administration-only steps not needed for a documented exception", () => {
    const steps = projectInjectionKioskSteps({
      readiness: [],
      locked: false,
      canComplete: true,
      nonAdministration: true,
    });
    expect(
      steps
        .filter((step) => ["prepare", "site", "administer"].includes(step.id))
        .map((step) => step.state),
    ).toEqual(["skipped", "skipped", "skipped"]);
    expect(steps.find((step) => step.id === "sign")?.state).toBe("ready");
  });

  it("shows signing as complete only after the existing lifecycle locks", () => {
    const sign = projectInjectionKioskSteps({
      readiness: [],
      locked: true,
      canComplete: false,
      nonAdministration: false,
    }).find((step) => step.id === "sign");
    expect(sign).toMatchObject({ state: "complete", stateLabel: "Complete" });
  });
});
