import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { reviewCue } from "../../src/presentation/lightfully/ReviewCue";
import { IPMG_LOGO } from "../../src/presentation/branding/ipmg-logo";

describe("Local review presentation", () => {
  it("offers specific reminders for every retained documentation workflow", () => {
    for (const workflow of ["administer", "uds", "samples", "forms"] as const) {
      const cue = reviewCue(workflow, false);
      expect(cue?.label).toBe("Check as you go");
      expect(cue?.detail).toMatch(/patient/i);
      expect(Object.keys(cue!)).toEqual(["label", "detail"]);
    }
    expect(reviewCue("administer", false)?.detail).toContain("Recheck any value you change");
    expect(reviewCue("uds", false)?.detail).toContain("unknown findings unconfirmed");
    expect(reviewCue("samples", false)?.detail).toContain("quantity and lot");
    expect(reviewCue("forms", false)?.detail).toContain("recipient and dates");
  });
  it("distinguishes preview from completed Tebra filing", () => {
    for (const workflow of ["administer", "uds", "samples", "forms"] as const) {
      expect(reviewCue(workflow, true)).toEqual({
        label: "Before you finish",
        detail: "Compare patient, dates and recorded details before copying or printing. File and verify separately in Tebra.",
      });
    }
  });
  it("does not invent a clinical workflow for navigation or the TMS placeholder", () => {
    for (const workflow of ["home", "reference", "log", "tms"] as const) {
      expect(reviewCue(workflow, false)).toBeNull();
      expect(reviewCue(workflow, true)).toBeNull();
    }
  });
  it("returns no authorization, readiness, or stored attestation state", () => {
    const before = reviewCue("administer", false);
    reviewCue("administer", true);
    expect(reviewCue("administer", false)).toEqual(before);
    expect(before).not.toHaveProperty("verified");
    expect(before).not.toHaveProperty("ready");
  });
  it("embeds the exact official PNG rather than a network asset or redrawn mark", () => {
    expect(IPMG_LOGO).toMatch(/^data:image\/png;base64,/);
    const bytes = Buffer.from(IPMG_LOGO.split(",")[1]!, "base64");
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("97d1b92ed246be8cf0ba14fea31acb8dd63fcd7eff43934dd9efc7aee9be9b90");
  });
});
