import { useEffect, useRef, useState } from "preact/hooks";

const IDLE_LOCK_MINUTES = 15;
const IDLE_LOCK_MS = IDLE_LOCK_MINUTES * 60_000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;

/**
 * Arms after IDLE_LOCK_MS of no mouse/keyboard/touch activity, but only while
 * someone is actually signed in - there is no session to protect otherwise.
 * Any of those events while locked does NOT dismiss the lock; only
 * WorkstationLock's own explicit unlock does, the same as a real OS lock
 * screen ignoring input until the unlock UI itself is used.
 */
export function useIdleLock(staffSignedIn: boolean): [boolean, () => void] {
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const armRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!staffSignedIn) {
      lockedRef.current = false;
      setLocked(false);
      return;
    }
    const arm = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        lockedRef.current = true;
        setLocked(true);
      }, IDLE_LOCK_MS);
    };
    armRef.current = arm;
    const onActivity = () => {
      if (!lockedRef.current) arm();
    };
    arm();
    for (const type of ACTIVITY_EVENTS) {
      document.addEventListener(type, onActivity, { passive: true });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const type of ACTIVITY_EVENTS) {
        document.removeEventListener(type, onActivity);
      }
    };
  }, [staffSignedIn]);

  const unlock = () => {
    lockedRef.current = false;
    setLocked(false);
    armRef.current();
  };
  return [locked, unlock];
}

export interface WorkstationLockProps {
  /** Display label for the currently signed-in staff member, e.g. "A. Rivera, MA". */
  staffLabel: string;
  onUnlock: () => void;
}

/**
 * Windows-2000-style "workstation locked" overlay. Native <dialog> supplies
 * the top layer, inerting of everything behind it, and focus trapping -
 * deliberately NOT using the shared ModalDialog wrapper, since that one is
 * built to be dismissed by Escape or a backdrop click and a lock screen must
 * not be. Unlocking requires re-typing the signed-in staff name (case/space
 * insensitive) - there is no password concept anywhere in this app (staff
 * sign-in is a free-text attestation field, not an authenticated account),
 * so this is a conscious re-confirmation of identity, not real access
 * control.
 */
export function WorkstationLock({ staffLabel, onUnlock }: WorkstationLockProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [attempt, setAttempt] = useState("");
  const [showMismatch, setShowMismatch] = useState(false);
  const [lockedAt] = useState(() => new Date());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    inputRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const normalized = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const matches = normalized(attempt).length > 0 && normalized(attempt) === normalized(staffLabel);

  const submit = () => {
    if (matches) {
      onUnlock();
      return;
    }
    setShowMismatch(true);
    inputRef.current?.select();
  };

  return (
    <dialog
      ref={dialogRef}
      class="cd2004-lock-overlay"
      aria-labelledby="workstationLockTitle"
      onCancel={(event) => {
        // A lock screen that Escape dismisses is not a lock screen.
        event.preventDefault();
      }}
    >
      <div class="cd2004-lock-card">
        <div class="cd2004-lock-icon" aria-hidden="true">
          🔒
        </div>
        <h2 id="workstationLockTitle">This workstation is locked</h2>
        <p class="cd2004-lock-detail">
          Locked at {lockedAt.toLocaleTimeString()} after {IDLE_LOCK_MINUTES} minutes of inactivity.
        </p>
        <p class="cd2004-lock-staff">
          Signed in: <strong>{staffLabel}</strong>
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label class="cd2004-lock-label" for="workstationLockInput">
            Type your name to unlock
          </label>
          <input
            ref={inputRef}
            id="workstationLockInput"
            type="text"
            value={attempt}
            autocomplete="off"
            onInput={(event) => {
              setAttempt(event.currentTarget.value);
              if (showMismatch) setShowMismatch(false);
            }}
          />
          {showMismatch && (
            <p class="cd2004-lock-mismatch" role="alert">
              That name does not match the signed-in staff member.
            </p>
          )}
          <button type="submit" disabled={!attempt.trim()}>
            Unlock
          </button>
        </form>
      </div>
    </dialog>
  );
}
