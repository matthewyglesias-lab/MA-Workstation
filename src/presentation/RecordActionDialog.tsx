import { useEffect, useRef, useState } from "preact/hooks";
import {
  discardDraftPrompt,
  noteReviewPrompt,
  PATIENT,
  RECORD,
} from "./vocabulary";

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
  /** What kind of record this is, for the body sentences. Defaults to
   * "injection" so the original caller's wording is unchanged. */
  recordNoun?: string;
  /** Overrides the attestation-review list's Medication/Disposition labels,
   * for callers whose record shape doesn't literally have those fields. */
  attestationLabels?: { medication?: string; disposition?: string };
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
  recordNoun = "injection",
  attestationLabels,
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
    ? RECORD.sign
    : RECORD.discardDraft;
  const confirmLabel = isAttestation ? RECORD.sign : RECORD.discardDraft;

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
        isAttestation ? RECORD.signFailedRetry : RECORD.discardFailed,
      );
    } catch {
      setError(isAttestation ? RECORD.signFailed : RECORD.discardFailed);
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
          <button type="button" aria-label={RECORD.closeConfirmation} onClick={onClose}>
            X
          </button>
        </div>
        <div class="cd2004-dialog-body" id="cd2004-record-action-description">
          {isAttestation ? (
            <>
              <p>
                {noteReviewPrompt(recordNoun)} <strong>{recordLabel}</strong> before signing.
              </p>
              <dl class="cd2004-attestation-review" aria-label={RECORD.noteReview}>
                <div>
                  <dt>Patient</dt>
                  <dd>{attestation?.patient || "Not entered"}</dd>
                </div>
                <div>
                  <dt>{PATIENT.visitRecord}</dt>
                  <dd>{attestation?.localRecord || "Not assigned"}</dd>
                </div>
                <div>
                  <dt>{attestationLabels?.medication ?? "Medication"}</dt>
                  <dd>{attestation?.medication || "Not entered"}</dd>
                </div>
                <div>
                  <dt>{attestationLabels?.disposition ?? "Disposition"}</dt>
                  <dd>{attestation?.disposition || "Not documented"}</dd>
                </div>
                <div>
                  <dt>Documenting staff</dt>
                  <dd>{attestation?.staff || PATIENT.notSignedIn}</dd>
                </div>
                <div>
                  <dt>{RECORD.signatureTime}</dt>
                  <dd>{attestation?.timestamp || "Not available"}</dd>
                </div>
              </dl>
              <p class="cd2004-record-action-warning">
                {RECORD.signReadOnlyDetail}
              </p>
              <label class="cd2004-attestation-acknowledgement">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.currentTarget.checked)}
                />
                <span>
                  {RECORD.signAcknowledgement}
                </span>
              </label>
            </>
          ) : (
            <>
              <p>
                {discardDraftPrompt(recordNoun)} <strong>{recordLabel}</strong>?
              </p>
              <p class="cd2004-record-action-warning">
                {RECORD.discardWarning}
              </p>
              <small>{RECORD.signedCannotDiscard}</small>
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
            {isAttestation ? RECORD.backToEditing : RECORD.keepEditing}
          </button>
          <button
            type="button"
            class={isAttestation ? "is-primary" : "is-danger"}
            disabled={submitting || (isAttestation && !acknowledged)}
            onClick={confirm}
          >
            {submitting
              ? isAttestation
                ? RECORD.signing
                : RECORD.discarding
              : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
