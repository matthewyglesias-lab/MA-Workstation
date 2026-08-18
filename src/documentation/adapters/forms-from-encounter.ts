import {
  formRequestTypeLabel,
  formStatusLabel,
  letterTypeLabel,
  type FormsEncounter,
} from "../../domain/forms";
import type { FormsDocumentationInput } from "../types";
import { resolveProviderDisplay } from "../../domain/provider-register";
import { prettyDate } from "../forms";

const trimmed = (value?: string): string => (value ?? "").trim();

/**
 * Pure, DOM-free equivalent of legacy/documentation-adapter.ts's
 * readLegacyFormsDocumentation(), for panels bound directly to a typed
 * FormsEncounter instead of the legacy DOM.
 */
export function formsEncounterToDocumentationInput(
  encounter: FormsEncounter,
): FormsDocumentationInput {
  const requestCategory = formRequestTypeLabel(encounter.requestType);
  const documentType = letterTypeLabel(encounter.letterType);
  const status = formStatusLabel(encounter.status);
  // `encounter.provider` holds the register id, not a display name.
  const assignedProvider = resolveProviderDisplay(encounter.provider) || trimmed(encounter.letterProviderName);
  const assignedStaff = trimmed(encounter.staff) || trimmed(encounter.letterPreparedBy);

  return {
    summary: `${documentType || requestCategory || "Forms / letter"} handoff.`,
    patient: trimmed(encounter.patient.name) || undefined,
    dob: trimmed(encounter.patient.dob) || undefined,
    requestCategory: requestCategory || undefined,
    documentType: documentType || undefined,
    requestDate: encounter.requestDate ? prettyDate(encounter.requestDate) : undefined,
    requestNotes: trimmed(encounter.notes) || undefined,
    status: status || undefined,
    assignedProvider: assignedProvider || undefined,
    assignedStaff: assignedStaff || undefined,
    targetDate: encounter.targetDate ? prettyDate(encounter.targetDate) : undefined,
    feeStatus:
      encounter.feeStatus && encounter.feeStatus !== "No fee / not applicable"
        ? encounter.feeStatus
        : undefined,
    deliveryMethod: encounter.deliveryMethod || undefined,
    patientNotification:
      encounter.notificationStatus && encounter.notificationStatus !== "Not yet notified"
        ? encounter.notificationStatus
        : undefined,
    approvalStatus: encounter.providerApprovalConfirmed
      ? "Provider approved for release"
      : undefined,
    actions: trimmed(encounter.actionNotes) ? [trimmed(encounter.actionNotes)] : undefined,
    followUp: trimmed(encounter.followUpNotes) ? [trimmed(encounter.followUpNotes)] : undefined,
  };
}
