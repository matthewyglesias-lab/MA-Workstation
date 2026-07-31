import { describe, expect, it, vi } from "vitest";
import {
  createClinicalCoordinator,
  selectClinicalMirrorAgreement,
  selectWorkflowPatientMismatch,
  type AnyWorkflowObservation,
  type ClinicalEncounterSource,
  type ClinicalEngineSet,
  type ClinicalWorkflow,
  type WorkflowObservation,
} from "../../src/application";
import {
  FormsEngine,
  InjectionEngine,
  SamplesEngine,
  UdsEngine,
  emptyFormsEncounter,
  emptyInjectionEncounter,
  emptySamplesEncounter,
  emptyUdsEncounter,
  type FormsEncounter,
  type FormsEngineContext,
  type InjectionEncounter,
  type InjectionEngineContext,
  type PatientIdentity,
  type SamplesEncounter,
  type SamplesEngineContext,
  type UdsEncounter,
  type UdsEngineContext,
} from "../../src/domain";

type ObservationMap = {
  [K in ClinicalWorkflow]: WorkflowObservation<K>;
};

const emptyObservations = (): ObservationMap => ({
  injection: {
    workflow: "injection",
    encounter: emptyInjectionEncounter(),
    lifecycle: "empty",
  },
  uds: {
    workflow: "uds",
    encounter: emptyUdsEncounter(),
    lifecycle: "empty",
  },
  samples: {
    workflow: "samples",
    encounter: emptySamplesEncounter(),
    lifecycle: "empty",
  },
  forms: {
    workflow: "forms",
    encounter: emptyFormsEncounter(),
    lifecycle: "empty",
  },
});

class MutableEncounterSource implements ClinicalEncounterSource {
  readonly observations = emptyObservations();
  readonly applied: Array<{ workflow: ClinicalWorkflow; patient: PatientIdentity }> =
    [];

  read(workflow: ClinicalWorkflow): AnyWorkflowObservation {
    return this.observations[workflow];
  }

  applyPatientIfEmpty(
    workflow: ClinicalWorkflow,
    patient: PatientIdentity,
  ): boolean {
    const observation = this.observations[workflow];
    if (
      observation.lifecycle !== "empty" ||
      observation.encounter.patient.name ||
      observation.encounter.patient.dob
    ) {
      return false;
    }
    observation.encounter.patient = { ...patient };
    this.applied.push({ workflow, patient: { ...patient } });
    return true;
  }
}

const observedEngines = () => {
  const injection = vi.fn(
    (encounter: InjectionEncounter, context: InjectionEngineContext) =>
      InjectionEngine.evaluate(encounter, context),
  );
  const uds = vi.fn((encounter: UdsEncounter, context: UdsEngineContext) =>
    UdsEngine.evaluate(encounter, context),
  );
  const samples = vi.fn(
    (encounter: SamplesEncounter, context: SamplesEngineContext) =>
      SamplesEngine.evaluate(encounter, context),
  );
  const forms = vi.fn(
    (encounter: FormsEncounter, context: FormsEngineContext) =>
      FormsEngine.evaluate(encounter, context),
  );
  const engines = {
    injection: { evaluate: injection },
    uds: { evaluate: uds },
    samples: { evaluate: samples },
    forms: { evaluate: forms },
  } satisfies ClinicalEngineSet;
  return { engines, injection, uds, samples, forms };
};

describe("clinical coordinator", () => {
  it("labels aggregate shadow agreement honestly and preserves disagreement", () => {
    const evaluation = {
      workflow: "injection" as const,
      readiness: "ready" as const,
      stops: [],
      warnings: [],
      recommendations: [],
      calculatedDates: {},
      output: {},
    };
    const aggregateMatch = selectClinicalMirrorAgreement(evaluation, [
      "complete",
      "complete",
    ]);
    expect(aggregateMatch).toMatchObject({
      agrees: true,
      state: "complete",
      engineReadiness: "ready",
    });
    expect(aggregateMatch?.detail).toContain("aggregate readiness matches");
    expect(aggregateMatch?.detail).toContain("field-level parity is not asserted");

    const disagreement = selectClinicalMirrorAgreement(
      { ...evaluation, readiness: "blocked" },
      ["complete"],
    );
    expect(disagreement).toMatchObject({
      agrees: false,
      state: "stop",
      engineReadiness: "blocked",
    });
    expect(disagreement?.detail).toContain("differs");
  });

  it("normalizes every workflow into the store and evaluates all four engines", () => {
    const source = new MutableEncounterSource();
    const spies = observedEngines();
    const coordinator = createClinicalCoordinator({
      source,
      engines: spies.engines,
    });

    const first = coordinator.synchronize();
    expect(first.state.workflows.injection.lifecycle).toBe("empty");
    expect(first.evaluations.injection?.workflow).toBe("injection");
    expect(first.evaluations.uds?.workflow).toBe("uds");
    expect(first.evaluations.samples?.workflow).toBe("samples");
    expect(first.evaluations.forms?.workflow).toBe("forms");
    expect(spies.injection).toHaveBeenCalledTimes(1);
    expect(spies.uds).toHaveBeenCalledTimes(1);
    expect(spies.samples).toHaveBeenCalledTimes(1);
    expect(spies.forms).toHaveBeenCalledTimes(1);
    expect(spies.forms.mock.calls[0]?.[1]).toEqual({
      requireProviderApprovalForRelease: false,
    });

    source.observations.injection = {
      workflow: "injection",
      lifecycle: "started",
      encounter: {
        ...emptyInjectionEncounter(),
        patient: { name: "Alpha, Patient", dob: "01/02/1990" },
        orderingProvider: "Dr Test",
      },
    };
    const next = coordinator.synchronize();

    expect(next.state.workflows.injection.lifecycle).toBe("started");
    expect(next.state.workflows.injection.encounter.orderingProvider).toBe(
      "Dr Test",
    );
    expect(next.state.activePatient.name).toBe("Alpha, Patient");
    expect(spies.injection).toHaveBeenCalledTimes(2);
    expect(spies.uds).toHaveBeenCalledTimes(2);
    expect(spies.samples).toHaveBeenCalledTimes(2);
    expect(spies.forms).toHaveBeenCalledTimes(2);
  });

  it("inherits patient context only into empty workflows and preserves mismatches", () => {
    const source = new MutableEncounterSource();
    source.observations.injection = {
      workflow: "injection",
      lifecycle: "started",
      encounter: {
        ...emptyInjectionEncounter(),
        patient: { name: "Alpha, Patient", dob: "01/02/1990" },
        orderingProvider: "Dr Alpha",
      },
    };
    const coordinator = createClinicalCoordinator({ source });

    coordinator.synchronize();
    expect(coordinator.getSnapshot().state.activePatient).toEqual({
      name: "Alpha, Patient",
      dob: "01/02/1990",
    });
    expect(
      coordinator.getSnapshot().state.workflows.samples.encounter.patient,
    ).toEqual({
      name: "Alpha, Patient",
      dob: "01/02/1990",
    });

    coordinator.navigate("samples");
    expect(source.applied).toEqual([
      {
        workflow: "samples",
        patient: { name: "Alpha, Patient", dob: "01/02/1990" },
      },
    ]);

    source.observations.samples = {
      workflow: "samples",
      lifecycle: "started",
      encounter: {
        ...emptySamplesEncounter(),
        patient: { name: "Bravo, Patient", dob: "03/04/1992" },
        prescriber: "Dr Bravo",
      },
    };
    coordinator.synchronize(["samples"]);

    expect(coordinator.getSnapshot().state.activePatient.name).toBe(
      "Alpha, Patient",
    );
    expect(
      selectWorkflowPatientMismatch(
        coordinator.getSnapshot().state,
        "samples",
      ),
    ).toBe(true);

    coordinator.navigate("injection");
    expect(source.applied.map(({ workflow }) => workflow)).not.toContain(
      "injection",
    );
    expect(source.observations.injection.encounter.patient.name).toBe(
      "Alpha, Patient",
    );

    coordinator.useWorkflowPatient("samples");
    expect(coordinator.getSnapshot().state.activePatient).toEqual({
      name: "Bravo, Patient",
      dob: "03/04/1992",
    });
    expect(
      coordinator.getSnapshot().state.workflows.injection.encounter.patient
        .name,
    ).toBe("Alpha, Patient");
    expect(
      coordinator.getSnapshot().state.workflows.uds.encounter.patient.name,
    ).toBe("Bravo, Patient");

    coordinator.navigate("uds");
    expect(source.applied.at(-1)).toEqual({
      workflow: "uds",
      patient: { name: "Bravo, Patient", dob: "03/04/1992" },
    });
  });
});
