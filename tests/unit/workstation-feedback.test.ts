import { describe, expect, it } from "vitest";
import { feedbackPresentation } from "../../src/presentation/interaction/use-workstation-feedback";
import { readFileSync } from "node:fs";

describe("explicit workstation feedback purpose", () => {
  it("announces navigation without a floating confirmation", () => {
    expect(feedbackPresentation("Injection opened.", "navigation", "")).toEqual({visible: [], announcement: "Injection opened."});
  });
  it("does not classify action importance by wording", () => {
    expect(feedbackPresentation("Injection opened.", "action", "")).toEqual({visible: ["Injection opened."], announcement: ""});
  });
  it("preserves legacy failure alongside a navigation announcement", () => {
    expect(feedbackPresentation("Reference opened.", "navigation", "Draft could not be saved")).toEqual({visible: ["Draft could not be saved"], announcement: "Reference opened."});
  });
  it("keeps both distinct action messages and deduplicates identical output", () => {
    expect(feedbackPresentation("Copy blocked", "action", "Save failed").visible).toEqual(["Copy blocked", "Save failed"]);
    expect(feedbackPresentation("Save failed", "action", "Save failed").visible).toEqual(["Save failed"]);
  });
  it("does not announce the same legacy output twice", () => {
    expect(feedbackPresentation("Record opened.", "navigation", "Record opened.")).toEqual({visible: ["Record opened."], announcement: ""});
  });
  it("keeps an empty status empty", () => {
    expect(feedbackPresentation("", "navigation", "")).toEqual({visible: [], announcement: ""});
  });
  it("refreshes saved-patient search through the existing shell owner, not another repository or listener", () => {
    const search = readFileSync("src/presentation/shell/PatientSearch.tsx", "utf8");
    const shell = readFileSync("src/presentation/ClinicalDesktopShell.tsx", "utf8");
    expect(search).toContain("onRefresh?.()");
    expect(search).not.toMatch(/new\s+(InjectionRecordRepository|UdsRecordRepository)|addEventListener/);
    expect(shell).toContain("onRefresh={reloadChartIndex}");
  });
});
