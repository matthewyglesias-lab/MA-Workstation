import { describe, expect, it } from "vitest";
import {
  summarizeReadinessVerdict,
  type ReadinessVerdict,
} from "../../src/application/readiness-projection";
import type { WorkstationReadinessItem } from "../../src/application/workstation-projection";
import { MODULE, NOTES, RECORD, readinessVerdictCopy } from "../../src/presentation/vocabulary";
import { WORKFLOW_LABELS } from "../../src/presentation/types";

const item = (
  state: WorkstationReadinessItem["state"],
  id: string,
): WorkstationReadinessItem => ({ id, label: id, state });

const verdictFor = (...items: WorkstationReadinessItem[]): ReadinessVerdict =>
  summarizeReadinessVerdict(items)!;

describe("readiness verdict copy", () => {
  it("says Ready to sign when every requirement is complete", () => {
    const copy = readinessVerdictCopy(verdictFor(item("complete", "a"), item("complete", "b")));
    expect(copy.headline).toBe("Ready to sign");
    expect(copy.detail).toBe("2 of 2 complete");
  });

  it("says Incomplete while anything is pending or blocked", () => {
    expect(
      readinessVerdictCopy(verdictFor(item("complete", "a"), item("pending", "b"))).headline,
    ).toBe("Incomplete");
    expect(
      readinessVerdictCopy(verdictFor(item("complete", "a"), item("stop", "b"))).headline,
    ).toBe("Incomplete");
  });

  it("flags review alongside the signable verdict, and counts it", () => {
    const copy = readinessVerdictCopy(
      verdictFor(item("complete", "a"), item("warning", "b"), item("complete", "c")),
    );
    expect(copy.headline).toBe("Ready to sign · review flagged");
    expect(copy.detail).toBe("2 of 3 complete · 1 needs review");
  });

  it("omits the review count when there is nothing to review", () => {
    expect(readinessVerdictCopy(verdictFor(item("complete", "a"))).detail).toBe("1 of 1 complete");
  });

  /*
   * Moved here from the application-layer test along with the wording itself.
   *
   * The verdict is about whether the note can be SIGNED. Wording it as
   * clearance to administer would read red at the exact moment staff inject,
   * because administration and disposition are documented afterwards - and a
   * signal that is red when you are supposed to act is one people learn to
   * ignore.
   *
   * The guard is case-insensitive on purpose. It used to be anchored to
   * upper case, which silently stopped protecting anything the moment the copy
   * moved to sentence case.
   */
  it("is worded as a documentation verdict, never as clearance to administer", () => {
    const forbidden = /\b(administer|administration|inject|injection|safe|do not|proceed|ok to)\b/i;
    const cases: WorkstationReadinessItem[][] = [
      [item("complete", "a")],
      [item("warning", "a")],
      [item("stop", "a")],
      [item("pending", "a")],
      [item("complete", "a"), item("warning", "b")],
    ];
    for (const rows of cases) {
      const copy = readinessVerdictCopy(summarizeReadinessVerdict(rows)!);
      expect(copy.headline).not.toMatch(forbidden);
      expect(copy.detail).not.toMatch(forbidden);
    }
  });
});

describe("workstation vocabulary", () => {
  it("names modules the way Tebra names them", () => {
    expect(WORKFLOW_LABELS.home).toBe(MODULE.dashboard);
    expect(WORKFLOW_LABELS.home).toBe("Dashboard");
    expect(WORKFLOW_LABELS.reference).toBe("Reference");
  });

  it("reuses one status vocabulary between the verdict and the notes list", () => {
    expect(readinessVerdictCopy(verdictFor(item("pending", "a"))).headline).toBe(
      NOTES.statusIncomplete,
    );
    expect(readinessVerdictCopy(verdictFor(item("complete", "a"))).headline).toBe(
      NOTES.statusReadyToSign,
    );
  });

  /*
   * The words below describe how this codebase is built, not what a medical
   * assistant is doing. Client/server-era naming is exactly what the redesign
   * is removing, so catching a regression here is cheaper than catching it in
   * a screenshot review.
   */
  it("keeps system vocabulary off the screen", () => {
    const internalSpeak =
      /\b(attest|attestation|file local|local record|posting|compatibility|projection|workflow key|transaction)\b/i;
    const surfaces = [
      ...Object.values(MODULE),
      ...Object.values(NOTES),
      ...Object.values(RECORD),
      ...Object.values(WORKFLOW_LABELS),
    ];
    for (const surface of surfaces) {
      expect(surface, `"${surface}" reads as internal vocabulary`).not.toMatch(internalSpeak);
    }
  });
});
