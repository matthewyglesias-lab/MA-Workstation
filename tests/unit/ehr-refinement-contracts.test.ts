import { describe, expect, it } from "vitest";

import { projectClinicalReadiness } from "../../src/application/readiness-projection";
import type { ClinicalEvaluation, ClinicalIssue } from "../../src/domain/contracts";
import {
  FUNCTION_KEY_DECK_PROFILE,
  FUNCTION_KEY_PROFILE,
  getFunctionKeyCommand,
  resolveFunctionKeyCommand,
} from "../../src/presentation/FunctionKeyProfile";
import {
  INJECTION_RECORDS_STORAGE_KEY,
  InjectionRecordRepository,
  SafeStorage,
  type StorageLike,
} from "../../src/persistence";

const evaluation = (
  workflow: ClinicalEvaluation["workflow"],
  readiness: ClinicalEvaluation["readiness"],
  stops: ClinicalIssue[] = [],
  warnings: ClinicalIssue[] = [],
): ClinicalEvaluation => ({
  workflow,
  readiness,
  stops,
  warnings,
  recommendations: [],
  calculatedDates: {},
  output: {},
});

describe("typed readiness projection", () => {
  it.each([
    ["administer", "injection"],
    ["uds", "uds"],
    ["samples", "samples"],
    ["forms", "forms"],
  ] as const)("keeps an untouched %s worksheet pending", (desktopWorkflow, clinicalWorkflow) => {
    const projected = projectClinicalReadiness(
      desktopWorkflow,
      evaluation(clinicalWorkflow, "idle"),
    );

    expect(projected.readiness).toBe("idle");
    expect(projected.items.length).toBeGreaterThan(0);
    expect(projected.items.every((item) => item.state === "pending")).toBe(true);
    expect(projected.items).not.toContainEqual(
      expect.objectContaining({ state: "complete" }),
    );
  });

  it("projects the first typed injection stop into its fixed safety section", () => {
    const projected = projectClinicalReadiness(
      "administer",
      evaluation("injection", "blocked", [
        {
          code: "allergy-review-required",
          message: "Verify allergy status before administration.",
          severity: "stop",
          section: "safety",
        },
      ]),
    );

    expect(projected.firstBlockingDetail).toBe(
      "Verify allergy status before administration.",
    );
    expect(projected.items).toContainEqual({
      id: "administer-safety",
      label: "Safety",
      state: "stop",
      detail: "Verify allergy status before administration.",
    });
    expect(projected.items.find((item) => item.id === "administer-administration"))
      .toMatchObject({ state: "pending" });
  });

  it("uses the visible clinical sequence rather than raw evaluator append order for first blocker guidance", () => {
    const projected = projectClinicalReadiness(
      "administer",
      evaluation("injection", "blocked", [
        {
          code: "disposition-required",
          message: "Select the final clinical disposition.",
          severity: "stop",
          section: "disposition",
        },
        {
          code: "prior-dose-required",
          message: "Document the prior-dose date for a scheduled administration.",
          severity: "stop",
          section: "timing",
        },
      ]),
    );

    expect(projected.firstBlockingDetail).toBe(
      "Document the prior-dose date for a scheduled administration.",
    );
  });

  it("does not mark unrelated review stages complete before typed readiness is ready", () => {
    const projected = projectClinicalReadiness(
      "uds",
      evaluation("uds", "review", [], [
        {
          code: "collection-time-review",
          message: "Review collection time before filing.",
          severity: "warning",
          section: "collection",
        },
      ]),
    );

    expect(projected.items).toContainEqual(
      expect.objectContaining({
        id: "uds-collection",
        state: "warning",
        detail: "Review collection time before filing.",
      }),
    );
    expect(projected.items.every((item) => item.state !== "complete")).toBe(true);
  });

  it("keeps an unsectioned typed blocker visible instead of silently showing a clean sheet", () => {
    const projected = projectClinicalReadiness(
      "samples",
      evaluation("samples", "blocked", [
        {
          code: "local-storage-required",
          message: "Local storage is required before this sample can be filed.",
          severity: "stop",
        },
      ]),
    );

    expect(projected.firstBlockingDetail).toBe(
      "Local storage is required before this sample can be filed.",
    );
    expect(projected.items.at(-1)).toMatchObject({
      state: "stop",
      detail: "Local storage is required before this sample can be filed.",
    });
  });

  it("marks every fixed stage complete only after typed readiness is ready", () => {
    const projected = projectClinicalReadiness(
      "forms",
      evaluation("forms", "ready"),
    );

    expect(projected.items.length).toBeGreaterThan(0);
    expect(projected.items.every((item) => item.state === "complete")).toBe(true);
  });
});

describe("Client/Server function-key profile", () => {
  it.each([
    ["F1", false, "help"],
    ["F6", false, "next-section"],
    ["F6", true, "previous-section"],
    ["F7", false, "next-page"],
    ["F7", true, "previous-page"],
    ["F8", false, "focus-next-zone"],
    ["F9", false, "lookup"],
    ["F11", false, "local-emr"],
    ["F12", false, "file"],
    ["Escape", false, "back"],
  ] as const)("routes %s through the shared profile", (key, shifted, id) => {
    const resolved = resolveFunctionKeyCommand(key, shifted);

    expect(resolved?.id).toBe(id);
    expect(getFunctionKeyCommand(id)).toBe(resolved);
  });

  it("does not retain custom global F3, F4, or F10 commands", () => {
    expect(resolveFunctionKeyCommand("F3")).toBeUndefined();
    expect(resolveFunctionKeyCommand("F4")).toBeUndefined();
    expect(resolveFunctionKeyCommand("F10")).toBeUndefined();
  });

  it("uses one visible deck for the documented primary command set", () => {
    expect(FUNCTION_KEY_DECK_PROFILE.map((command) => command.keyLabel)).toEqual([
      "F1",
      "F6",
      "F7",
      "F8",
      "F9",
      "F11",
      "F12",
      "Esc",
    ]);
    expect(FUNCTION_KEY_PROFILE.map((command) => command.id)).toContain(
      "previous-section",
    );
    expect(FUNCTION_KEY_PROFILE.map((command) => command.id)).toContain(
      "previous-page",
    );
  });
});

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("local injection record hydration", () => {
  it("opens legacy locks without attestation metadata and preserves newer attestation and audit payloads", () => {
    const storage = new MemoryStorage();
    const storedRecords = [
      {
        id: "legacy-local-lock",
        type: "injection",
        status: "completed",
        createdAt: "2026-08-01T08:00:00.000Z",
        updatedAt: "2026-08-01T08:05:00.000Z",
        completedAt: "2026-08-01T08:05:00.000Z",
        patient: { name: "LEGACY, LOCAL", dob: "01/01/1980" },
        summary: "Legacy injection lock",
        snapshot: { version: 3, medKey: "legacy", state: {} },
        addenda: [],
      },
      {
        id: "attested-local-lock",
        type: "injection",
        status: "completed",
        createdAt: "2026-08-03T08:00:00.000Z",
        updatedAt: "2026-08-03T08:07:00.000Z",
        completedAt: "2026-08-03T08:07:00.000Z",
        patient: { name: "ATTESTED, LOCAL", dob: "02/02/1982" },
        summary: "Attested injection lock",
        snapshot: { version: 4, medKey: "haldol", state: {}, fields: {} },
        addenda: [],
        attestation: {
          staff: "Local MA",
          timestamp: "2026-08-03T08:07:00.000Z",
          statementVersion: "local-v1",
          futureAttestationField: "preserve",
        },
        audit: [
          {
            id: "audit-lock-1",
            event: "attested-and-locked",
            timestamp: "2026-08-03T08:07:00.000Z",
            staff: "Local MA",
            statementVersion: "local-v1",
            attestationTimestamp: "2026-08-03T08:07:00.000Z",
            futureAuditField: "preserve",
          },
        ],
      },
    ];
    storage.values.set(
      INJECTION_RECORDS_STORAGE_KEY,
      JSON.stringify(storedRecords),
    );
    const before = storage.values.get(INJECTION_RECORDS_STORAGE_KEY);
    const repository = new InjectionRecordRepository(new SafeStorage(storage));

    const legacy = repository.open("legacy-local-lock");
    const attested = repository.open("attested-local-lock");

    expect(legacy.ok).toBe(true);
    expect(attested.ok).toBe(true);
    if (!legacy.ok || !attested.ok) return;

    expect(legacy.value.status).toBe("completed");
    expect(legacy.value.attestation).toBeUndefined();
    expect(legacy.value.audit).toBeUndefined();
    expect(attested.value.attestation).toMatchObject({
      staff: "Local MA",
      statementVersion: "local-v1",
      futureAttestationField: "preserve",
    });
    expect(attested.value.audit).toEqual([
      expect.objectContaining({
        event: "attested-and-locked",
        futureAuditField: "preserve",
      }),
    ]);
    expect(storage.writes).toBe(0);
    expect(storage.values.get(INJECTION_RECORDS_STORAGE_KEY)).toBe(before);
  });
});
