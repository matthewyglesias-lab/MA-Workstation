import { describe, it, expect } from "vitest";
import { InjectionEngine, emptyInjectionEncounter, emptyInjectionInitiation, injectionVerificationSatisfied, type InjectionEncounter } from "../../src/domain/injection";
import { projectInjectionWorkflowProgress, injectionStepForIssue, injectionTabForField } from "../../src/application/injection-workflow-progress";
import { firstActionableClinicalIssue } from "../../src/application/readiness-projection";
import { documentedInjection } from "./injection-progress-fixture";
const project = (encounter: InjectionEncounter, options: Partial<Parameters<typeof projectInjectionWorkflowProgress>[0]> = {}) =>
  projectInjectionWorkflowProgress({encounter, evaluation:InjectionEngine.evaluate(encounter,{today:"2026-10-02"}),canSign:false,canSave:true,lifecycle:"new",...options});
const step = (model: ReturnType<typeof project>, id: string) => model.steps.find(step=>step.id===id)!;

describe("positive injection documentation progress and distinct action capability", () => {
  it("does not complete untouched work or treat the current location as evidence", () => {
    const model = project(emptyInjectionEncounter());
    expect(model.completed).toBe(0);
    expect(model.steps.every(step=>step.completion!=="complete")).toBe(true);
    expect(model.headline).toBe("Documentation in progress");
  });
  it("keeps entered identity independent of missing order/provider/response", () => {
    const encounter = {...emptyInjectionEncounter(),patient:{name:"Synthetic",dob:"01/02/1990"}};
    expect(step(project(encounter),"identify").completion).toBe("complete");
    const selected = {...encounter,medicationKey:"haldol" as const};
    expect(step(project(selected),"identify").completion).toBe("in-progress");
    expect(step(project(selected),"identify").missingFields).toContain("attestations.id2");
    selected.attestations={id2:true};
    expect(step(project(selected),"identify").completion).toBe("complete");
    expect(step(project(selected),"verify-order").missingFields).toContain("orderingProvider");
  });
  it("a real response.required issue belongs only to Response and does not unstart earlier work", () => {
    const encounter = documentedInjection(); encounter.response={kind:""};
    const model=project(encounter);
    expect(model.concerns.filter(issue=>issue.severity==="stop").map(issue=>issue.code)).toEqual(["response.required"]);
    for(const id of ["identify","verify-order","prepare","site","administer"]) expect(step(model,id).completion).toBe("complete");
    expect(step(model,"response").concerns.map(issue=>issue.code)).toContain("response.required");
    expect(step(model,"site").concerns).not.toContainEqual(expect.objectContaining({code:"response.required"}));
  });
  it("does not substitute lot/NDC for the applicable preparation acknowledgement", () => {
    const encounter = documentedInjection(); encounter.attestations.hygiene=false;
    const model=project(encounter);expect(step(model,"prepare").completion).toBe("in-progress");
    expect(step(model,"prepare").missingFields).toContain("attestations.hygiene");
  });
  it("preserves a permitted repeated-site advisory alongside recorded steps and actual signing permission", () => {
    const encounter = documentedInjection(); encounter.priorSite=encounter.site;
    const evaluation=InjectionEngine.evaluate(encounter,{today:"2026-10-02"});
    expect(evaluation.output.recordStatus).toBe("ready-to-lock"); expect(evaluation.stops).toHaveLength(0);
    const model=project(encounter,{evaluation,canSign:true,lifecycle:"draft"});
    expect(model.headline).toBe("Ready to sign"); expect(model.completed).toBe(6);
    expect(step(model,"site").concerns.length).toBeGreaterThan(0);
    expect(model.concerns).toEqual([...evaluation.stops,...evaluation.warnings]);
  });
  it("does not say ready to sign when storage/attestation disables the actual command", () => {
    const model=project(documentedInjection(),{capabilityDetail:"Documenting staff required"});
    expect(model.headline).toBe("Signing unavailable");expect(model.actionDetail).toBe("Documenting staff required");expect(model.canSign).toBe(false);
  });
  it.each(["held","escalated","provider"] as const)("uses the supported %s handoff save path", kind => {
    const encounter=documentedInjection();encounter.disposition={kind,provider:"Synthetic",time:"2026-10-02T09:15",outcome:"Call provider for follow-up plan."};
    const model=project(encounter,{canSign:true,lifecycle:"draft"});
    expect(model.canSign).toBe(false);expect(model.canSaveHandoff).toBe(true);
    expect(model.headline).toBe("Handoff ready to save");expect(model.lifecycleLabel).toBe("Handoff saved locally");
    expect(model.steps.filter(step=>!step.applicable).map(step=>step.id)).toEqual(["prepare","site","administer"]);
    encounter.disposition={kind:""};const returned=project(encounter);
    expect(step(returned,"administer").applicable).toBe(true);expect(step(returned,"administer").completion).not.toBe("complete");
  });
  it.each([
    {lifecycle:"new" as const,dirty:true,label:"Unsaved changes"},
    {lifecycle:"draft" as const,dirty:true,label:"Unsaved changes"},
    {lifecycle:"draft" as const,dirty:false,label:"Saved locally"},
    {lifecycle:"saving" as const,dirty:true,label:"Saving locally…"},
    {lifecycle:"error" as const,dirty:true,label:"Save failed"},
    {lifecycle:"locked" as const,dirty:false,label:"Signed locally"},
  ])("names actual persistence state $label", ({label,...options}) => {
    const model=project(documentedInjection(),{...options,canSign:true});
    expect(model.lifecycleLabel).toBe(label);
    if(options.lifecycle==="locked") {expect(model.headline).toBe("Signed locally");expect(model.canSign).toBe(false);}
    if(options.lifecycle === "saving") expect(model.canSign).toBe(false);
    if(options.lifecycle === "error") {
      expect(model.headline).toBe("Save failed");
      expect(model.canSign).toBe(true); // Existing protected command permits retry.
      expect(step(model,"sign").stateLabel).toBe("Retry signing");
    }
  });
  it.each(["orderingProvider","site","administrationDate","dose","response"] as const)("retains identity progress after a material %s edit", key => {
    const encounter=documentedInjection();const next={...encounter,[key]:key==="response"?{kind:""}:"Changed"};
    expect(step(project(next),"identify").completion).toBe("complete");
  });
  it("keeps an unknown named-section stop ahead of known warnings and assigns it once to general review", () => {
    const encounter=documentedInjection(), evaluation=InjectionEngine.evaluate(encounter,{today:"2026-10-02"});
    const unknown={code:"future.issue",message:"Synthetic future stop",severity:"stop" as const,section:"future-section",field:"futureField"};
    evaluation.stops=[unknown];evaluation.warnings=[{code:"timing.review",message:"Synthetic warning",severity:"warning",section:"timing"}];
    expect(firstActionableClinicalIssue("administer",evaluation)).toBe(unknown);
    const model=project(encounter,{evaluation});expect(model.steps.flatMap(step=>step.concerns).filter(issue=>issue===unknown)).toHaveLength(1);
    expect(injectionStepForIssue(unknown)).toBe("sign");expect(injectionTabForField(unknown.field)).toBe("review");
  });
  it("reuses exact structured-initiation verification evidence", () => {
    const encounter=documentedInjection();encounter.initiation={...emptyInjectionInitiation(),oralStatus:"verified",planVerified:true};
    expect(injectionVerificationSatisfied(encounter,"oralOverlap")).toBe(true);
    expect(injectionVerificationSatisfied(encounter,"invegaInit")).toBe(true);
    expect(injectionVerificationSatisfied(encounter,"visualInspection")).toBe(true);
    encounter.verifications={};encounter.initiation=emptyInjectionInitiation();
    expect(injectionVerificationSatisfied(encounter,"oralOverlap")).toBe(false);
  });
});
