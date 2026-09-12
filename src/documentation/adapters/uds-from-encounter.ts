import {
  displayedUdsPanels,
  udsControlLabel,
  udsPanelName,
  udsReasonLabel,
  udsTempLabel,
  UDS_RESULT_LABEL,
  type UdsEncounter,
} from "../../domain/uds";
import type { UdsDocumentationInput } from "../types";
import {
  compactChartLocalDateTime,
  isValidLocalDateTime,
} from "../../domain/dates";

const trimmed = (value?: string): string => (value ?? "").trim();

const formatMonth = (isoMonth: string): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed(isoMonth));
  if (!match) return trimmed(isoMonth);
  return `${match[2]}/${match[1]}`;
};

/**
 * Pure, DOM-free equivalent of legacy/documentation-adapter.ts's
 * readLegacyUdsDocumentation(), for a panel bound directly to a typed
 * UdsEncounter instead of the legacy DOM.
 */
export function udsEncounterToDocumentationInput(
  encounter: UdsEncounter,
): UdsDocumentationInput | null {
  const started = Boolean(
    trimmed(encounter.patient.name) ||
      trimmed(encounter.patient.dob) ||
      encounter.reason ||
      trimmed(encounter.device) ||
      trimmed(encounter.lot) ||
      trimmed(encounter.expiration) ||
      trimmed(encounter.comment ?? "") ||
      encounter.physicalReadingsVerified,
  );
  if (!started) return null;

  const verified = encounter.physicalReadingsVerified;
  const displayedPanels = displayedUdsPanels(encounter);
  // Facts only: which analyte read what. The note's wording - what leads, what
  // is grouped, which findings call for a person - is composed once in
  // ../uds.ts, so this adapter and the legacy DOM reader cannot drift apart.
  const resultGroups = verified
    ? [
        {
          label: "Point-of-care panel results",
          results: displayedPanels
            .map((panel) => ({
              analyte: udsPanelName(panel),
              result: UDS_RESULT_LABEL[encounter.results[panel] ?? "nt"],
              state: encounter.results[panel] ?? ("nt" as const),
            }))
            .filter((entry) => entry.state !== "nt"),
        },
      ]
    : [];

  const control = verified ? udsControlLabel(encounter.control) : "";
  const validity = verified ? encounter.validity : "";

  const outsideLabPlan =
    encounter.labPlan === "ordered" ||
    encounter.labPlan === "recommended" ||
    encounter.labPlan === "not needed"
      ? encounter.labPlan
      : undefined;

  return {
    collection: {
      reason: encounter.reason
        ? encounter.reason === "other" && trimmed(encounter.reasonDetail)
          ? `${udsReasonLabel(encounter.reason)} — ${trimmed(encounter.reasonDetail)}`
          : udsReasonLabel(encounter.reason)
        : undefined,
      collectedAt:
        verified && isValidLocalDateTime(encounter.collectionDateTime)
          ? compactChartLocalDateTime(encounter.collectionDateTime)
          : undefined,
      collectedBy: trimmed(encounter.collector) || undefined,
      specimen: verified ? "Urine" : undefined,
      device: trimmed(encounter.customDeviceName) || trimmed(encounter.device) || undefined,
      lot: trimmed(encounter.lot) || undefined,
      expiration: formatMonth(encounter.expiration) || trimmed(encounter.expiration) || undefined,
      temperature: verified ? udsTempLabel(encounter.temperature) : undefined,
    },
    controlReview: verified
      ? {
          control: control || undefined,
          controlState: encounter.control,
          validity: validity || undefined,
          validityState: encounter.validity,
          integrity: ["Physical cup and displayed panel readings verified."],
        }
      : undefined,
    resultGroups: resultGroups.length && resultGroups[0]!.results.length ? resultGroups : undefined,
    medicationAlignmentState:
      encounter.medicationAlignment && encounter.medicationAlignment !== "no unexpected"
        ? encounter.medicationAlignment
        : undefined,
    patientContext: trimmed(encounter.comment ?? "") || undefined,
    outsideLabPlanState: outsideLabPlan,
  };
}
