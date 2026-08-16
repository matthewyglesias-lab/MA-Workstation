import type { UdsEncounter } from "../../../domain/uds";
import { setLegacyCheckboxValue, setLegacyFieldValue } from "../legacy-mirror";

declare global {
  interface Window {
    ipmgSetUdsChipState?: (patch: {
      reason?: string;
      temp?: string;
      control?: string;
      results?: Record<string, string>;
      photoData?: string;
      omittedPanel?: string;
      readingsVerified?: boolean;
      customPanelSetVerified?: boolean;
      reasonDetail?: string;
      customDeviceName?: string;
      customPanels?: string[];
    }) => void;
  }
}

/**
 * Mirrors a UdsEncounter into the hidden legacy #panel-uds fields (and the
 * legacy UDS chip/photo state, which isn't backed by a DOM value) so
 * renderUdsReport(), renderUdsPatientSummary(), the readiness/note
 * computation, and "Add UDS to log" keep working unchanged, driven by this
 * panel instead of the legacy interactive markup.
 */
export function mirrorUdsEncounterToLegacyDom(
  encounter: UdsEncounter,
  photoData?: string,
): void {
  setLegacyFieldValue("udsPtName", encounter.patient.name);
  setLegacyFieldValue("udsDOB", encounter.patient.dob);
  setLegacyFieldValue("udsCollector", encounter.collector);
  setLegacyFieldValue("udsDateTime", encounter.collectionDateTime);
  setLegacyFieldValue("udsDevice", encounter.device);
  setLegacyFieldValue("udsLot", encounter.lot);
  setLegacyFieldValue("udsExp", encounter.expiration);
  setLegacyFieldValue("udsComment", encounter.comment ?? "");
  setLegacyFieldValue("udsValidity", encounter.validity);
  setLegacyFieldValue("udsConsistent", encounter.medicationAlignment);
  setLegacyFieldValue("udsLab", encounter.labPlan ?? "provider to decide");

  window.ipmgSetUdsChipState?.({
    reason: encounter.reason,
    temp: encounter.temperature,
    control: encounter.control,
    results: encounter.results as Record<string, string>,
    photoData,
    omittedPanel: encounter.omittedPanel ?? "",
    readingsVerified: encounter.physicalReadingsVerified,
    // Without this the shell reads the encounter back with the flag pinned
    // false, so the "Other point-of-care UDS cup" stop could never clear no
    // matter what the operator checked.
    customPanelSetVerified: encounter.customPanelSetVerified ?? false,
    reasonDetail: encounter.reasonDetail ?? "",
    customDeviceName: encounter.customDeviceName ?? "",
    customPanels: encounter.customPanels ?? [],
  });
}

export function mirrorUdsSignatureToggle(includeSignatureFields: boolean): void {
  setLegacyCheckboxValue("udsSigToggle", includeSignatureFields);
}
