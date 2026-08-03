import type {
  ClinicalEngine,
  ClinicalEvaluation,
  PatientIdentity,
  ReadinessState,
} from "../domain/contracts";
import {
  FormsEngine,
  type FormsEncounter,
  type FormsEngineContext,
  type FormsEvaluationOutput,
} from "../domain/forms";
import {
  InjectionEngine,
  type InjectionEncounter,
  type InjectionEngineContext,
  type InjectionEvaluationOutput,
} from "../domain/injection";
import {
  SamplesEngine,
  type SamplesEncounter,
  type SamplesEngineContext,
  type SamplesEvaluationOutput,
} from "../domain/samples";
import {
  UdsEngine,
  type UdsEncounter,
  type UdsEngineContext,
  type UdsEvaluationOutput,
} from "../domain/uds";
import {
  createAppStore,
  type AppState,
  type AppStore,
  type ApplicationWorkflow,
  type ClinicalWorkflow,
  type EncounterByWorkflow,
  type EncounterLifecycle,
} from "./store";

export const CLINICAL_WORKFLOWS = [
  "injection",
  "uds",
  "samples",
  "forms",
] as const satisfies readonly ClinicalWorkflow[];

export interface ClinicalEvaluationByWorkflow {
  injection: ClinicalEvaluation<InjectionEvaluationOutput>;
  uds: ClinicalEvaluation<UdsEvaluationOutput>;
  samples: ClinicalEvaluation<SamplesEvaluationOutput>;
  forms: ClinicalEvaluation<FormsEvaluationOutput>;
}

export interface ClinicalEngineSet {
  injection: ClinicalEngine<
    InjectionEncounter,
    InjectionEngineContext,
    InjectionEvaluationOutput
  >;
  uds: ClinicalEngine<UdsEncounter, UdsEngineContext, UdsEvaluationOutput>;
  samples: ClinicalEngine<
    SamplesEncounter,
    SamplesEngineContext,
    SamplesEvaluationOutput
  >;
  forms: ClinicalEngine<FormsEncounter, FormsEngineContext, FormsEvaluationOutput>;
}

export interface WorkflowObservation<K extends ClinicalWorkflow = ClinicalWorkflow> {
  workflow: K;
  encounter: EncounterByWorkflow[K];
  lifecycle: EncounterLifecycle;
  recordId?: string;
  updatedAt?: string;
}

export type AnyWorkflowObservation = {
  [K in ClinicalWorkflow]: WorkflowObservation<K>;
}[ClinicalWorkflow];

export interface ClinicalEncounterSource {
  read(workflow: ClinicalWorkflow): AnyWorkflowObservation;
  applyPatientIfEmpty(workflow: ClinicalWorkflow, patient: PatientIdentity): boolean;
}

export interface ClinicalCoordinatorSnapshot {
  state: AppState;
  evaluations: Partial<ClinicalEvaluationByWorkflow>;
  revision: number;
}

export type ClinicalCoordinatorListener = (
  snapshot: ClinicalCoordinatorSnapshot,
) => void;

export interface ClinicalCoordinator {
  readonly store: AppStore;
  getSnapshot(): ClinicalCoordinatorSnapshot;
  synchronize(workflows?: readonly ClinicalWorkflow[]): ClinicalCoordinatorSnapshot;
  navigate(workflow: ApplicationWorkflow): ClinicalCoordinatorSnapshot;
  setActivePatient(patient: PatientIdentity): ClinicalCoordinatorSnapshot;
  useWorkflowPatient(workflow: ClinicalWorkflow): ClinicalCoordinatorSnapshot;
  subscribe(listener: ClinicalCoordinatorListener): () => void;
}

export interface CreateClinicalCoordinatorOptions {
  source: ClinicalEncounterSource;
  store?: AppStore;
  engines?: Partial<ClinicalEngineSet>;
}

const DEFAULT_ENGINES: ClinicalEngineSet = {
  injection: InjectionEngine,
  uds: UdsEngine,
  samples: SamplesEngine,
  forms: FormsEngine,
};

const isClinicalWorkflow = (
  workflow: ApplicationWorkflow,
): workflow is ClinicalWorkflow =>
  workflow === "injection" ||
  workflow === "uds" ||
  workflow === "samples" ||
  workflow === "forms";

const patientIsEmpty = (patient: PatientIdentity): boolean =>
  !patient.name.trim() && !patient.dob.trim();

const patientsEqual = (
  left: PatientIdentity,
  right: PatientIdentity,
): boolean =>
  left.name.trim().replace(/\s+/g, " ").toLocaleLowerCase() ===
    right.name.trim().replace(/\s+/g, " ").toLocaleLowerCase() &&
  left.dob.trim().toLocaleLowerCase() === right.dob.trim().toLocaleLowerCase();

const jsonEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const withInheritedPatient = <K extends ClinicalWorkflow>(
  observation: WorkflowObservation<K>,
  patient: PatientIdentity,
): WorkflowObservation<K> => {
  if (
    observation.lifecycle !== "empty" ||
    !patientIsEmpty(observation.encounter.patient) ||
    patientIsEmpty(patient)
  ) {
    return observation;
  }
  return {
    ...observation,
    encounter: {
      ...observation.encounter,
      patient: { ...patient },
    },
  };
};

const evaluateWorkflow = <K extends ClinicalWorkflow>(
  workflow: K,
  encounter: EncounterByWorkflow[K],
  engines: ClinicalEngineSet,
): ClinicalEvaluationByWorkflow[K] => {
  switch (workflow) {
    case "injection":
      return engines.injection.evaluate(encounter as InjectionEncounter, {
        previousSite: (encounter as InjectionEncounter).priorSite,
      }) as ClinicalEvaluationByWorkflow[K];
    case "uds":
      return engines.uds.evaluate(
        encounter as UdsEncounter,
        {},
      ) as ClinicalEvaluationByWorkflow[K];
    case "samples":
      return engines.samples.evaluate(
        encounter as SamplesEncounter,
        {},
      ) as ClinicalEvaluationByWorkflow[K];
    case "forms":
      // The compatibility form has no distinct provider-approval checkbox.
      // During parity cutover the engine may analyze the encounter, but it must
      // not create a stricter release gate that legacy staff cannot satisfy.
      return engines.forms.evaluate(encounter as FormsEncounter, {
        requireProviderApprovalForRelease: false,
      }) as ClinicalEvaluationByWorkflow[K];
  }
};

export function createClinicalCoordinator({
  source,
  store = createAppStore(),
  engines: engineOverrides = {},
}: CreateClinicalCoordinatorOptions): ClinicalCoordinator {
  const engines: ClinicalEngineSet = {
    ...DEFAULT_ENGINES,
    ...engineOverrides,
  };
  const evaluations: Partial<ClinicalEvaluationByWorkflow> = {};
  const listeners = new Set<ClinicalCoordinatorListener>();
  let revision = 0;
  let activePatientSource: ClinicalWorkflow | undefined;

  const snapshot = (): ClinicalCoordinatorSnapshot => ({
    state: store.getState(),
    evaluations: { ...evaluations },
    revision,
  });

  const publish = (): ClinicalCoordinatorSnapshot => {
    revision += 1;
    const next = snapshot();
    listeners.forEach((listener) => listener(next));
    return next;
  };

  const synchronize = (
    workflows: readonly ClinicalWorkflow[] = CLINICAL_WORKFLOWS,
  ): ClinicalCoordinatorSnapshot => {
    const observations = new Map<ClinicalWorkflow, AnyWorkflowObservation>();
    workflows.forEach((workflow) => observations.set(workflow, source.read(workflow)));

    const activeBefore = store.getState().activePatient;
    const preferredWorkflow = store.getState().activeWorkflow;
    const patientCandidates = [
      ...(isClinicalWorkflow(preferredWorkflow) ? [preferredWorkflow] : []),
      ...workflows.filter((workflow) => workflow !== preferredWorkflow),
    ];
    const patientCandidate = patientCandidates.find((workflow) => {
      const observation = observations.get(workflow);
      return observation && !patientIsEmpty(observation.encounter.patient);
    });
    if (patientCandidate) {
      const observedPatient = observations.get(patientCandidate)!.encounter.patient;
      if (
        patientIsEmpty(activeBefore) ||
        (activePatientSource === patientCandidate &&
          !patientsEqual(activeBefore, observedPatient))
      ) {
        store.dispatch({ type: "patient/set-active", patient: observedPatient });
        activePatientSource = patientCandidate;
      }
    }

    let changed = false;
    workflows.forEach((workflow) => {
      const rawObservation = observations.get(workflow);
      if (!rawObservation) return;
      const observation = withInheritedPatient(
        rawObservation as WorkflowObservation<typeof workflow>,
        store.getState().activePatient,
      );
      const current = store.getState().workflows[workflow];
      if (
        !jsonEqual(current.encounter, observation.encounter) ||
        current.lifecycle !== observation.lifecycle ||
        current.recordId !== observation.recordId ||
        current.updatedAt !== observation.updatedAt
      ) {
        const before = store.getState();
        store.dispatch({
          type: "encounter/replace",
          workflow,
          encounter: observation.encounter,
          lifecycle: observation.lifecycle,
          recordId: observation.recordId,
          updatedAt: observation.updatedAt,
        });
        changed ||= store.getState() !== before;
      }

      const evaluation = evaluateWorkflow(
        workflow,
        observation.encounter,
        engines,
      );
      if (!jsonEqual(evaluations[workflow], evaluation)) {
        (evaluations as Record<ClinicalWorkflow, ClinicalEvaluationByWorkflow[ClinicalWorkflow]>)[
          workflow
        ] = evaluation;
        changed = true;
      }
    });

    return changed ? publish() : snapshot();
  };

  const navigate = (
    workflow: ApplicationWorkflow,
  ): ClinicalCoordinatorSnapshot => {
    const before = store.getState();
    store.dispatch({ type: "navigation/open", workflow });
    let changed = store.getState() !== before;
    if (isClinicalWorkflow(workflow)) {
      const session = store.getState().workflows[workflow];
      if (
        session.lifecycle === "empty" &&
        !patientIsEmpty(store.getState().activePatient) &&
        source.applyPatientIfEmpty(workflow, store.getState().activePatient)
      ) {
        const synchronized = synchronize([workflow]);
        changed = false;
        return synchronized;
      }
    }
    return changed ? publish() : snapshot();
  };

  const setActivePatient = (
    patient: PatientIdentity,
  ): ClinicalCoordinatorSnapshot => {
    const before = store.getState();
    activePatientSource = undefined;
    store.dispatch({ type: "patient/set-active", patient });
    return store.getState() !== before ? publish() : snapshot();
  };

  const useWorkflowPatient = (
    workflow: ClinicalWorkflow,
  ): ClinicalCoordinatorSnapshot => {
    const before = store.getState();
    activePatientSource = workflow;
    store.dispatch({ type: "patient/use-workflow", workflow });
    return store.getState() !== before ? publish() : snapshot();
  };

  return {
    store,
    getSnapshot: snapshot,
    synchronize,
    navigate,
    setActivePatient,
    useWorkflowPatient,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const selectClinicalEvaluation = <K extends ClinicalWorkflow>(
  snapshot: ClinicalCoordinatorSnapshot,
  workflow: K,
): ClinicalEvaluationByWorkflow[K] | undefined =>
  snapshot.evaluations[workflow] as ClinicalEvaluationByWorkflow[K] | undefined;

export type LegacyReadinessState = "complete" | "pending" | "warning" | "stop";

export interface ClinicalMirrorAgreement {
  agrees: boolean;
  state: LegacyReadinessState;
  engineReadiness: ReadinessState;
  detail: string;
}

const legacySummaryState = (
  states: readonly LegacyReadinessState[],
): LegacyReadinessState => {
  if (states.includes("stop")) return "stop";
  if (states.includes("warning")) return "warning";
  if (states.length > 0 && states.every((state) => state === "complete")) {
    return "complete";
  }
  return "pending";
};

const engineDisplayState = (
  readiness: ReadinessState,
): LegacyReadinessState =>
  readiness === "blocked"
    ? "stop"
    : readiness === "review"
      ? "warning"
      : readiness === "ready"
        ? "complete"
        : "pending";

export const selectClinicalMirrorAgreement = (
  evaluation: ClinicalEvaluation | undefined,
  legacyStates: readonly LegacyReadinessState[],
): ClinicalMirrorAgreement | undefined => {
  if (!evaluation || legacyStates.length === 0) return undefined;
  const state = engineDisplayState(evaluation.readiness);
  const agrees = state === legacySummaryState(legacyStates);
  return {
    agrees,
    state,
    engineReadiness: evaluation.readiness,
    detail: agrees
      ? "Typed engine aggregate readiness matches the compatibility workflow; field-level parity is not asserted."
      : "Typed engine aggregate readiness differs and remains advisory during parity cutover.",
  };
};
