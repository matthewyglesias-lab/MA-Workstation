import type { PatientIdentity, WorkflowKey } from "../domain/contracts";
import {
  emptyFormsEncounter,
  type FormsEncounter,
} from "../domain/forms";
import {
  emptyInjectionEncounter,
  type InjectionEncounter,
} from "../domain/injection";
import {
  emptySamplesEncounter,
  type SamplesEncounter,
} from "../domain/samples";
import { emptyUdsEncounter, type UdsEncounter } from "../domain/uds";

export type ClinicalWorkflow = "injection" | "uds" | "samples" | "forms";
export type ApplicationWorkflow = WorkflowKey | "closeout" | "future";
export type EncounterLifecycle = "empty" | "started" | "draft" | "completed";

export interface EncounterByWorkflow {
  injection: InjectionEncounter;
  uds: UdsEncounter;
  samples: SamplesEncounter;
  forms: FormsEncounter;
}

export interface WorkflowSession<TEncounter> {
  encounter: TEncounter;
  lifecycle: EncounterLifecycle;
  dirty: boolean;
  recordId?: string;
  updatedAt?: string;
}

export type WorkflowSessions = {
  [K in ClinicalWorkflow]: WorkflowSession<EncounterByWorkflow[K]>;
};

export interface PersistenceStatus {
  state: "idle" | "saving" | "saved" | "error";
  workflow?: ClinicalWorkflow;
  message?: string;
  occurredAt?: string;
}

export interface AppState {
  activeWorkflow: ApplicationWorkflow;
  activePatient: PatientIdentity;
  workflows: WorkflowSessions;
  persistence: PersistenceStatus;
}

export type AppAction =
  | { type: "navigation/open"; workflow: ApplicationWorkflow }
  | { type: "patient/set-active"; patient: PatientIdentity }
  | { type: "patient/use-workflow"; workflow: ClinicalWorkflow }
  | {
      type: "encounter/patch";
      workflow: ClinicalWorkflow;
      patch: Partial<EncounterByWorkflow[ClinicalWorkflow]>;
    }
  | {
      type: "encounter/replace";
      workflow: ClinicalWorkflow;
      encounter: EncounterByWorkflow[ClinicalWorkflow];
      lifecycle?: EncounterLifecycle;
      recordId?: string;
      updatedAt?: string;
    }
  | { type: "encounter/new"; workflow: ClinicalWorkflow }
  | {
      type: "encounter/saved";
      workflow: ClinicalWorkflow;
      recordId?: string;
      updatedAt: string;
    }
  | {
      type: "encounter/completed";
      workflow: ClinicalWorkflow;
      recordId?: string;
      updatedAt: string;
    }
  | { type: "persistence/saving"; workflow: ClinicalWorkflow }
  | {
      type: "persistence/failed";
      workflow: ClinicalWorkflow;
      message: string;
      occurredAt: string;
    }
  | { type: "persistence/clear" };

export type AppListener = (state: AppState, action: AppAction) => void;

const blankEncounter = <K extends ClinicalWorkflow>(workflow: K): EncounterByWorkflow[K] => {
  const factories: {
    [P in ClinicalWorkflow]: () => EncounterByWorkflow[P];
  } = {
    injection: emptyInjectionEncounter,
    uds: emptyUdsEncounter,
    samples: emptySamplesEncounter,
    forms: emptyFormsEncounter,
  };
  return factories[workflow]() as EncounterByWorkflow[K];
};

const withPatient = <T extends { patient: PatientIdentity }>(
  encounter: T,
  patient: PatientIdentity,
): T => ({
  ...encounter,
  patient: { ...patient },
});

const normalizedPatient = (patient: PatientIdentity): PatientIdentity => ({
  name: patient.name.trim().replace(/\s+/g, " "),
  dob: patient.dob.trim(),
});

const isEmptyPatient = (patient: PatientIdentity): boolean =>
  !patient.name.trim() && !patient.dob.trim();

const createSession = <K extends ClinicalWorkflow>(
  workflow: K,
  patient: PatientIdentity,
): WorkflowSession<EncounterByWorkflow[K]> => ({
  encounter: withPatient(blankEncounter(workflow), patient),
  lifecycle: "empty",
  dirty: false,
});

export const createInitialAppState = (): AppState => {
  const activePatient = { name: "", dob: "" };
  return {
    activeWorkflow: "dashboard",
    activePatient,
    workflows: {
      injection: createSession("injection", activePatient),
      uds: createSession("uds", activePatient),
      samples: createSession("samples", activePatient),
      forms: createSession("forms", activePatient),
    },
    persistence: { state: "idle" },
  };
};

const clinicalWorkflow = (workflow: ApplicationWorkflow): workflow is ClinicalWorkflow =>
  workflow === "injection" ||
  workflow === "uds" ||
  workflow === "samples" ||
  workflow === "forms";

const patchSession = <K extends ClinicalWorkflow>(
  session: WorkflowSession<EncounterByWorkflow[K]>,
  patch: Partial<EncounterByWorkflow[K]>,
): WorkflowSession<EncounterByWorkflow[K]> => {
  if (session.lifecycle === "completed") return session;
  const patientPatch = patch.patient as Partial<PatientIdentity> | undefined;
  const encounter = {
    ...session.encounter,
    ...patch,
    ...(patientPatch
      ? { patient: { ...session.encounter.patient, ...patientPatch } }
      : {}),
  } as EncounterByWorkflow[K];
  return {
    ...session,
    encounter,
    lifecycle: session.lifecycle === "empty" ? "started" : session.lifecycle,
    dirty: true,
  };
};

const replaceWorkflowSession = <K extends ClinicalWorkflow>(
  state: AppState,
  workflow: K,
  session: WorkflowSession<EncounterByWorkflow[K]>,
): AppState => ({
  ...state,
  workflows: {
    ...state.workflows,
    [workflow]: session,
  },
});

const syncEmptySessions = (state: AppState, patient: PatientIdentity): WorkflowSessions => {
  const next = { ...state.workflows };
  (Object.keys(next) as ClinicalWorkflow[]).forEach((workflow) => {
    const session = next[workflow];
    if (session.lifecycle === "empty") {
      next[workflow] = {
        ...session,
        encounter: withPatient(session.encounter, patient),
      } as never;
    }
  });
  return next;
};

export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case "navigation/open": {
      let next: AppState = {
        ...state,
        activeWorkflow: action.workflow,
      };
      if (clinicalWorkflow(action.workflow)) {
        const session = next.workflows[action.workflow];
        if (session.lifecycle === "empty" && !isEmptyPatient(next.activePatient)) {
          next = replaceWorkflowSession(next, action.workflow, {
            ...session,
            encounter: withPatient(session.encounter, next.activePatient),
          });
        }
      }
      return next;
    }
    case "patient/set-active": {
      const activePatient = normalizedPatient(action.patient);
      return {
        ...state,
        activePatient,
        workflows: syncEmptySessions(state, activePatient),
      };
    }
    case "patient/use-workflow": {
      const patient = normalizedPatient(state.workflows[action.workflow].encounter.patient);
      return {
        ...state,
        activePatient: patient,
        workflows: syncEmptySessions(state, patient),
      };
    }
    case "encounter/patch": {
      const workflow = action.workflow;
      const session = state.workflows[workflow] as WorkflowSession<
        EncounterByWorkflow[typeof workflow]
      >;
      const patched = patchSession(
        session,
        action.patch as Partial<EncounterByWorkflow[typeof workflow]>,
      );
      return patched === session
        ? state
        : replaceWorkflowSession(state, workflow, patched);
    }
    case "encounter/replace": {
      const workflow = action.workflow;
      return replaceWorkflowSession(state, workflow, {
        encounter: action.encounter as EncounterByWorkflow[typeof workflow],
        lifecycle: action.lifecycle ?? "draft",
        dirty: false,
        ...(action.recordId ? { recordId: action.recordId } : {}),
        ...(action.updatedAt ? { updatedAt: action.updatedAt } : {}),
      });
    }
    case "encounter/new": {
      return replaceWorkflowSession(
        state,
        action.workflow,
        createSession(action.workflow, state.activePatient),
      );
    }
    case "encounter/saved": {
      const session = state.workflows[action.workflow];
      if (session.lifecycle === "completed") return state;
      return {
        ...replaceWorkflowSession(state, action.workflow, {
          ...session,
          lifecycle: "draft",
          dirty: false,
          ...(action.recordId ? { recordId: action.recordId } : {}),
          updatedAt: action.updatedAt,
        } as never),
        persistence: {
          state: "saved",
          workflow: action.workflow,
          occurredAt: action.updatedAt,
        },
      };
    }
    case "encounter/completed": {
      const session = state.workflows[action.workflow];
      return {
        ...replaceWorkflowSession(state, action.workflow, {
          ...session,
          lifecycle: "completed",
          dirty: false,
          ...(action.recordId ? { recordId: action.recordId } : {}),
          updatedAt: action.updatedAt,
        } as never),
        persistence: {
          state: "saved",
          workflow: action.workflow,
          occurredAt: action.updatedAt,
        },
      };
    }
    case "persistence/saving":
      return {
        ...state,
        persistence: { state: "saving", workflow: action.workflow },
      };
    case "persistence/failed":
      return {
        ...state,
        persistence: {
          state: "error",
          workflow: action.workflow,
          message: action.message,
          occurredAt: action.occurredAt,
        },
      };
    case "persistence/clear":
      return { ...state, persistence: { state: "idle" } };
    default:
      return state;
  }
};

export interface AppStore {
  getState(): AppState;
  dispatch(action: AppAction): AppState;
  subscribe(listener: AppListener): () => void;
}

export const createAppStore = (initialState: AppState = createInitialAppState()): AppStore => {
  let state = initialState;
  const listeners = new Set<AppListener>();
  return {
    getState: () => state,
    dispatch: (action) => {
      const next = appReducer(state, action);
      if (next !== state) {
        state = next;
        listeners.forEach((listener) => listener(state, action));
      }
      return state;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const normalizedIdentityValue = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export const patientContextsMismatch = (
  active: PatientIdentity,
  workflowPatient: PatientIdentity,
): boolean => {
  const activeName = normalizedIdentityValue(active.name);
  const workflowName = normalizedIdentityValue(workflowPatient.name);
  const activeDob = normalizedIdentityValue(active.dob);
  const workflowDob = normalizedIdentityValue(workflowPatient.dob);
  return Boolean(
    (activeName && workflowName && activeName !== workflowName) ||
      (activeDob && workflowDob && activeDob !== workflowDob),
  );
};

export const selectWorkflowSession = <K extends ClinicalWorkflow>(
  state: AppState,
  workflow: K,
): WorkflowSession<EncounterByWorkflow[K]> => state.workflows[workflow];

export const selectWorkflowPatientMismatch = (
  state: AppState,
  workflow: ClinicalWorkflow,
): boolean => patientContextsMismatch(state.activePatient, state.workflows[workflow].encounter.patient);

export const selectCanEditWorkflow = (
  state: AppState,
  workflow: ClinicalWorkflow,
): boolean => state.workflows[workflow].lifecycle !== "completed";
