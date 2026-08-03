import { describe, expect, it, vi } from "vitest";
import {
  createAppStore,
  selectWorkflowPatientMismatch,
} from "../../src/application";

describe("application store", () => {
  it("soft-syncs active patient only into empty workflows", () => {
    const store = createAppStore();
    store.dispatch({
      type: "patient/set-active",
      patient: { name: "Patient One", dob: "01/01/1990" },
    });
    expect(store.getState().workflows.injection.encounter.patient.name).toBe("Patient One");

    store.dispatch({
      type: "encounter/patch",
      workflow: "injection",
      patch: { patient: { name: "Patient Two", dob: "02/02/1992" } },
    });
    store.dispatch({
      type: "patient/set-active",
      patient: { name: "Patient Three", dob: "03/03/1993" },
    });

    expect(store.getState().workflows.injection.encounter.patient.name).toBe("Patient Two");
    expect(store.getState().workflows.uds.encounter.patient.name).toBe("Patient Three");
    expect(selectWorkflowPatientMismatch(store.getState(), "injection")).toBe(true);
  });

  it("can explicitly promote a workflow patient to session context", () => {
    const store = createAppStore();
    store.dispatch({
      type: "encounter/patch",
      workflow: "samples",
      patch: { patient: { name: "Sample Patient", dob: "04/04/1994" } },
    });
    store.dispatch({ type: "patient/use-workflow", workflow: "samples" });
    expect(store.getState().activePatient).toEqual({
      name: "Sample Patient",
      dob: "04/04/1994",
    });
  });

  it("keeps completed encounters read-only and publishes each transition once", () => {
    const store = createAppStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({
      type: "encounter/patch",
      workflow: "forms",
      patch: { provider: "Dr Original" },
    });
    store.dispatch({
      type: "encounter/completed",
      workflow: "forms",
      recordId: "forms-1",
      updatedAt: "2026-07-30T10:00:00.000Z",
    });
    store.dispatch({
      type: "encounter/patch",
      workflow: "forms",
      patch: { provider: "Dr Changed" },
    });

    expect(store.getState().workflows.forms.encounter.provider).toBe("Dr Original");
    expect(store.getState().workflows.forms.lifecycle).toBe("completed");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
