import { useCallback, useEffect, useState } from "preact/hooks";

import { browserSafeStorage, type SafeStorage } from "../persistence/storage";

/** A presentation preference only. No patient or encounter data is stored. */
export const KIOSK_MODE_STORAGE_KEY = "ipmgMedAssistKioskMode_v1";

export function resolveKioskMode(
  search: string,
  storedValue: string | null,
): boolean {
  const queryValue = new URLSearchParams(search).get("kiosk");
  if (queryValue === "1") return true;
  if (queryValue === "0") return false;
  return storedValue === "1";
}

export function kioskModeUrl(href: string, enabled: boolean): string {
  const url = new URL(href);
  if (enabled) url.searchParams.set("kiosk", "1");
  else url.searchParams.delete("kiosk");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function readKioskMode(
  search = typeof window === "undefined" ? "" : window.location.search,
  storage: SafeStorage = browserSafeStorage(),
): boolean {
  const stored = storage.read(KIOSK_MODE_STORAGE_KEY);
  return resolveKioskMode(search, stored.ok ? stored.value : null);
}

export function writeKioskMode(
  enabled: boolean,
  storage: SafeStorage = browserSafeStorage(),
): void {
  storage.write(KIOSK_MODE_STORAGE_KEY, enabled ? "1" : "0");
}

export interface KioskModeController {
  enabled: boolean;
  fullscreen: boolean;
  fullscreenSupported: boolean;
  setEnabled: (enabled: boolean) => void;
  requestFullscreen: () => Promise<boolean>;
  exitFullscreen: () => Promise<boolean>;
}

/**
 * Owns the browser-only focused-workspace preference and Fullscreen API.
 * Fullscreen is deliberately separate from the persisted preference because a
 * browser may enter it only from a user gesture.
 */
export function useKioskMode(): KioskModeController {
  const [enabled, setEnabledState] = useState(() => readKioskMode());
  const [fullscreen, setFullscreen] = useState(
    () => typeof document !== "undefined" && Boolean(document.fullscreenElement),
  );

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writeKioskMode(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(
        window.history.state,
        "",
        kioskModeUrl(window.location.href, next),
      );
    }
  }, []);

  const requestFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === "undefined") return false;
    const request = document.documentElement.requestFullscreen;
    if (!request) return false;
    try {
      await request.call(document.documentElement);
      return true;
    } catch {
      return false;
    }
  }, []);

  const exitFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === "undefined" || !document.fullscreenElement) return true;
    try {
      await document.exitFullscreen();
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    // A query-param launch must become the same durable presentation
    // preference as an account-menu launch. SafeStorage contains blocked
    // localStorage without letting the shell fail.
    writeKioskMode(enabled);
  }, [enabled]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    const onStorage = (event: StorageEvent) => {
      if (event.key !== KIOSK_MODE_STORAGE_KEY) return;
      setEnabledState(event.newValue === "1");
    };
    const onPopState = () => setEnabledState(readKioskMode());
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return {
    enabled,
    fullscreen,
    fullscreenSupported:
      typeof document !== "undefined" &&
      typeof document.documentElement.requestFullscreen === "function",
    setEnabled,
    requestFullscreen,
    exitFullscreen,
  };
}
