import { describe, expect, it } from "vitest";
import {
  summarizeReadinessVerdict,
  type ReadinessVerdict,
} from "../../src/application/readiness-projection";
import type { WorkstationReadinessItem } from "../../src/application/workstation-projection";
import {
  ACTION_BAR,
  CHECKLIST,
  FACESHEET,
  KIOSK,
  MODULE,
  NAVIGATION,
  NOTES,
  OPEN_NOTES,
  PATIENT,
  PATIENT_CARD,
  PATIENT_NOTES,
  PATIENT_SEARCH,
  RECORD,
  readinessItemStateLabel,
  readinessVerdictCopy,
  SHELL,
} from "../../src/presentation/vocabulary";
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

  it("keeps the product shell, section rail, and Care Checklist vocabulary aligned", () => {
    expect(SHELL.organizationShort).toBe("IPMG");
    expect(SHELL.productName).toBe("MA Workstation");
    expect(SHELL.shortcuts).toBe("Keyboard shortcuts");
    expect(NAVIGATION.clinicalWork).toBe("Clinical work");
    expect(OPEN_NOTES.udsTitle).toBe("Open Notes · UDS");
    expect(CHECKLIST.title).toBe("Care Checklist");
    expect(CHECKLIST.stopCount(1)).toBe("1 stop");
    expect(CHECKLIST.stopCount(2)).toBe("2 stops");
    expect(CHECKLIST.reviewCount(2)).toBe("2 to review");
    expect(KIOSK.stepsTitle).toBe("Injection steps");
    expect(KIOSK.stepSign).toBe(RECORD.sign);
  });

  it("states each Facesheet card's ordering rule, so a short list is not read as a bug", () => {
    // Every card that lists a subset says which subset. A summary card that
    // shows five of something without saying which five reads as truncation.
    expect(FACESHEET.siteRotationRule).toMatch(/last five/i);
    expect(FACESHEET.recentNotesRule).toMatch(/last five/i);
    expect(FACESHEET.lastInjectionRule).toMatch(/most recent/i);
    expect(FACESHEET.careChecklistRule).toMatch(/open items first/i);
  });

  it("keeps patient search honest about what it searches", () => {
    // The affordance is Tebra's; the scope is ours, and saying so is the
    // difference between a faithful control and a lie about reach.
    expect(PATIENT_SEARCH.placeholder).toMatch(/2-3 letters/i);
    expect(PATIENT_SEARCH.placeholder).toMatch(/mm\/dd\/yyyy/i);
    expect(PATIENT_SEARCH.scopeHint).toMatch(/saved in this browser/i);
  });

  it("keeps Tebra's own control names on the page-level actions", () => {
    expect(ACTION_BAR.newNote).toBe("New Note");
    expect(ACTION_BAR.print).toBe("Print");
    expect(ACTION_BAR.more).toBe("More");
    expect(ACTION_BAR.customizeView).toBe("Customize View");
  });

  it("gives every Care Checklist state one word, shared by both surfaces", () => {
    expect(readinessItemStateLabel("complete")).toBe(CHECKLIST.stateComplete);
    expect(readinessItemStateLabel("stop")).toBe(CHECKLIST.stateRequired);
    expect(readinessItemStateLabel("warning")).toBe(CHECKLIST.stateReview);
    expect(readinessItemStateLabel("pending")).toBe(CHECKLIST.statePending);
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
    const recordCopy = Object.values(RECORD).map((value) =>
      typeof value === "function" ? value("injection") : value,
    );
    const kioskCopy = Object.values(KIOSK).map((value) =>
      typeof value === "function" ? value("Synthetic Patient") : value,
    );
    const surfaces = [
      ...Object.values(MODULE),
      ...Object.values(NOTES),
      ...Object.values(OPEN_NOTES),
      ...recordCopy,
      ...kioskCopy,
      ...Object.values(SHELL),
      ...Object.values(NAVIGATION),
      ...Object.values(WORKFLOW_LABELS),
      // Phase 3b surfaces. The patient chart is the screen that most reads
      // like a real EHR chart, so it is the one where client/server-era
      // vocabulary would be least noticed and do the most damage.
      ...Object.values(PATIENT),
      ...Object.values(PATIENT_SEARCH),
      ...Object.values(PATIENT_CARD),
      ...Object.values(PATIENT_NOTES),
      ...Object.values(ACTION_BAR),
      // FACESHEET carries one copy helper alongside its strings.
      ...Object.values(FACESHEET).filter((value) => typeof value === "string"),
    ];
    for (const surface of surfaces) {
      expect(surface, `"${surface}" reads as internal vocabulary`).not.toMatch(internalSpeak);
    }
  });
});
