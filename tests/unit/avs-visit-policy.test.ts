import { describe, expect, it } from "vitest";
import {
  AVS_CLINIC_HOURS, AVS_ROUTINE_RETURN_WINDOW,
  buildInjectionAvsModel, type InjectionAvsInput,
} from "../../src/domain/injection-avs-content";
import { buildInjectionAvsModel as originalModel } from "../../src/domain/injection-avs-guidance";
import { buildInjectionAvsHtml } from "../../src/domain/injection-avs-render";

const fixture = (patch: Partial<InjectionAvsInput> = {}): InjectionAvsInput => ({
  patientName: "AVS Policy, Synthetic", patientDob: "1990-01-02",
  recordNumber: "SYNTHETIC-AVS", orderingProvider: "Test Provider",
  administeredBy: "Test MA", medicationKey: "sustenna",
  medicationName: "Invega Sustenna", genericName: "paliperidone palmitate",
  dose: "156 mg", route: "IM", site: "R deltoid", intervalKey: "q4wk",
  administrationDate: "2026-10-01", administrationTime: "10:00",
  nextDoseDate: "2026-10-29", lot: "TEST-LOT", expiration: "2027-12",
  responseLabel: "Tolerated well", reason: "scheduled", initiationProtocol: "",
  day1Date: "", clinicPhone: "(909) 887-6222", dispositionKind: "administered",
  ...patch,
});

describe("clinic-approved AVS visit instructions", () => {
  it.each(["sustenna", "uzedy", "vivitrol", "maintena", "other"])(
    "%s prints new hours and a clinic-confirmed routine window", (medicationKey) => {
      const input = fixture({ medicationKey });
      const model = buildInjectionAvsModel(input);
      const html = buildInjectionAvsHtml(input);
      expect(model.nextDose.contactLines.find(r => r.label === "CLINIC HOURS")?.value).toBe(AVS_CLINIC_HOURS);
      expect(model.nextDose.notes.join(" ")).toContain(AVS_ROUTINE_RETURN_WINDOW);
      expect(model.timeline.find(s => s.state === "due")?.detail).toEqual(model.nextDose.notes);
      expect(html).toContain("8:30 AM - 5:00 PM");
      expect(html).not.toContain("9:30 AM - 4:30 PM");
      expect(html).toContain("With clinic confirmation");
      expect(html).toContain("3 days before or 3 days after");
      expect(html).not.toContain("call before that day, not after");
    },
  );

  it.each<Partial<InjectionAvsInput>>([
    { reason: "initiation", initiationProtocol: "sustenna-day1" },
    { reason: "scheduled", initiationProtocol: "sustenna-day8", day1Date: "2026-09-24" },
    { reason: "reinit" }, { reason: "loading" }, { reason: "prn" },
    { reason: "" }, { nextDoseDate: "" }, { nextDoseDate: "invalid" },
    { dispositionKind: "held" }, { dispositionKind: "escalated" },
    { dispositionKind: "provider" }, { intervalKey: "once", medicationKey: "initio" },
  ])("does not offer a routine window for an exception: %j", (patch) => {
    const input = fixture(patch);
    const model = buildInjectionAvsModel(input);
    const old = originalModel(input);
    expect(model.nextDose.notes).toEqual(old.nextDose.notes);
    expect(model.timeline).toEqual(old.timeline);
    expect(buildInjectionAvsHtml(input)).not.toContain("3 days before or 3 days after");
    expect(buildInjectionAvsHtml(input)).toContain("8:30 AM - 5:00 PM");
  });

  it("retains cold-chain calls and all medication-specific information", () => {
    for (const medicationKey of ["sustenna", "uzedy", "vivitrol", "maintena", "aristada"]) {
      const input = fixture({ medicationKey });
      const model = buildInjectionAvsModel(input);
      const old = originalModel(input);
      expect(model.nextDose.dateLong).toBe(old.nextDose.dateLong);
      expect(model.nextDose.firmness).toBe(old.nextDose.firmness);
      expect(model.administration).toEqual(old.administration);
      expect(model.identity).toEqual(old.identity);
      expect(model.schedule).toEqual(old.schedule);
      expect(model.leadAlerts).toEqual(old.leadAlerts);
      expect(model.emergency).toEqual(old.emergency);
      expect(model.blocks.filter(b => b.kind !== "call-clinic"))
        .toEqual(old.blocks.filter(b => b.kind !== "call-clinic"));
    }
  });
});
