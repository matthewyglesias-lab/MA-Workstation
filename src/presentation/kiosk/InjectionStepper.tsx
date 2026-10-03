import type { InjectionWorkflowProgress } from "../../application/injection-workflow-progress";
import { DesktopIcon } from "../DesktopIcon";
import type { InjectionKioskStepId } from "../types";
import { KIOSK } from "../vocabulary";

export type InjectionKioskTab =
  | "order"
  | "product"
  | "administration"
  | "review";

export interface InjectionKioskStepDefinition {
  id: InjectionKioskStepId;
  label: string;
  tab: InjectionKioskTab;
  field?: string;
  action?: "sign";
}

export const INJECTION_KIOSK_STEPS: readonly InjectionKioskStepDefinition[] = [
  {
    id: "identify",
    label: KIOSK.stepIdentify,
    tab: "order",
    field: "patient.name",
  },
  {
    id: "verify-order",
    label: KIOSK.stepVerifyOrder,
    tab: "order",
    field: "orderingProvider",
  },
  {
    id: "prepare",
    label: KIOSK.stepPrepare,
    tab: "product",
    field: "traceability.ndc",
  },
  {
    id: "site",
    label: KIOSK.stepSite,
    tab: "administration",
    field: "site",
  },
  {
    id: "administer",
    label: KIOSK.stepAdminister,
    tab: "administration",
    field: "administeredBy",
  },
  {
    id: "response",
    label: KIOSK.stepResponse,
    tab: "review",
    field: "response",
  },
  {
    id: "sign",
    label: KIOSK.stepSign,
    tab: "review",
    action: "sign",
  },
] as const;

export const injectionKioskStepDefinition = (
  id: InjectionKioskStepId,
): InjectionKioskStepDefinition =>
  INJECTION_KIOSK_STEPS.find((step) => step.id === id) ??
  INJECTION_KIOSK_STEPS[0]!;

export function defaultInjectionKioskStepForTab(
  tab: InjectionKioskTab,
): InjectionKioskStepId {
  switch (tab) {
    case "product":
      return "prepare";
    case "administration":
      return "site";
    case "review":
      return "response";
    case "order":
    default:
      return "identify";
  }
}

export type InjectionKioskStepState =
  | "complete"
  | "ready"
  | "stop"
  | "warning"
  | "pending"
  | "skipped";

export interface ProjectedInjectionKioskStep
  extends InjectionKioskStepDefinition {
  state: InjectionKioskStepState;
  stateLabel: string;
}

/** Adapt the shared encounter model to the retained focused rail design. */
export function projectInjectionKioskSteps(progress: InjectionWorkflowProgress): ProjectedInjectionKioskStep[] {
  return INJECTION_KIOSK_STEPS.map(definition => {
    const step = progress.steps.find(step => step.id === definition.id)!;
    const state: InjectionKioskStepState = !step.applicable ? "skipped"
      : step.id === "sign" && progress.canSign ? "ready"
      : step.completion === "complete" ? "complete"
      : step.concerns.some(issue => issue.severity === "stop") ? "stop"
      : step.concerns.length ? "warning" : "pending";
    return { ...definition, label: step.label, state, stateLabel: step.stateLabel };
  });
}

interface InjectionStepperProps {
  activeStep: InjectionKioskStepId;
  progress: InjectionWorkflowProgress;
  onChange: (step: InjectionKioskStepId) => void;
}

const stateIcon = (
  state: InjectionKioskStepState,
): "check" | "alert" | "note" =>
  state === "complete" || state === "ready"
    ? "check"
    : state === "stop" || state === "warning"
      ? "alert"
      : "note";

export function InjectionStepper({ activeStep, progress, onChange }: InjectionStepperProps) {
  const steps = projectInjectionKioskSteps(progress);

  return (
    <nav class="kiosk-stepper" aria-labelledby="kiosk-steps-title">
      <div class="kiosk-rail-heading">
        <h2 id="kiosk-steps-title">{KIOSK.stepsTitle}</h2>
        <p>{KIOSK.stepsDetail}</p>
      </div>
      <ol>
        {steps.map((step, index) => {
          const current = step.id === activeStep;
          const skipped = step.state === "skipped";
          return (
            <li key={step.id} data-step-state={step.state}>
              <button
                type="button"
                data-kiosk-step={step.id}
                aria-current={current ? "step" : undefined}
                aria-controls={`injection-ledger-panel-${step.tab}`}
                aria-label={`${step.label}: ${step.stateLabel}`}
                disabled={skipped}
                onClick={() => onChange(step.id)}
              >
                <span class="kiosk-step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span class="kiosk-step-copy">
                  <strong>{step.label}</strong>
                  <small>
                    <DesktopIcon name={stateIcon(step.state)} />
                    {step.stateLabel}
                    {step.state === "complete" && progress.steps.find(item => item.id === step.id)?.concerns.length ? " · Advisory" : ""}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
