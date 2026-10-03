import { useEffect, useLayoutEffect, useState } from "preact/hooks";
import { feedbackPresentation, type FeedbackPurpose } from "./interaction/use-workstation-feedback";

interface ToastProps {
  /** The latest status message. Empty or unchanged text shows nothing new. */
  message: string;
  /** How long a message stays on screen. */
  durationMs?: number;
  purpose?: FeedbackPurpose;
}

/** One status owner for explicit action outcomes and quiet navigation. Legacy
 * notifications retain their own expiry and are never filtered by wording. */
export function Toast({ message, durationMs = 4000, purpose = "action" }: ToastProps) {
  const [shown, setShown] = useState({ message: "", purpose });
  const [compatibilityMessage, setCompatibilityMessage] = useState("");

  useLayoutEffect(() => {
    const source = document.getElementById("toast");
    if (!source) return;
    // The classic runtime still writes this message sink and owns its expiry.
    // Consume that output in the one notification surface; do not wrap its
    // global function or discard messages from a save/storage failure.
    const previousHidden = source.getAttribute("aria-hidden");
    const previousOwner = source.getAttribute("data-notification-adapter");
    const previousInert = source.inert;
    const sync = () => setCompatibilityMessage(source.classList.contains("show")
      ? source.querySelector("#toastMsg")?.textContent?.trim() ?? "" : "");
    const observer = new MutationObserver(sync);
    observer.observe(source, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["class"] });
    source.setAttribute("data-notification-adapter", "true");
    source.setAttribute("aria-hidden", "true");
    source.inert = true;
    sync();
    return () => {
      observer.disconnect();
      if (previousOwner === null) source.removeAttribute("data-notification-adapter");
      else source.setAttribute("data-notification-adapter", previousOwner);
      if (previousHidden === null) source.removeAttribute("aria-hidden");
      else source.setAttribute("aria-hidden", previousHidden);
      source.inert = previousInert;
    };
  }, []);

  useEffect(() => {
    const next = message.trim();
    if (!next) {
      setShown({ message: "", purpose });
      return;
    }
    setShown({ message: next, purpose });
    const timer = globalThis.setTimeout(() => setShown({ message: "", purpose }), durationMs);
    return () => globalThis.clearTimeout(timer);
  }, [message, purpose, durationMs]);

  const { visible: messages, announcement } = feedbackPresentation(shown.message, shown.purpose, compatibilityMessage);
  return (
    <div
      class="tebra-toast-region cd2004-print-exclude"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {announcement && <span class="cd2004-visually-hidden" data-navigation-announcement>{announcement}</span>}
      {messages.length ? (
        <p class="tebra-toast" data-toast>
          {messages.map(text => <span key={text}>{text}</span>)}
        </p>
      ) : null}
    </div>
  );
}
