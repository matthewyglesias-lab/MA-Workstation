import type { InjectionEncounter } from "../../../domain/injection";
import { mirrorInjectionEncounterToLegacyDom } from "./injection-legacy-mirror";

interface InjectionDraftState {
  canDiscard: boolean;
  activeRecordId?: string;
}

export interface InjectionDraftBridgeOptions {
  encounter: InjectionEncounter;
  typedDirty: boolean;
  readLegacyState: () => InjectionDraftState;
  saveLegacyDraft: () => boolean;
  /**
   * Explicit lifecycle saves reassert the full compatibility projection.
   * Background autosave can leave this false: ordinary typed edits already
   * project changed chip facts synchronously, while identity-only edits must
   * not rebuild the hidden chip workspace merely because the timer fired.
   */
  forceChipState?: boolean;
  /** Test seams for the browser-only compatibility projection. */
  mirrorEncounter?: (encounter: InjectionEncounter) => void;
  enableLegacyDraftGate?: () => (() => void) | undefined;
  extensionAvailable?: () => boolean;
}

function enableOneReadLegacyDraftGate(): (() => void) | undefined {
  const provider = document.getElementById("orderingProvider") as HTMLInputElement | null;
  if (!provider) return undefined;
  const prototype = Object.getPrototypeOf(provider) as object;
  const valueDescriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (!valueDescriptor?.get || !valueDescriptor.set) return undefined;
  const ownDescriptor = Object.getOwnPropertyDescriptor(provider, "value");
  let firstRead = true;

  try {
    Object.defineProperty(provider, "value", {
      configurable: true,
      enumerable: ownDescriptor?.enumerable ?? true,
      get() {
        if (firstRead) {
          firstRead = false;
          return "typed-draft";
        }
        return valueDescriptor.get?.call(provider);
      },
      set(value: string) {
        valueDescriptor.set?.call(provider, value);
      },
    });
  } catch {
    return undefined;
  }

  return () => {
    if (ownDescriptor) Object.defineProperty(provider, "value", ownDescriptor);
    else Reflect.deleteProperty(provider, "value");
  };
}

/**
 * Files the typed Injection encounter through the existing v4 legacy record
 * writer. The compatibility snapshot owns its native fields; a presentation
 * extension on that same write preserves material typed fields it omits.
 *
 * The frozen writer captures the compatibility projection, but its historical
 * `draftNeedsPersistence()` predicate only notices patient/provider/product
 * identity. A draft containing only a typed field such as Allergies or BP
 * therefore needs its historical gate opened for that one write. The shim
 * returns a non-empty provider only for the predicate's first read; the
 * writer's immediately following snapshot read receives the untouched real
 * provider value. No placeholder is ever assigned to the input or persisted.
 */
export function saveFullInjectionDraft({
  encounter,
  typedDirty,
  readLegacyState,
  saveLegacyDraft,
  forceChipState = true,
  mirrorEncounter = (value) =>
    mirrorInjectionEncounterToLegacyDom(value, { forceChipState }),
  enableLegacyDraftGate = enableOneReadLegacyDraftGate,
  extensionAvailable = () => true,
}: InjectionDraftBridgeOptions): boolean {
  const initial = readLegacyState();

  // A pristine new worksheet has nothing to file. Saved draft records remain
  // eligible for a normal exact write even when no new typed edit occurred.
  if (!typedDirty && !initial.canDiscard) return true;
  if (!extensionAvailable()) return false;
  mirrorEncounter(encounter);

  let restoreDraftGate: (() => void) | undefined;
  try {
    if (!initial.canDiscard) {
      restoreDraftGate = enableLegacyDraftGate();
      if (!restoreDraftGate) return false;
    }

    const saved = saveLegacyDraft();
    return saved && Boolean(readLegacyState().activeRecordId);
  } finally {
    restoreDraftGate?.();
  }
}
