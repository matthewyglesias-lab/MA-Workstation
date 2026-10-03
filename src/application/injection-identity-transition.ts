import type { InjectionEncounter } from "../domain/injection";
import { emptyAvsAppointment } from "../domain/avs-appointment";

/** Applies only to edits of the current encounter. Loading a saved record is a
 * replacement and restores that record's own validated metadata; it must never
 * merge the preceding patient's reminder. Name alone is never identity proof.
 * Even partial identity edits conservatively reset the reminder. Exact no-ops
 * preserve it, including absence on historical records. */
export function applyInjectionIdentityTransition(
  previous: InjectionEncounter,
  candidate: InjectionEncounter,
): InjectionEncounter {
  return previous.patient.name === candidate.patient.name &&
    previous.patient.dob === candidate.patient.dob
    ? candidate
    : { ...candidate, avsAppointment: emptyAvsAppointment() };
}
