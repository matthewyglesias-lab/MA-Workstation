export type ClinicalPrintRequest =
  | "injection-avs"
  | "injection-worksheet"
  | "injection-worksheet-blank"
  | "uds-clinician-report"
  | "uds-patient-summary";

export interface ClinicalPrintRequestResult {
  ok: boolean;
  reason?: "control-missing" | "control-disabled";
}

const LEGACY_PRINT_CONTROL: Record<ClinicalPrintRequest, string> = {
  "injection-avs": "printAVS",
  "injection-worksheet": "injWorksheetPrint",
  "injection-worksheet-blank": "injWorksheetBlank",
  "uds-clinician-report": "printUdsReport",
  "uds-patient-summary": "printUdsPatient",
};

/**
 * Single visible-workstation bridge into the retained print renderers.
 *
 * The renderers and their visual baselines remain unchanged during the typed
 * workflow migration. All migrated Injection/UDS controls enter them through
 * this named boundary so missing or disabled compatibility controls fail
 * closed instead of silently issuing a different print action.
 */
export function requestClinicalPrint(
  request: ClinicalPrintRequest,
): ClinicalPrintRequestResult {
  const control = document.getElementById(
    LEGACY_PRINT_CONTROL[request],
  ) as HTMLButtonElement | null;
  if (!control) return { ok: false, reason: "control-missing" };
  if (control.disabled || control.getAttribute("aria-disabled") === "true") {
    return { ok: false, reason: "control-disabled" };
  }
  control.click();
  return { ok: true };
}
