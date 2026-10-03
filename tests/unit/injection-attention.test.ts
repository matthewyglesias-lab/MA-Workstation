import { describe, expect, it } from "vitest";
import { emptyInjectionEncounter, InjectionEngine, type InjectionEncounter } from "../../src/domain/injection";
import type { ClinicalIssue } from "../../src/domain/contracts";
import { projectInjectionWorkflowProgress } from "../../src/application/injection-workflow-progress";
import { injectionAttention, partitionInjectionAttention, stepAttention } from "../../src/presentation/injection-attention";
import { projectInjectionKioskSteps } from "../../src/presentation/kiosk/InjectionStepper";

const finding = (code: string, field?: string, severity: ClinicalIssue["severity"] = "stop"): ClinicalIssue =>
  ({ code, field, severity, message: "Message wording does not classify severity" });
const documented = (): InjectionEncounter => ({ ...emptyInjectionEncounter(),
  patient: { name: "Attention, Synthetic", dob: "01/02/1990" }, medicationKey: "haldol", dose: "100 mg",
  route: "IM", site: "L deltoid", intervalKey: "q4wk", reason: "scheduled", priorDoseDate: "2026-09-04",
  priorSite: "R deltoid", administrationDate: "2026-10-02", administrationTime: "09:15", nextDoseDate: "2026-10-30",
  orderingProvider: "Synthetic Provider", administeredBy: "Synthetic Staff", allergies: "NKDA verified in active record",
  traceability: { ndc: "12345-6789-01", lot: "SYNTHETIC", expiration: "2027-12" }, response: { kind: "well" },
  attestations: { id2: true, rights: true, allergy: true, consent: true, screen: true, hygiene: true },
  verifications: { visualInspection: true, deepZtrack: true }, acuteSafetyScreenConfirmed: true,
  disposition: { kind: "administered" }, details: { productSource: "Clinic sample", volume: "1", volumeUnit: "mL" },
});
const project = (encounter: InjectionEncounter, signed = false) => {
  const evaluation = InjectionEngine.evaluate(encounter, {});
  const canSign = evaluation.output.recordStatus === "ready-to-lock";
  return { evaluation, progress: projectInjectionWorkflowProgress({ encounter, evaluation, canSign, canSave: true,
    lifecycle: signed ? "locked" : "draft", dirty: !signed }) };
};

describe("calm documentation attention is not a clinical permission", () => {
  it.each([
    ["patient.name", "patient.name"], ["patient.dob", "patient.dob"], ["reason.required", "reason"],
    ["medication.required", "medicationKey"], ["dose.required", "dose"], ["route.required", "route"],
    ["site.required", "site"], ["interval.required", "intervalKey"], ["order.provider", "orderingProvider"],
    ["administration.time", "administrationTime"], ["administration.staff", "administeredBy"],
    ["response.required", "response"], ["trace.ndc", "traceability.ndc"], ["trace.lot", "traceability.lot"],
    ["trace.expiration", "traceability.expiration"], ["trace.product-source", "details.productSource"],
  ])("requires explicit missing-field evidence for %s", (code, field) => {
    const issue = finding(code, field);
    expect(injectionAttention(issue, [field])).toBe("requirement");
    expect(injectionAttention(issue, [])).toBe("stop");
    expect(injectionAttention(finding(code, "different.field"), [field])).toBe("stop");
    expect(issue.severity).toBe("stop");
  });
  it.each(["trace.expired", "administration.volume-max", "timing.outside-window", "future.required", "safety.screen", "allergy.status", "initiation.plan"])("never quiets a clinical/unknown issue %s", code => {
    expect(injectionAttention(finding(code, "dose"), ["dose"])).toBe("stop");
  });
  it("never classifies by reassuring or alarming prose", () => {
    expect(injectionAttention({ ...finding("future.required", "response"), message: "Just enter a response." }, ["response"])).toBe("stop");
    expect(injectionAttention({ ...finding("response.required", "response"), message: "Different translated wording." }, ["response"])).toBe("requirement");
    expect(injectionAttention(finding("response.required", "response", "warning"), ["response"])).toBe("warning");
  });
  it("keeps the actual missing-response stop and sign gate but removes the false alert costume", () => {
    const encounter = documented(); encounter.response = { kind: "" };
    const { progress, evaluation } = project(encounter);
    const before = JSON.stringify({ encounter, progress, evaluation });
    const partition = partitionInjectionAttention(progress);
    expect(partition.requirements.some(issue => issue.code === "response.required")).toBe(true);
    expect(evaluation.stops.some(issue => issue.code === "response.required")).toBe(true);
    expect(progress.canSign).toBe(false);
    expect(projectInjectionKioskSteps(progress).find(step => step.id === "response")?.state).toBe("pending");
    expect(JSON.stringify({ encounter, progress, evaluation })).toBe(before);
  });
  it("exposes entered invalid values, clinical advisories and unfamiliar stops once without filtering them", () => {
    const encounter = documented(); encounter.details = { ...encounter.details, volume: "4" }; encounter.site = encounter.priorSite;
    const { progress } = project(encounter);
    const extra = finding("future.named.issue", "future.field"); progress.concerns.push(extra);
    const partition = partitionInjectionAttention(progress);
    expect(partition.concerns.map(issue => issue.code)).toEqual(expect.arrayContaining(["administration.volume-max", "site.repeated", "future.named.issue"]));
    expect([...partition.requirements, ...partition.concerns]).toHaveLength(progress.concerns.length);
    expect(progress.canSign).toBe(false);
  });
  it("does not erase a permitted advisory or alter a signed lifecycle", () => {
    const encounter = documented(); encounter.priorSite = encounter.site;
    const { progress } = project(encounter);
    expect(progress.canSign).toBe(true);
    expect(partitionInjectionAttention(progress).concerns.some(issue => issue.code === "site.repeated")).toBe(true);
    const signed = project(encounter, true).progress;
    expect(signed.headline).toBe("Signed locally");
    expect(projectInjectionKioskSteps(signed).find(step => step.id === "sign")?.state).toBe("complete");
  });
  it("gives a clinical stop precedence over a routine missing field in the same step", () => {
    const { progress } = project(documented()); const step = progress.steps[0]!;
    step.missingFields = ["patient.name"]; step.concerns = [finding("patient.name", "patient.name"), finding("future.check", "patient.name")];
    expect(stepAttention(step)).toBe("stop");
  });
});
