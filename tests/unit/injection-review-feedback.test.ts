import { describe, it, expect } from "vitest";
import { documentedInjection } from "./injection-progress-fixture";
import { injectionReviewInvalidationMessage } from "../../src/presentation/workflows/injection/review-feedback";
describe("explanation follows authoritative review materiality", () => {
  it.each([
    ["site", "R deltoid", "Site"], ["orderingProvider", "Changed provider", "Ordering provider"],
    ["administrationDate", "2026-10-03", "Administration date"], ["dose", "150 mg", "Dose"],
    ["route", "Changed route", "Route"], ["response", {kind:""}, "Response"],
  ] as const)("names the changed %s dependency", (field, value, label) => {
    const previous=documentedInjection();
    expect(injectionReviewInvalidationMessage(previous,{...previous,[field]:value})).toBe(`${label} changed — review administration again.`);
  });
  it("exempts exact no-ops, view-only actions and appointment metadata",()=>{
    const previous=documentedInjection();
    expect(injectionReviewInvalidationMessage(previous,{...previous})).toBeUndefined();
    expect(injectionReviewInvalidationMessage(previous,{...previous,avsAppointment:{version:1,mode:"details",date:"2026-11-03",time:"10:30",provider:"Synthetic",location:"",visitType:""}})).toBeUndefined();
  });
  it("does not claim a review was invalidated when administration was never reviewed",()=>{
    const previous=documentedInjection();previous.disposition={kind:""};
    expect(injectionReviewInvalidationMessage(previous,{...previous,site:"R deltoid"})).toBeUndefined();
  });
});
