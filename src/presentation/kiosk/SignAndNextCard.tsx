import { useEffect, useRef, useState } from "preact/hooks";

import { DesktopIcon } from "../DesktopIcon";
import { KIOSK, SHELL } from "../vocabulary";
import { useCopyFeedback, copyButtonLabel, copyFeedbackMessage } from "../clipboard";

interface SignAndNextCardProps {
  patientLabel: string;
  noteText: string;
  copyUnsafe?: boolean;
  onPrintHandout: () => void;
  onStartNextPatient: () => void | boolean;
}

/** One durable signed outcome; output requests remain separate from Next. */
export function SignAndNextCard({
  patientLabel,
  noteText,
  copyUnsafe,
  onPrintHandout,
  onStartNextPatient,
}: SignAndNextCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const { state: copyState, copy } = useCopyFeedback();
  const startNext = () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    if (onStartNextPatient() === false) {
      startingRef.current = false;
      setStarting(false);
    }
  };

  useEffect(() => {
    // Signing closes a modal and returns focus to a control that this card
    // replaces. Put focus on the outcome itself so screen-reader and keyboard
    // users land at the same clear next decision as sighted staff.
    cardRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      ref={cardRef}
      class="kiosk-sign-next"
      aria-labelledby="kiosk-sign-next-title"
      tabIndex={-1}
      data-kiosk-completion
    >
      <span class="kiosk-sign-next-icon" aria-hidden="true">
        <DesktopIcon name="check" />
      </span>
      <div class="kiosk-sign-next-copy">
        <p>{KIOSK.stateComplete}</p>
        <h1 id="kiosk-sign-next-title">{KIOSK.signedTitle}</h1>
        <span>{KIOSK.signedDetail(patientLabel)}</span>
        <small>{SHELL.localOnlyDetail}.</small>
      </div>
      <div class="kiosk-sign-next-actions">
        <button type="button" class="is-secondary" onClick={onPrintHandout}>
          <DesktopIcon name="print" />
          {KIOSK.printHandout}
        </button>
        <button type="button" class="is-secondary" onClick={() => copy(noteText)} disabled={copyUnsafe || !noteText.trim()}>
          <DesktopIcon name="copy" />{copyButtonLabel(copyState, "Copy note")}
        </button>
        <button type="button" class="is-primary" onClick={startNext} disabled={starting}>
          <DesktopIcon name="new" />
          {KIOSK.startNextPatient}
        </button>
      </div>
      {copyState && <p class="kiosk-copy-feedback" role="status">{copyFeedbackMessage(copyState)}</p>}
    </section>
  );
}
