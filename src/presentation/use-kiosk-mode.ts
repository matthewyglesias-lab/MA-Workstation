import { useCallback, useEffect, useState } from "preact/hooks";

/**
 * Kiosk mode. PLAN 3.1: this station's whole day is administering long-acting
 * injectables, and a first-party team building *this* module would ship a
 * focused shell rather than a general EHR one.
 *
 * Kiosk mode is presentation only. It changes what the shell shows and how
 * large it shows it; it changes no gate, no dose, no interval and no record.
 * The full shell stays one toggle away, because chart review needs it.
 *
 * Two ways in, and the URL wins so a kiosk browser can be pinned to a link:
 *
 *   ?kiosk=1   turns it on for this load and remembers it
 *   ?kiosk=0   turns it off for this load and remembers that
 *
 * With neither, the remembered preference applies. The preference is per
 * browser, like everything else this app stores.
 */
const KIOSK_STORAGE_KEY = "ipmgMedAssistKioskModeV1";
const KIOSK_QUERY_PARAM = "kiosk";

function readStoredPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(KIOSK_STORAGE_KEY) === "1";
  } catch {
    // Private windows and blocked site data both throw here. A workstation
    // that cannot remember the preference still has to render.
    return false;
  }
}

function writeStoredPreference(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(KIOSK_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Not remembering is survivable; failing to render is not.
  }
}

function readQueryOverride(): boolean | undefined {
  try {
    const raw = new URLSearchParams(globalThis.location?.search ?? "").get(
      KIOSK_QUERY_PARAM,
    );
    if (raw === null) return undefined;
    return raw !== "0" && raw !== "false";
  } catch {
    return undefined;
  }
}

export interface KioskMode {
  kiosk: boolean;
  setKiosk: (enabled: boolean) => void;
  /**
   * The Fullscreen API only grants a request made during a user gesture, so
   * this is exposed for a control to call and never fired on load.
   */
  requestFullscreen: () => void;
}

export function useKioskMode(): KioskMode {
  const [kiosk, setKioskState] = useState<boolean>(() => {
    const override = readQueryOverride();
    return override ?? readStoredPreference();
  });

  // A URL override is also a preference: a kiosk pinned to ?kiosk=1 should
  // stay in kiosk mode if someone later opens the app without the parameter.
  useEffect(() => {
    const override = readQueryOverride();
    if (override !== undefined) writeStoredPreference(override);
  }, []);

  const setKiosk = useCallback((enabled: boolean) => {
    setKioskState(enabled);
    writeStoredPreference(enabled);
    if (!enabled && globalThis.document?.fullscreenElement) {
      void globalThis.document.exitFullscreen?.();
    }
  }, []);

  const requestFullscreen = useCallback(() => {
    const root = globalThis.document?.documentElement;
    if (!root?.requestFullscreen) return;
    // Rejected when the gesture has already been consumed, which is normal
    // and not worth surfacing.
    void root.requestFullscreen().catch(() => undefined);
  }, []);

  return { kiosk, setKiosk, requestFullscreen };
}
