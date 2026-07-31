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
  const layerRef = useRef<HTMLDivElement>(null);
  const staffControlRef = useRef<HTMLInputElement>(null);
  const locationControlRef = useRef<HTMLSelectElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const shell = document.querySelector<HTMLElement>('.cd2004-shell');
    const shellWasInert = Boolean(shell?.inert);
    const shellAriaHidden = shell?.getAttribute('aria-hidden');
    if (shell) {
      shell.inert = true;
      shell.setAttribute('aria-hidden', 'true');
    }

    (kind === 'staff'
      ? staffControlRef.current
      : locationControlRef.current
    )?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [
        ...(layerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter(
        (control) =>
          control.offsetParent !== null &&
          control.getAttribute('aria-hidden') !== 'true',
      );
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      if (shell) {
        shell.inert = shellWasInert;
        if (shellAriaHidden == null) shell.removeAttribute('aria-hidden');
        else shell.setAttribute('aria-hidden', shellAriaHidden);
      }
      globalThis.setTimeout(() => {
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      }, 0);
    };
  }, [kind]);

  const submit = (event: Event) => {
    event.preventDefault();
    if (kind === 'staff') onSaveStaff?.(staff.trim());
    else onSaveLocation?.(location);
    onClose();
  };

  return (
    <div ref={layerRef} class="cd2004-dialog-layer" role="presentation">
      <button
        type="button"
        class="cd2004-dialog-scrim"
        aria-label="Close context editor"
        onClick={onClose}
      />
      <section
        class="cd2004-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cd2004-context-title"
      >
        <div class="cd2004-dialog-titlebar">
          <span id="cd2004-context-title">
            {kind === 'staff' ? 'Staff Sign-In' : 'Visit Location'}
          </span>
          <button type="button" aria-label="Close" onClick={onClose}>
            ×
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
      </section>
    </div>
  );
}
