import { useEffect, useRef } from "preact/hooks";

import { DesktopIcon } from "../DesktopIcon";
import { KIOSK, SHELL } from "../vocabulary";

interface SignAndNextCardProps {
  patientLabel: string;
  onPrintHandout: () => void;
  onStartNextPatient: () => void;
}

/** The focused, two-choice end of the signed-note loop. */
export function SignAndNextCard({
  patientLabel,
  onPrintHandout,
  onStartNextPatient,
}: SignAndNextCardProps) {
  const cardRef = useRef<HTMLElement>(null);

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
        <button type="button" class="is-primary" onClick={onStartNextPatient}>
          <DesktopIcon name="new" />
          {KIOSK.startNextPatient}
        </button>
      </div>
    </section>
  );
}
