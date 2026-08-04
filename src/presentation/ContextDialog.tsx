import { useEffect, useRef, useState } from 'preact/hooks';

export interface ClinicOption {
  value: string;
  label: string;
}

interface ContextDialogProps {
  kind: 'staff' | 'location';
  staffValue?: string;
  locationValue?: string;
  clinicOptions?: ClinicOption[];
  onSaveStaff?: (value: string) => void;
  onClearStaff?: () => void;
  onSaveLocation?: (value: string) => void;
  onClose: () => void;
}

/**
 * Built on the native <dialog> element with showModal(). The platform supplies
 * the top layer, the ::backdrop, Escape-to-cancel, the focus trap, focus
 * restoration on close, and inerting of everything behind it - all of which
 * this component previously hand-rolled against a custom backdrop div.
 */
export function ContextDialog({
  kind,
  staffValue = '',
  locationValue = '',
  clinicOptions = [],
  onSaveStaff,
  onClearStaff,
  onSaveLocation,
  onClose,
}: ContextDialogProps) {
  const [staff, setStaff] = useState(staffValue);
  const [location, setLocation] = useState(locationValue);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const staffControlRef = useRef<HTMLInputElement>(null);
  const locationControlRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // showModal() focuses the first focusable control; steer it to the one the
    // clinician actually came here to edit.
    (kind === 'staff' ? staffControlRef.current : locationControlRef.current)?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [kind]);

  const submit = (event: Event) => {
    event.preventDefault();
    if (kind === 'staff') onSaveStaff?.(staff.trim());
    else onSaveLocation?.(location);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      class="cd2004-dialog-layer cd2004-dialog"
      aria-labelledby="cd2004-context-title"
      onCancel={(event) => {
        // Owned by the parent's state, so intercept the native Escape close.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click landing on the dialog element itself is a backdrop click:
        // the content sits in an inner wrapper, so it never targets the host.
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div class="cd2004-dialog-frame">
        <div class="cd2004-dialog-titlebar">
          <span id="cd2004-context-title">
            {kind === 'staff' ? 'Staff Sign-In' : 'Visit Location'}
          </span>
          <button type="button" aria-label="Close" onClick={onClose}>
            X
          </button>
        </div>
        <form onSubmit={submit}>
          <div class="cd2004-dialog-body">
            {kind === 'staff' ? (
              <label class="cd2004-dialog-field">
                <span>Name or initials</span>
                <input
                  ref={staffControlRef}
                  value={staff}
                  autocomplete="off"
                  onInput={(event) =>
                    setStaff((event.currentTarget as HTMLInputElement).value)
                  }
                />
                <small>
                  Saved in this browser and applied to compatible encounter fields.
                </small>
              </label>
            ) : (
              <label class="cd2004-dialog-field">
                <span>Visit location</span>
                <select
                  ref={locationControlRef}
                  value={location}
                  onChange={(event) =>
                    setLocation((event.currentTarget as HTMLSelectElement).value)
                  }
                >
                  {clinicOptions.map((option) => (
                    <option value={option.value}>{option.label}</option>
                  ))}
                </select>
                <small>Used for callback lines and patient printouts.</small>
              </label>
            )}
          </div>
          <div class="cd2004-dialog-actions">
            {kind === 'staff' && (
              <button
                type="button"
                onClick={() => {
                  onClearStaff?.();
                  onClose();
                }}
              >
                Clear saved staff
              </button>
            )}
            <span />
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" class="is-primary">
              {kind === 'staff' ? 'Use for encounter' : 'Apply location'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
