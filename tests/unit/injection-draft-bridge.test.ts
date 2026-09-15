import { describe, expect, it, vi } from "vitest";

import { emptyInjectionEncounter } from "../../src/domain/injection";
import { saveFullInjectionDraft } from "../../src/presentation/workflows/injection/injection-draft-bridge";

describe("saveFullInjectionDraft", () => {
  it("does not create a record for a pristine new worksheet", () => {
    const mirrorEncounter = vi.fn();
    const saveLegacyDraft = vi.fn(() => true);

    expect(
      saveFullInjectionDraft({
        encounter: emptyInjectionEncounter(),
        typedDirty: false,
        readLegacyState: () => ({ canDiscard: false, activeRecordId: "" }),
        saveLegacyDraft,
        mirrorEncounter,
        enableLegacyDraftGate: vi.fn(),
      }),
    ).toBe(true);
    expect(mirrorEncounter).not.toHaveBeenCalled();
    expect(saveLegacyDraft).not.toHaveBeenCalled();
  });

  it("opens the one-read gate and writes the exact typed-only draft once", () => {
    const encounter = { ...emptyInjectionEncounter(), allergies: "Penicillin — synthetic" };
    let state = { canDiscard: false, activeRecordId: "" };
    let gateOpen = false;
    const restoreGate = vi.fn(() => {
      gateOpen = false;
    });

    const saved = saveFullInjectionDraft({
      encounter,
      typedDirty: true,
      readLegacyState: () => state,
      saveLegacyDraft: () => {
        expect(gateOpen).toBe(true);
        state = { canDiscard: true, activeRecordId: "inj-test" };
        return true;
      },
      mirrorEncounter: vi.fn(),
      enableLegacyDraftGate: () => {
        gateOpen = true;
        return restoreGate;
      },
    });

    expect(saved).toBe(true);
    expect(restoreGate).toHaveBeenCalledOnce();
    expect(gateOpen).toBe(false);
  });

  it("fails closed and restores the typed provider when the bootstrap write fails", () => {
    const encounter = {
      ...emptyInjectionEncounter(),
      orderingProvider: "Synthetic Provider",
      vitals: { bp: "120/80" },
    };
    const restoreGate = vi.fn();

    expect(
      saveFullInjectionDraft({
        encounter,
        typedDirty: true,
        readLegacyState: () => ({ canDiscard: false, activeRecordId: "" }),
        saveLegacyDraft: () => false,
        mirrorEncounter: vi.fn(),
        enableLegacyDraftGate: () => restoreGate,
      }),
    ).toBe(false);
    expect(restoreGate).toHaveBeenCalledOnce();
  });

  it("fails closed before writing when the exact extension is unavailable", () => {
    const saveLegacyDraft = vi.fn(() => true);
    const mirrorEncounter = vi.fn();

    expect(saveFullInjectionDraft({
      encounter: { ...emptyInjectionEncounter(), reason: "scheduled" },
      typedDirty: true,
      readLegacyState: () => ({ canDiscard: false, activeRecordId: "" }),
      saveLegacyDraft,
      mirrorEncounter,
      extensionAvailable: () => false,
    })).toBe(false);
    expect(saveLegacyDraft).not.toHaveBeenCalled();
    expect(mirrorEncounter).not.toHaveBeenCalled();
  });
});
