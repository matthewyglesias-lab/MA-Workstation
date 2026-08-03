import { useEffect, useRef, useState } from "preact/hooks";

export type RecordActionKind = "attest" | "discard";

export interface LocalAttestationReview {
  patient: string;
  localRecord: string;
  medication: string;
  disposition: string;
  staff: string;
  timestamp: string;
  statementVersion: string;
}

interface RecordActionDialogProps {
  kind: RecordActionKind;
  recordLabel?: string;
  attestation?: LocalAttestationReview;
  /** Return false when validation or browser-local persistence fails. */
  onConfirm: () => boolean | Promise<boolean>;
  onClose: () => void;
}

/**
 * Explicit confirmation for the two irreversible local-record transitions.
 * This stays distinct from ordinary navigation: starting a new injection
 * retains the current draft, while discard removes it.
 */
export function RecordActionDialog({
  kind,
  recordLabel = "this injection",
  attestation,
  onConfirm,
  onClose,
}: RecordActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAttestation = kind === "attest";
  const title = isAttestation
    ? "Attest & lock local record"
    : "Discard Local Draft";
  const confirmLabel = isAttestation ? "Attest & lock local record" : "Discard draft";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // The safe, non-destructive choice is the initial focus target.
    keepEditingRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const confirm = async () => {
    if (submitting || (isAttestation && !acknowledged)) return;
    setSubmitting(true);
    setError(null);
    try {
      const completed = await onConfirm();
      if (completed) {
        onClose();
        return;
      }
      setError(
        isAttestation
          ? "The local record could not be locked. It is still editable; review the required fields and browser-local storage, then try again."
          : "The local draft could not be discarded. It remains available for review.",
      );
    } catch {
      setError(
        isAttestation
          ? "The local record could not be locked. It is still editable; no lock was recorded."
          : "The local draft could not be discarded. It remains available for review.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      class="cd2004-dialog-layer cd2004-dialog cd2004-record-action-dialog"
      aria-labelledby="cd2004-record-action-title"
      aria-describedby="cd2004-record-action-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div class="cd2004-dialog-frame">
        <div class="cd2004-dialog-titlebar">
          <span id="cd2004-record-action-title">{title}</span>
          <button type="button" aria-label="Close confirmation" onClick={onClose}>
            X
          </button>
        </div>
        <div class="cd2004-dialog-body" id="cd2004-record-action-description">
          {isAttestation ? (
            <>
              <p>
                Review and attest this browser-local injection record for{" "}
                <strong>{recordLabel}</strong>.
              </p>
              <dl class="cd2004-attestation-review" aria-label="Local record review">
                <div>
                  <dt>Patient</dt>
                  <dd>{attestation?.patient || "Not entered"}</dd>
                </div>
                <div>
                  <dt>Local visit / record</dt>
                  <dd>{attestation?.localRecord || "Not assigned"}</dd>
                </div>
                <div>
                  <dt>Medication</dt>
                  <dd>{attestation?.medication || "Not entered"}</dd>
                </div>
                <div>
                  <dt>Disposition</dt>
                  <dd>{attestation?.disposition || "Not documented"}</dd>
                </div>
                <div>
                  <dt>Documenting staff</dt>
                  <dd>{attestation?.staff || "Not signed in"}</dd>
                </div>
                <div>
                  <dt>Local timestamp</dt>
                  <dd>{attestation?.timestamp || "Not available"}</dd>
                </div>
              </dl>
              <p class="cd2004-record-action-warning">
                This creates a browser-local attestation and locks the original record. A locked record is read-only; use a dated addendum for later clarification.
              </p>
              <label class="cd2004-attestation-acknowledgement">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.currentTarget.checked)}
                />
                <span>
                  I attest that I reviewed this local record before locking it.
                  {attestation?.statementVersion && (
                    <small>Statement {attestation.statementVersion}</small>
                  )}
                </span>
              </label>
            </>
          ) : (
            <>
              <p>
                Discard the editable local injection draft for <strong>{recordLabel}</strong>?
              </p>
              <p class="cd2004-record-action-warning">
                This removes the saved browser-local draft and clears the worksheet. It cannot be undone.
              </p>
              <small>Locked records cannot be discarded.</small>
            </>
          )}
          {error && <p class="cd2004-record-action-error" role="alert">{error}</p>}
        </div>
        <div class="cd2004-dialog-actions">
          <span />
          <button
            ref={keepEditingRef}
            type="button"
            disabled={submitting}
            onClick={onClose}
          >
            {isAttestation ? "Back to editing" : "Keep editing"}
          </button>
          <button
            type="button"
            class={isAttestation ? "is-primary" : "is-danger"}
            disabled={submitting || (isAttestation && !acknowledged)}
            onClick={confirm}
          >
            {submitting ? "Validating local record…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
