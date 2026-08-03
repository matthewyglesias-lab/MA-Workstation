import type { FormsEncounter } from "../../../domain/forms";
import { setLegacyFieldValue } from "../legacy-mirror";

declare global {
  interface Window {
    ipmgSetFormsChipState?: (patch: {
      requestType?: string;
      status?: string;
      letterType?: string;
    }) => void;
  }
}

/**
 * Mirrors a FormsEncounter into the hidden legacy #panel-forms fields (and
 * the legacy FORMS/LETTER chip state, which isn't backed by a DOM value) so
 * renderLetterSheet(), formsNoteText(), formsReadinessIssues(), and the
 * "Add forms item to log" action keep working unchanged, driven by this
 * panel instead of the legacy interactive markup.
 */
export function mirrorFormsEncounterToLegacyDom(encounter: FormsEncounter): void {
  setLegacyFieldValue("formsPtName", encounter.patient.name);
  setLegacyFieldValue("formsDOB", encounter.patient.dob);
  setLegacyFieldValue("formsDate", encounter.requestDate);
  setLegacyFieldValue("formsDue", encounter.targetDate);
  setLegacyFieldValue("formsProvider", encounter.provider);
  setLegacyFieldValue("formsStaff", encounter.staff);
  setLegacyFieldValue("formsFee", encounter.feeStatus);
  setLegacyFieldValue("formsDelivery", encounter.deliveryMethod);
  setLegacyFieldValue("formsNotified", encounter.notificationStatus);
  setLegacyFieldValue("formsNotes", encounter.notes ?? "");
  setLegacyFieldValue("formsAction", encounter.actionNotes ?? "");
  setLegacyFieldValue("formsFollowUp", encounter.followUpNotes ?? "");
  setLegacyFieldValue(
    "formsApproval",
    encounter.providerApprovalConfirmed ? "Provider approved for release" : "",
  );
  setLegacyFieldValue("letterRecipient", encounter.letterRecipient ?? "");
  setLegacyFieldValue("letterRecipientAddress", encounter.letterRecipientAddress ?? "");
  setLegacyFieldValue("letterProvider", encounter.letterProviderName ?? "");
  setLegacyFieldValue("letterCreds", encounter.letterCredentials ?? "");
  setLegacyFieldValue("letterDate", encounter.letterDate ?? "");
  setLegacyFieldValue("letterSubject", encounter.letterSubject ?? "");
  setLegacyFieldValue("letterSignatureMode", encounter.letterSignatureMode ?? "wet");
  setLegacyFieldValue("letterPreparedBy", encounter.letterPreparedBy ?? "");
  setLegacyFieldValue("letterOffStart", encounter.offWorkStart ?? "");
  setLegacyFieldValue("letterOffEnd", encounter.offWorkEnd ?? "");
  setLegacyFieldValue("letterReturn", encounter.returnDate ?? "");
  setLegacyFieldValue("letterDx", encounter.diagnosisWording ?? "");
  setLegacyFieldValue("letterRestrictions", encounter.restrictions ?? "");

  window.ipmgSetFormsChipState?.({
    requestType: encounter.requestType,
    status: encounter.status,
    letterType: encounter.letterType,
  });
}
