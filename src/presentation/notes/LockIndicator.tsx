import { noteLockLabel, type NoteLock } from "./note-table-model";

interface LockIndicatorProps {
  lock: NoteLock;
}

export function LockIndicator({ lock }: LockIndicatorProps) {
  const detail = noteLockLabel(lock);
  return (
    <span
      class="note-lock-indicator"
      data-note-lock
      role="img"
      aria-label={detail}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M5.25 7V5a2.75 2.75 0 0 1 5.5 0v2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <span class="note-lock-tooltip" role="tooltip" aria-hidden="true">
        {detail}
      </span>
    </span>
  );
}
