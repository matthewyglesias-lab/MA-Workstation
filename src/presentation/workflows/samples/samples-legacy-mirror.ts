import type { SamplesEncounter } from "../../../domain/samples";
import { setLegacyFieldValue } from "../legacy-mirror";

declare global {
  interface Window {
    ipmgSetSamplesChipState?: (patch: { medicationKey?: string }) => void;
    ipmgSetSamplePackageTrace?: (id: string, lot: string, exp: string) => void;
    addSampleDoseRow?: (data: { strength?: string; qty?: string; days?: string; sig?: string }) => void;
    clearSampleDoseRows?: () => void;
  }
}

/**
 * Mirrors a SamplesEncounter into the hidden legacy #panel-samples fields
 * (plus SAMPLE_STATE.med and the RC5.42 package-traceability state, neither
 * of which is backed by a plain DOM field value) so renderSampleSheet(),
 * renderSampleWorksheet(), sampleReviewConfirmationCurrent(), and the
 * readiness/note computation keep working unchanged, driven by this panel
 * instead of the legacy interactive markup.
 *
 * The dose-row list (#sampleDoseRows) is rebuilt from scratch on every call
 * rather than diffed: legacy has no id-addressable row API, only
 * addSampleDoseRow()/clearSampleDoseRows(). A fresh rebuild also auto-clears
 * legacy's own package-trace state (via the wrapped clearSampleDoseRows()),
 * so each row's lot/exp is re-applied afterward using whatever id legacy's
 * own lazy rowId() generator assigned to that row - there is no way to
 * pre-assign the id ourselves since addSampleDoseRow() returns no handle to
 * the row it creates.
 */
export function mirrorSamplesEncounterToLegacyDom(encounter: SamplesEncounter): void {
  setLegacyFieldValue("samplePtName", encounter.patient.name);
  setLegacyFieldValue("sampleDOB", encounter.patient.dob);
  setLegacyFieldValue("samplePrescriber", encounter.prescriber);
  setLegacyFieldValue("sampleStaff", encounter.staff);
  setLegacyFieldValue("sampleDate", encounter.dispenseDate);
  setLegacyFieldValue("sampleStart", encounter.startDate);
  setLegacyFieldValue("sampleMedLabel", encounter.medicationLabel);
  setLegacyFieldValue("sampleQty", encounter.quantity);
  setLegacyFieldValue("sampleSig", encounter.directions);
  setLegacyFieldValue("samplePurpose", encounter.purpose);
  // The legacy <select> has no blank option - only "auto" (the default) and
  // explicit food-timing values - so an unset/empty foodInstructions must
  // still resolve to "auto" or the select is left with no matching option
  // and sampleFoodText() silently returns "" instead of falling through to
  // the medication's own food guidance.
  setLegacyFieldValue("sampleFood", encounter.foodInstructions || "auto");
  setLegacyFieldValue("sampleTitration", encounter.titration ?? "");
  setLegacyFieldValue("sampleMedCheck", encounter.medicationReview);
  setLegacyFieldValue("sampleEdu", encounter.education);
  setLegacyFieldValue("sampleExtra", encounter.extra ?? "");
  setLegacyFieldValue("sampleHandoutStatus", encounter.handoutStatus ?? "");
  setLegacyFieldValue("sampleFollowUp", encounter.followUp ?? "");

  const primary = encounter.packages.find((entry) => entry.id === "primary");
  setLegacyFieldValue("sampleLot", primary?.lot ?? "");
  setLegacyFieldValue("sampleExp", primary?.expiration ?? "");

  window.ipmgSetSamplesChipState?.({ medicationKey: encounter.medicationKey });

  const additionalPackagesById = new Map(
    encounter.packages.filter((entry) => entry.id !== "primary").map((entry) => [entry.id, entry]),
  );

  window.clearSampleDoseRows?.();
  encounter.plan.forEach((step) => {
    window.addSampleDoseRow?.({
      strength: step.strength,
      qty: step.quantity,
      days: step.days ?? "",
      sig: step.directions,
    });
  });

  const rows = document.querySelectorAll<HTMLElement>("#sampleDoseRows .sample-dose-row");
  encounter.plan.forEach((step, index) => {
    const row = rows[index];
    const legacyRowId = row?.getAttribute("data-sample-package-trace");
    if (!legacyRowId) return;
    const trace = additionalPackagesById.get(step.id);
    window.ipmgSetSamplePackageTrace?.(legacyRowId, trace?.lot ?? "", trace?.expiration ?? "");
  });
}
