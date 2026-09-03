import type {
  ClinicalEvaluation,
  ClinicalIssue,
  ReadinessState,
} from "../domain/contracts";

export type WorkstationWorkflowId =
  | "home"
  | "administer"
  | "uds"
  | "samples"
  | "forms"
  | "reference"
  | "log"
  | "tms";

export type WorkflowTransactionPhase =
  | "not-started"
  | "entry"
  | "review"
  | "ready-to-attest"
  | "locked";

export type WorkflowTransactionTone =
  | "neutral"
  | "attention"
  | "stop"
  | "success";

export type WorkflowTransactionCommand =
  | "start"
  | "resolve-requirement"
  | "review"
  | "attest"
  | "open-locked-record";

export interface WorkflowTransactionStatus {
  phase: WorkflowTransactionPhase;
  tone: WorkflowTransactionTone;
  nextCommand: WorkflowTransactionCommand;
  firstActionableIssue?: ClinicalIssue;
}

export type WorkflowFieldState =
  | "pending-context"
  | "required"
  | "optional"
  | "not-applicable";

export type WorkflowFieldSource =
  | "CHART"
  | "SESSION"
  | "ENTRY"
  | "LOCAL"
  | "REF"
  | "CALC"
  | "OVR"
  | "LOCKED";

const normalizedCarriedValue = (value?: string) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

/**
 * Preserve the provenance of a chart/session value until staff supersede it;
 * after that, OVR + CHG is more truthful than relabelling it as plain entry.
 */
export function projectCarriedFieldSource(
  value: string | undefined,
  carriedValue: string | undefined,
  carriedSource: Extract<WorkflowFieldSource, "CHART" | "SESSION">,
): WorkflowFieldSource {
  const current = normalizedCarriedValue(value);
  const carried = normalizedCarriedValue(carriedValue);
  if (!current || !carried) return "ENTRY";
  return current === carried ? carriedSource : "OVR";
}

export interface WorkflowFieldPresentation {
  state: WorkflowFieldState;
  source: WorkflowFieldSource;
  fieldCode: string;
  /** An imported, session, or calculated value was explicitly superseded. */
  changed?: boolean;
  changeDetail?: string;
  detail?: string;
  issue?: ClinicalIssue;
}

export type WorkflowLedgerState =
  | "pending"
  | "entry"
  | "complete"
  | "review"
  | "stop"
  | "locked";

/**
 * Shared precedence for the compact transaction ledger shown on typed
 * worksheets. Stops always remain visible, while an untouched transaction is
 * never made to look complete merely because its conditional fields are not
 * active yet.
 */
export function projectWorkflowLedgerState({
  locked = false,
  started = false,
  active = false,
  stopCount = 0,
  warningCount = 0,
  complete = false,
}: {
  locked?: boolean;
  started?: boolean;
  active?: boolean;
  stopCount?: number;
  warningCount?: number;
  complete?: boolean;
}): WorkflowLedgerState {
  if (locked) return "locked";
  if (!started) return "pending";
  if (stopCount > 0) return "stop";
  if (warningCount > 0) return "review";
  if (complete) return "complete";
  if (active) return "entry";
  return "pending";
}

export interface WorkstationReadinessItem {
  id: string;
  label: string;
  detail?: string;
  state: "complete" | "pending" | "warning" | "stop";
}

export type WorkstationRecordLifecycle =
  | "new"
  | "draft"
  | "locked"
  | "saving"
  | "error";

export interface WorkstationRecordLifecycleStatus {
  state: WorkstationRecordLifecycle;
}

export function projectRecordLifecycle({
  locked = false,
  saving = false,
  error = false,
  recordId,
}: {
  locked?: boolean;
  saving?: boolean;
  error?: boolean;
  recordId?: string;
}): WorkstationRecordLifecycleStatus {
  const state: WorkstationRecordLifecycle = error
    ? "error"
    : saving
      ? "saving"
      : locked
        ? "locked"
        : recordId
          ? "draft"
          : "new";
  return { state };
}

const firstIssue = (
  evaluation: ClinicalEvaluation | undefined,
): ClinicalIssue | undefined => evaluation?.stops[0] ?? evaluation?.warnings[0];

export function projectWorkflowTransactionStatus({
  evaluation,
  locked = false,
}: {
  evaluation?: ClinicalEvaluation;
  locked?: boolean;
}): WorkflowTransactionStatus {
  if (locked) {
    return {
      phase: "locked",
      tone: "neutral",
      nextCommand: "open-locked-record",
    };
  }

  const readiness: ReadinessState = evaluation?.readiness ?? "idle";
  if (readiness === "idle") {
    return {
      phase: "not-started",
      tone: "neutral",
      nextCommand: "start",
    };
  }
  if (readiness === "blocked") {
    return {
      phase: "entry",
      tone: "stop",
      nextCommand: "resolve-requirement",
      firstActionableIssue: firstIssue(evaluation),
    };
  }
  if (readiness === "review") {
    return {
      phase: "review",
      tone: "attention",
      nextCommand: "review",
      firstActionableIssue: firstIssue(evaluation),
    };
  }
  return {
    phase: "ready-to-attest",
    tone: "success",
    nextCommand: "attest",
  };
}

export const WORKSTATION_TRANSACTION_CODE: Record<WorkstationWorkflowId, string> = {
  home: "WKL",
  administer: "INJ",
  uds: "UDS",
  samples: "SMP",
  forms: "FRM",
  reference: "REF",
  log: "LOG",
  tms: "TMS",
};
