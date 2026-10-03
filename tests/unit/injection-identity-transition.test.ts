import { describe, it, expect } from "vitest";
import { applyInjectionIdentityTransition } from "../../src/application/injection-identity-transition";
import { emptyInjectionEncounter } from "../../src/domain/injection";
import { emptyAvsAppointment } from "../../src/domain/avs-appointment";

const source = () => ({ ...emptyInjectionEncounter(),
  patient: { name: "Same, Synthetic", dob: "01/02/1990" },
  avsAppointment: { ...emptyAvsAppointment(), mode: "details" as const,
    provider: "Patient A provider", date: "2026-11-03", time: "10:30" },
});
describe("current encounter identity ownership", () => {
  it.each([
    { name: "Other, Synthetic", dob: "01/02/1990" },
    { name: "Same, Synthetic", dob: "01/03/1990" },
    { name: "", dob: "01/02/1990" },
    { name: "Same, Synthetic", dob: "" },
  ])("clears reminder for a genuine identity edit: %j", patient => {
    const previous = source();
    const candidate = { ...previous, patient };
    const next = applyInjectionIdentityTransition(previous, candidate);
    expect(next.avsAppointment).toEqual(emptyAvsAppointment());
    expect(next.patient).toEqual(patient);
    expect(previous.avsAppointment.provider).toBe("Patient A provider");
    expect({ ...next, avsAppointment: candidate.avsAppointment }).toEqual(candidate);
  });
  it("preserves same-identity reminder edits without reconstructing the encounter", () => {
    const previous = source();
    const candidate = { ...previous, patient: { ...previous.patient },
      avsAppointment: { ...previous.avsAppointment, time: "11:30" } };
    expect(applyInjectionIdentityTransition(previous, candidate)).toBe(candidate);
  });
  it("does not inject appointment defaults into a historical same-identity edit", () => {
    const { avsAppointment: _a, ...previous } = source();
    const candidate = { ...previous, response: { kind: "well" as const } };
    expect(applyInjectionIdentityTransition(previous, candidate)).toBe(candidate);
    expect(candidate).not.toHaveProperty("avsAppointment");
  });
});
