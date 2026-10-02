import { useEffect, useState } from "preact/hooks";

interface ToastProps {
  /** The latest status message. Empty or unchanged text shows nothing new. */
  message: string;
  /** How long a message stays on screen. */
  durationMs?: number;
}

/**
 * Transient status, replacing the status bar.
 *
 * A permanent strip along the bottom edge is a desktop-application affordance;
 * Tebra confirms an action with a toast and then gets out of the way, and
 * `PLAN.md` §2.2 lists `Toast` rather than a status bar. The behaviour that
 * mattered is kept: this is still a polite live region, so a screen reader
 * hears "Draft saved" exactly as it did before.
 *
 * The message is cleared on a timer rather than left up. A status line that
 * never clears stops being read — the last thing that happened and the current
 * state look identical, which is how a stale "Saved" outlives the save.
 */
export function Toast({ message, durationMs = 4000 }: ToastProps) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    const next = message.trim();
    if (!next) {
      setShown("");
      return;
    }
    setShown(next);
    const timer = globalThis.setTimeout(() => setShown(""), durationMs);
    return () => globalThis.clearTimeout(timer);
  }, [message, durationMs]);

  return (
    <div
      class="tebra-toast-region cd2004-print-exclude"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {shown ? (
        <p class="tebra-toast" data-toast>
          {shown}
        </p>
      ) : null}
    </div>
  );
}
