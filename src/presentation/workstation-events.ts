export const WORKSTATION_FIELD_LOOKUP_REQUEST =
  "ipmg:workstation-field-lookup-request";

export const WORKSTATION_DRAFT_SAVE_REQUEST =
  "ipmg:workstation-draft-save-request";

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
}

/**
 * The shell owns the shared F12 command deck while migrated workflows own
 * their persistence. This typed event keeps the command wired to the active
 * workflow without reaching into a panel's private repository state.
 */
export function requestWorkstationDraftSave(
  workflow: WorkstationDraftSaveRequestDetail["workflow"],
) {
  window.dispatchEvent(
    new CustomEvent<WorkstationDraftSaveRequestDetail>(
      WORKSTATION_DRAFT_SAVE_REQUEST,
      { detail: { workflow } },
    ),
  );
}
