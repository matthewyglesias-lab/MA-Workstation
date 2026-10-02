export const WORKSTATION_FIELD_LOOKUP_REQUEST =
  "ipmg:workstation-field-lookup-request";

export const WORKSTATION_DRAFT_SAVE_REQUEST =
  "ipmg:workstation-draft-save-request";

export const WORKSTATION_UDS_LEAVE_BLOCKED_REQUEST =
  "ipmg:workstation-uds-leave-blocked-request";

export interface WorkstationFieldLookupRequestDetail {
  select: HTMLSelectElement;
}

/**
 * Typed workflows can request the shell-owned F9 lookup without importing the
 * shell or duplicating dialog state. The request stays inside the workstation
 * DOM and carries only the select control whose existing options are the
 * authoritative local value set.
 */
export function requestWorkstationFieldLookup(select: HTMLSelectElement) {
  select.dispatchEvent(
    new CustomEvent<WorkstationFieldLookupRequestDetail>(
      WORKSTATION_FIELD_LOOKUP_REQUEST,
      {
        bubbles: true,
        detail: { select },
      },
    ),
  );
}

export interface WorkstationDraftSaveRequestDetail {
  workflow: "uds";
  /** Set synchronously by the mounted workflow that owns the request. */
  handled: boolean;
  /** Set synchronously to the persistence result when the request is handled. */
  saved: boolean;
}

export interface WorkstationUdsLeaveBlockedRequestDetail {
  reason: "addendum" | "photo";
}

/**
 * The shell owns the shared F12 command deck while migrated workflows own
 * their persistence. This typed event keeps the command wired to the active
 * workflow without reaching into a panel's private repository state.
 */
export function requestWorkstationDraftSave(
  workflow: WorkstationDraftSaveRequestDetail["workflow"],
): boolean {
  const detail: WorkstationDraftSaveRequestDetail = {
    workflow,
    handled: false,
    saved: false,
  };
  window.dispatchEvent(
    new CustomEvent<WorkstationDraftSaveRequestDetail>(
      WORKSTATION_DRAFT_SAVE_REQUEST,
      { detail },
    ),
  );
  return detail.handled && detail.saved;
}

/** Asks the mounted UDS editor to explain and focus a navigation veto. */
export function requestWorkstationUdsLeaveBlocked(
  reason: WorkstationUdsLeaveBlockedRequestDetail["reason"],
) {
  window.dispatchEvent(
    new CustomEvent<WorkstationUdsLeaveBlockedRequestDetail>(
      WORKSTATION_UDS_LEAVE_BLOCKED_REQUEST,
      { detail: { reason } },
    ),
  );
}

export const WORKSTATION_OPEN_NOTE_REQUEST = "ipmg:workstation-open-note-request";

export interface WorkstationOpenNoteRequestDetail {
  /** Panel-owned note types only. Injection opens through the shell's own prop. */
  noteType: "uds";
  recordId: string;
}

/**
 * The patient chart can open any note it lists, but not every note type is
 * openable from the shell: UDS records are owned by `UdsPanel`, which holds
 * the encounter state a record restores into. This typed request lets the
 * chart ask that panel to open one without the shell importing it or
 * duplicating its restore logic - the same arrangement `WORKSTATION_DRAFT_SAVE_REQUEST`
 * already uses for F12.
 */
export function requestWorkstationOpenNote(
  detail: WorkstationOpenNoteRequestDetail,
) {
  window.dispatchEvent(
    new CustomEvent<WorkstationOpenNoteRequestDetail>(
      WORKSTATION_OPEN_NOTE_REQUEST,
      { detail },
    ),
  );
}
