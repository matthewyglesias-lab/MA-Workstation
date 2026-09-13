import { useCallback, useEffect, useRef, useState } from "preact/hooks";

/**
 * Copying is how documentation actually reaches the chart, so a copy command
 * that quietly does nothing is a clinical problem, not a cosmetic one: staff
 * paste stale clipboard content into a patient's record believing it is the
 * note they just read.
 *
 * `navigator.clipboard.writeText` fails more often than it looks. It is absent
 * outside a secure context, and it rejects when the document has lost focus,
 * when the browser withholds the permission, and in several embedded browsers.
 * Each of those is a rejected promise - invisible unless someone catches it.
 *
 * So every copy in the workstation goes through here: the async API when it
 * works, the synchronous selection fallback when it does not, and a definite
 * answer either way for the caller to show.
 */

export type ClipboardOutcome = "copied" | "empty" | "blocked";

/**
 * The pre-`navigator.clipboard` path, kept deliberately. `execCommand` is
 * deprecated but still the only copy that works in an insecure context or when
 * the async API rejects, and a workstation that cannot copy its note is worse
 * than one relying on a deprecated call.
 *
 * The textarea is positioned off-view rather than hidden: a `display: none` or
 * `visibility: hidden` element cannot be selected, so the copy would silently
 * fail. Focus and the operator's own selection are restored afterwards, so
 * copying never steals the caret out of the field being typed in.
 */
function copyBySelection(value: string): boolean {
  const activeElement = document.activeElement as HTMLElement | null;
  const selection = document.getSelection();
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("aria-hidden", "true");
  textarea.setAttribute("tabindex", "-1");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "none";
  textarea.style.outline = "none";
  textarea.style.boxShadow = "none";
  textarea.style.background = "transparent";
  textarea.style.opacity = "0";

  try {
    document.body.append(textarea);
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
    if (activeElement && typeof activeElement.focus === "function") {
      activeElement.focus({ preventScroll: true });
    }
  }
}

/** Copy `text`, trying every path the browser offers before giving up. */
export async function copyTextToClipboard(text: string): Promise<ClipboardOutcome> {
  const value = typeof text === "string" ? text : "";
  if (!value.trim()) return "empty";

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return "copied";
    }
  } catch {
    // Absent, withheld, or rejected because the document lost focus. The
    // selection path below still works in all three cases.
  }

  return copyBySelection(value) ? "copied" : "blocked";
}

export interface CopyFeedback {
  /** Outcome of the most recent copy, cleared a few seconds later. */
  state: ClipboardOutcome | null;
  /**
   * Which control ran that copy. A viewer has several - the whole note, and
   * one per section - and a confirmation on the wrong button is its own small
   * lie: it tells an operator the entire note is on the clipboard when only
   * one section is.
   */
  source: string | null;
  copy: (text: string, source?: string) => void;
  /** The outcome to show on `source`, or null for every other control. */
  stateFor: (source: string) => ClipboardOutcome | null;
}

const FEEDBACK_MS = 2200;

/**
 * A copy command with a visible answer. Silent success is most of why these
 * buttons feel unreliable: with no confirmation, an operator who pastes the
 * wrong thing cannot tell whether the button missed or they pasted into the
 * wrong place, so the same doubt attaches to every later copy.
 */
export function useCopyFeedback(): CopyFeedback {
  const [state, setState] = useState<ClipboardOutcome | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback((text: string, from = "") => {
    void copyTextToClipboard(text).then((outcome) => {
      setState(outcome);
      setSource(from);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setState(null);
        setSource(null);
      }, FEEDBACK_MS);
    });
  }, []);

  const stateFor = useCallback(
    (from: string) => (source === from ? state : null),
    [source, state],
  );

  return { state, source, copy, stateFor };
}

/**
 * What a copy command calls itself after it runs. A blocked copy has to say so
 * on the button itself - left reading "Copy note" it looks exactly like the
 * silent no-op this whole path exists to remove.
 */
export function copyButtonLabel(
  state: ClipboardOutcome | null,
  idle: string,
): string {
  if (state === "copied") return "Copied";
  if (state === "blocked") return "Copy blocked";
  return idle;
}

/** The line shown beside a copy command after it runs. */
export function copyFeedbackMessage(
  state: ClipboardOutcome | null,
  subject = "Note",
): string {
  switch (state) {
    case "copied":
      return `${subject} copied to the clipboard.`;
    case "empty":
      return `Nothing to copy yet — document the encounter first.`;
    case "blocked":
      return `This browser blocked the copy. Select the text and copy it by hand.`;
    default:
      return "";
  }
}
