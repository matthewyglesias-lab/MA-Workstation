import { injectionAdministrationReviewFingerprint, type InjectionEncounter } from "../../../domain/injection";

/** The engine fingerprint owns materiality; these names only explain the
 * changed dependency. Handout/view changes cannot produce a receipt. */
export function injectionReviewInvalidationMessage(previous: InjectionEncounter, next: InjectionEncounter): string | undefined {
  if (previous.disposition.kind !== "administered" ||
      injectionAdministrationReviewFingerprint(previous) === injectionAdministrationReviewFingerprint(next)) return;
  const names: Partial<Record<keyof InjectionEncounter, string>> = {
    patient: "Patient identity", orderingProvider: "Ordering provider", medicationKey: "Medication", customMedication: "Medication",
    dose: "Dose", route: "Route", intervalKey: "Cadence", reason: "Order purpose", priorDoseDate: "Prior dose date",
    priorSite: "Prior site", administrationDate: "Administration date", nextDoseDate: "Return date", site: "Site",
    habitus: "Body habitus", administeredBy: "Administering staff", administrationTime: "Administration time",
    secondAdministrationTime: "Second administration time", response: "Response", traceability: "Product details",
    attestations: "Safety acknowledgement", verifications: "Medication verification", allergies: "Allergy status",
    acuteSafetyScreenConfirmed: "Safety screen", activeSafetyConcerns: "Safety concerns", initiation: "Initiation plan",
    details: "Administration details",
  };
  const changed = (Object.keys(names) as (keyof InjectionEncounter)[]).find(key => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
  return `${changed ? names[changed] : "Administration facts"} changed — review administration again.`;
}
