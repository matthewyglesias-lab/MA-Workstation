import { emptyInjectionEncounter, type InjectionEncounter } from "../../src/domain/injection";
export function documentedInjection(): InjectionEncounter {
  return { ...emptyInjectionEncounter(), patient: { name: "Progress, Synthetic", dob: "01/02/1990" },
    medicationKey: "haldol", dose: "100 mg", route: "IM", site: "L deltoid", intervalKey: "q4wk", reason: "scheduled",
    priorDoseDate: "2026-09-04", priorSite: "R deltoid", administrationDate: "2026-10-02", administrationTime: "09:15", nextDoseDate: "2026-10-30",
    orderingProvider: "Synthetic Provider", administeredBy: "Synthetic Staff", allergies: "NKDA verified in active record",
    traceability: { ndc: "12345-6789-01", lot: "SYNTHETIC", expiration: "2027-12" }, response: { kind: "well" },
    attestations: { id2: true, rights: true, allergy: true, consent: true, screen: true, hygiene: true },
    verifications: { visualInspection: true, deepZtrack: true }, acuteSafetyScreenConfirmed: true,
    disposition: { kind: "administered" }, details: { productSource: "Clinic sample", volume: "1", volumeUnit: "mL" },
  };
}
