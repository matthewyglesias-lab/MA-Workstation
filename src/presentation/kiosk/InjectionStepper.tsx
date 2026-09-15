import type { WorkstationReadinessItem } from "../../application/workstation-projection";
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

const READINESS_SUFFIXES: Record<
  Exclude<InjectionKioskStepId, "sign">,
  readonly string[]
> = {
  identify: ["patient-order"],
  "verify-order": ["patient-order", "medication-schedule"],
  prepare: ["product-trace"],
  site: ["administration"],
  administer: ["administration", "safety"],
  response: ["disposition-followup"],
};

const stateLabel = (state: InjectionKioskStepState): string => {
  switch (state) {
    case "complete":
      return KIOSK.stateComplete;
    case "ready":
      return KIOSK.stateReady;
    case "stop":
      return KIOSK.stateRequired;
    case "warning":
      return KIOSK.stateReview;
    case "skipped":
      return KIOSK.stateSkipped;
    case "pending":
    default:
      return KIOSK.statePending;
  }
};

/**
 * Rolls up the already-projected documentation stages. It does not inspect
 * encounter fields or reproduce a clinical rule; the engine-backed Care
 * Checklist remains the only source of completion, warning, and stop state.
 */
function aggregateReadiness(
  readiness: readonly WorkstationReadinessItem[],
  suffixes: readonly string[],
): InjectionKioskStepState {
  const items = readiness.filter((item) =>
    suffixes.some((suffix) => item.id.endsWith(suffix)),
  );
  if (!items.length) return "pending";
  if (items.some((item) => item.state === "stop")) return "stop";
  if (items.some((item) => item.state === "warning")) return "warning";
  if (items.some((item) => item.state === "pending")) return "pending";
  return "complete";
}

export function projectInjectionKioskSteps({
  readiness,
  locked,
  canComplete,
  nonAdministration,
}: {
  readiness: readonly WorkstationReadinessItem[];
  locked: boolean;
  canComplete: boolean;
  nonAdministration: boolean;
}): ProjectedInjectionKioskStep[] {
  return INJECTION_KIOSK_STEPS.map((step) => {
    let state: InjectionKioskStepState;
    if (
      nonAdministration &&
      (step.id === "prepare" || step.id === "site" || step.id === "administer")
    ) {
      state = "skipped";
    } else if (step.id === "sign") {
      state = locked ? "complete" : canComplete ? "ready" : "pending";
    } else {
      state = aggregateReadiness(readiness, READINESS_SUFFIXES[step.id]);
    }
    return { ...step, state, stateLabel: stateLabel(state) };
  });
}

interface InjectionStepperProps {
  activeStep: InjectionKioskStepId;
  readiness: readonly WorkstationReadinessItem[];
  locked: boolean;
  canComplete: boolean;
  nonAdministration: boolean;
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

export function InjectionStepper({
  activeStep,
  readiness,
  locked,
  canComplete,
  nonAdministration,
  onChange,
}: InjectionStepperProps) {
  const steps = projectInjectionKioskSteps({
    readiness,
    locked,
    canComplete,
    nonAdministration,
  });

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
