import { sampleReviewIsCurrent, type SamplesEncounter } from "../../domain/samples";
import { resolveProviderDisplay } from "../../domain/provider-register";
import type { SamplesDocumentationInput } from "../types";

const trimmed = (value?: string): string => (value ?? "").trim();

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const formatIsoDate = (raw?: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed(raw));
  if (!match) return trimmed(raw);
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}, ${match[1]}` : trimmed(raw);
};

const formatMonth = (raw?: string): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed(raw));
  return match ? `${match[2]}/${match[1]}` : trimmed(raw);
};

const formatTime = (raw?: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed(raw));
  if (!match) return trimmed(raw);
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
};

const formatDateTime = (raw?: string): string => {
  const [date = "", time = ""] = trimmed(raw).split("T");
  if (!date) return "";
  return [formatIsoDate(date), formatTime(time)].filter(Boolean).join(" at ");
};

const NON_COUNSELING_VALUES = new Set(["", "not documented", "pending provider confirmation"]);

const unique = (items: string[]): string[] => [...new Set(items.filter(Boolean))];

const hasStarted = (encounter: SamplesEncounter): boolean =>
  Boolean(
    encounter.patient.name.trim() ||
      encounter.patient.dob.trim() ||
      encounter.medicationLabel.trim() ||
      encounter.quantity.trim() ||
      encounter.prescriber.trim() ||
      encounter.staff.trim() ||
      encounter.extra?.trim() ||
      encounter.handoutStatus?.trim() ||
      encounter.followUp?.trim() ||
      encounter.packages.length,
  );

/**
 * Pure, DOM-free equivalent of legacy/documentation-adapter.ts's
 * readLegacySamplesDocumentation(), for a panel bound directly to a typed
 * SamplesEncounter instead of the legacy DOM. reviewedAt is built from
 * encounter.review.confirmedAt (a real ISO timestamp) rather than legacy's
 * regex-parsed "confirmed today by X at Y." status text.
 */
export function samplesEncounterToDocumentationInput(
  encounter: SamplesEncounter,
  today: string,
): SamplesDocumentationInput | null {
  if (!hasStarted(encounter)) return null;

  const packages = encounter.packages.map((entry, index) => ({
    label: trimmed(entry.label) || `Package ${index + 1}`,
    medication: trimmed(entry.medicationStrength) || trimmed(encounter.medicationLabel) || undefined,
    quantity: trimmed(entry.quantity) || undefined,
    lot: trimmed(entry.lot) || undefined,
    expiration: formatMonth(entry.expiration) || trimmed(entry.expiration) || undefined,
  }));

  const planSteps = encounter.plan
    .map((step, index) => {
      const days = trimmed(step.days);
      const dateDetail =
        index === 0 && encounter.startDate
          ? `${formatIsoDate(encounter.startDate)}${days ? ` · ${days} day(s)` : ""}`
          : days
            ? `${days} day(s)`
            : "";
      return {
        medication: trimmed(step.strength) || undefined,
        quantity: trimmed(step.quantity) || undefined,
        dateRange: dateDetail || undefined,
        directions: trimmed(step.directions) || undefined,
      };
    })
    .filter((step) => Boolean(step.medication || step.quantity || step.dateRange || step.directions));

  const reviewedToday = sampleReviewIsCurrent(encounter, today);
  const counseling = reviewedToday
    ? unique(
        [encounter.medicationReview, encounter.education].filter(
          (value) => !NON_COUNSELING_VALUES.has(value.toLowerCase()),
        ),
      )
    : [];

  return {
    summary: "Oral medication sample documentation.",
    patient: trimmed(encounter.patient.name) || undefined,
    dob: trimmed(encounter.patient.dob) || undefined,
    purpose: trimmed(encounter.purpose) || undefined,
    // Stored as the provider register's id when a registered prescriber is
    // selected; resolve to a display name before it reaches the note.
    prescriber: resolveProviderDisplay(encounter.prescriber) || undefined,
    dispensedBy: trimmed(encounter.staff) || undefined,
    packages: packages.length ? packages : undefined,
    planSteps: planSteps.length ? planSteps : undefined,
    patientInstructions: trimmed(encounter.titration) ? [trimmed(encounter.titration)] : undefined,
    counseling: counseling.length ? counseling : undefined,
    patientContext: trimmed(encounter.extra) || undefined,
    handoutStatus: trimmed(encounter.handoutStatus) || undefined,
    followUp: trimmed(encounter.followUp) ? [trimmed(encounter.followUp)] : undefined,
    reviewedToday: reviewedToday
      ? {
          reviewedAt: formatDateTime(encounter.review.confirmedAt) || "Confirmed today",
          reviewedBy: trimmed(encounter.staff) || undefined,
        }
      : undefined,
  };
}
