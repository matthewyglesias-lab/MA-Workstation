import { NOTES } from "../vocabulary";
import type { NoteStatus } from "./note-table-model";

interface StatusChipProps {
  status: NoteStatus;
}

const labelFor = (status: NoteStatus): string => {
  switch (status) {
    case "ready-to-sign":
      return NOTES.statusReadyToSign;
    case "signed":
      return NOTES.statusSigned;
    case "incomplete":
      return NOTES.statusIncomplete;
  }
};

export function StatusChip({ status }: StatusChipProps) {
  return (
    <span
      class={`note-status-chip records-drawer-row-badge ${status}`}
      data-note-status={status}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        {status === "incomplete" ? (
          <circle cx="6" cy="6" r="3.25" fill="currentColor" />
        ) : status === "ready-to-sign" ? (
          <path d="m2.2 6.1 2.25 2.2L9.9 2.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        ) : (
          <>
            <rect x="2.25" y="5" width="7.5" height="5.25" rx="1" fill="none" stroke="currentColor" stroke-width="1.25" />
            <path d="M4 5V3.75a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
          </>
        )}
      </svg>
      <span>{labelFor(status)}</span>
    </span>
  );
}
