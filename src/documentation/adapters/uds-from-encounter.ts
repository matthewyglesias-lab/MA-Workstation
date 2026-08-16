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
import { isValidLocalDateTime } from "../../domain/dates";

const trimmed = (value?: string): string => (value ?? "").trim();

const unique = (items: string[]): string[] => [...new Set(items)];

const formatDateTime = (isoLocal: string): string => {
  if (!isoLocal || !isValidLocalDateTime(isoLocal)) return "";
  const date = new Date(isoLocal);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

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
  const resultGroups = verified
    ? [
        {
          label: "Point-of-care panel results",
          results: displayedPanels.map((panel) => ({
            analyte: udsPanelName(panel),
            result: UDS_RESULT_LABEL[encounter.results[panel] ?? "nt"],
          })).filter((entry) => entry.result !== "Not tested"),
        },
      ]
    : [];

  const control = verified ? udsControlLabel(encounter.control) : "";
  const validity = verified ? encounter.validity : "";

  const attention: string[] = [];
  if (/invalid|not documented/i.test(control)) {
    attention.push(`${control}; do not interpret the screening result.`);
  }
  displayedPanels.forEach((panel) => {
    const state = encounter.results[panel] ?? "nt";
    if (state === "pos") {
      attention.push(`${udsPanelName(panel)} preliminary positive requires provider review.`);
    }
    if (state === "invalid") {
      attention.push(`${udsPanelName(panel)} is invalid / unreadable and should not be interpreted.`);
    }
  });
  if (validity === "needs review") {
    attention.push("Validity markers require provider review.");
  }
  if (encounter.medicationAlignment === "not aligned" || encounter.medicationAlignment === "needs review") {
    attention.push("Medication alignment requires clinician review.");
  }

  const plan: string[] = [];
  if (verified) {
    plan.push("Results documented as a point-of-care preliminary screening result.");
  }
  if (/invalid|not documented/i.test(control)) {
    plan.push("Do not interpret; repeat collection or use outside laboratory confirmation per provider direction.");
  } else if (displayedPanels.some((panel) => encounter.results[panel] === "invalid")) {
    plan.push("Repeat affected invalid panel(s) or use outside laboratory confirmation per provider direction.");
  } else if (displayedPanels.some((panel) => encounter.results[panel] === "pos")) {
    plan.push("Route preliminary positive finding(s) for clinician review in clinical context.");
  }

  const outsideLabPlan =
    encounter.labPlan && encounter.labPlan !== "provider to decide" ? encounter.labPlan : "";

  return {
    summary: "Point-of-care urine drug screen documentation.",
    patient: trimmed(encounter.patient.name) || undefined,
    dob: trimmed(encounter.patient.dob) || undefined,
    collection: {
      reason: encounter.reason
        ? encounter.reason === "other" && trimmed(encounter.reasonDetail)
          ? `${udsReasonLabel(encounter.reason)} — ${trimmed(encounter.reasonDetail)}`
          : udsReasonLabel(encounter.reason)
        : undefined,
      collectedAt:
        verified && isValidLocalDateTime(encounter.collectionDateTime)
          ? formatDateTime(encounter.collectionDateTime)
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
          validity: validity || undefined,
          integrity: ["Physical cup and displayed panel readings verified."],
        }
      : undefined,
    resultGroups: resultGroups.length && resultGroups[0]!.results.length ? resultGroups : undefined,
    medicationAlignment:
      encounter.medicationAlignment && encounter.medicationAlignment !== "no unexpected"
        ? encounter.medicationAlignment
        : undefined,
    clinicianAttention: attention.length ? unique(attention) : undefined,
    patientContext: trimmed(encounter.comment ?? "") || undefined,
    plan: plan.length ? unique(plan) : undefined,
    outsideLabPlan: outsideLabPlan || undefined,
  };
}
