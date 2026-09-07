import {
  CHECKLIST,
  FACESHEET,
  NOTES_TABLE,
  PATIENT,
  readinessItemStateLabel,
} from "../vocabulary";
import type { ChartPatient, SiteRotationEntry } from "../patient-chart-model";
import type { NotesTableRow } from "../notes/note-table-model";
import { StatusChip } from "../notes/StatusChip";
import type { ReadinessItem } from "../types";
import { SummaryCard, SummaryEmpty } from "./SummaryCard";

/**
 * Which cards the Facesheet can show. These keys address layout and the
 * Customize View preference; they are internal and never derived from the
 * card's heading, so renaming a heading cannot silently drop a card.
 */
export type FacesheetCardId =
  | "last-injection"
  | "site-rotation"
  | "allergies"
  | "care-checklist"
  | "recent-notes";

export const FACESHEET_CARD_ORDER: readonly FacesheetCardId[] = [
  "last-injection",
  "site-rotation",
  "allergies",
  "care-checklist",
  "recent-notes",
];

export const FACESHEET_CARD_TITLE: Record<FacesheetCardId, string> = {
  "last-injection": FACESHEET.lastInjection,
  "site-rotation": FACESHEET.siteRotation,
  allergies: PATIENT.allergiesLabel,
  "care-checklist": CHECKLIST.title,
  "recent-notes": FACESHEET.recentNotes,
};

interface FacesheetProps {
  patient: ChartPatient;
  rotation: readonly SiteRotationEntry[];
  recentNotes: readonly NotesTableRow[];
  /**
   * The open note's Care Checklist. It belongs to whichever note is open, not
   * to the patient, so it is only shown when the chart being browsed is the
   * patient that note is for.
   */
  readiness: readonly ReadinessItem[];
  checklistAppliesToPatient: boolean;
  visibleCards: readonly FacesheetCardId[];
  onOpenNote: (recordId: string) => void;
  onViewAllNotes: () => void;
}

/** Open items first, then satisfied — the rule the card states. */
const CHECKLIST_STATE_ORDER: Record<ReadinessItem["state"], number> = {
  stop: 0,
  warning: 1,
  pending: 2,
  complete: 3,
};

export function Facesheet({
  patient,
  rotation,
  recentNotes,
  readiness,
  checklistAppliesToPatient,
  visibleCards,
  onOpenNote,
  onViewAllNotes,
}: FacesheetProps) {
  const shows = (card: FacesheetCardId) => visibleCards.includes(card);
  const orderedChecklist = [...readiness].sort(
    (left, right) =>
      CHECKLIST_STATE_ORDER[left.state] - CHECKLIST_STATE_ORDER[right.state],
  );

  return (
    <div
      class="tebra-facesheet-cards"
      aria-label={FACESHEET.summaryLabel}
      data-facesheet-cards
    >
      {shows("last-injection") && (
        <SummaryCard
          title={FACESHEET.lastInjection}
          rule={FACESHEET.lastInjectionRule}
          {...(patient.lastInjection
            ? {
                action: {
                  label: FACESHEET.openNote,
                  onSelect: () => onOpenNote(patient.lastInjection!.recordId),
                },
              }
            : {})}
        >
          {patient.lastInjection ? (
            <dl class="tebra-summary-facts">
              <div>
                <dt>{FACESHEET.medicationLabel}</dt>
                <dd>{patient.lastInjection.medicationLabel}</dd>
              </div>
              <div>
                <dt>{FACESHEET.siteLabel}</dt>
                <dd>{patient.lastInjection.site ?? NOTES_TABLE.dateUnavailable}</dd>
              </div>
              <div>
                <dt>{FACESHEET.dateLabel}</dt>
                <dd>{patient.lastInjection.visit.label}</dd>
              </div>
            </dl>
          ) : (
            <SummaryEmpty>{FACESHEET.lastInjectionEmpty}</SummaryEmpty>
          )}
        </SummaryCard>
      )}

      {shows("site-rotation") && (
        <SummaryCard title={FACESHEET.siteRotation} rule={FACESHEET.siteRotationRule}>
          {rotation.length ? (
            <ol class="tebra-summary-rotation">
              {rotation.map((entry) => (
                <li key={`${entry.date}-${entry.site}-${entry.recordId ?? ""}`}>
                  {FACESHEET.siteEntry(entry.site, entry.date)}
                </li>
              ))}
            </ol>
          ) : (
            <SummaryEmpty>{FACESHEET.siteRotationEmpty}</SummaryEmpty>
          )}
        </SummaryCard>
      )}

      {shows("allergies") && (
        <SummaryCard title={PATIENT.allergiesLabel} rule={FACESHEET.allergiesRule}>
          <p class="tebra-summary-allergies">
            {patient.allergyStatus ?? PATIENT.allergiesUnavailable}
          </p>
        </SummaryCard>
      )}

      {shows("care-checklist") && (
        <SummaryCard title={CHECKLIST.title} rule={FACESHEET.careChecklistRule}>
          {!checklistAppliesToPatient || !orderedChecklist.length ? (
            <SummaryEmpty>{FACESHEET.careChecklistEmpty}</SummaryEmpty>
          ) : (
            <ul class="tebra-summary-checklist">
              {orderedChecklist.map((item) => (
                <li key={item.id} class={`is-${item.state}`}>
                  <span class="tebra-summary-checklist-marker" aria-hidden="true">
                    {item.state === "complete"
                      ? "✓"
                      : item.state === "stop"
                        ? "×"
                        : item.state === "warning"
                          ? "!"
                          : "·"}
                  </span>
                  <span class="tebra-summary-checklist-label">{item.label}</span>
                  <small>{readinessItemStateLabel(item.state)}</small>
                </li>
              ))}
            </ul>
          )}
        </SummaryCard>
      )}

      {shows("recent-notes") && (
        <SummaryCard
          title={FACESHEET.recentNotes}
          rule={FACESHEET.recentNotesRule}
          action={{ label: FACESHEET.viewAllNotes, onSelect: onViewAllNotes }}
        >
          {recentNotes.length ? (
            <ul class="tebra-summary-notes">
              {recentNotes.map((row) => (
                <li key={row.key}>
                  <button
                    type="button"
                    class="tebra-summary-note-row"
                    data-facesheet-open={row.recordId}
                    onClick={() => onOpenNote(row.recordId)}
                  >
                    <span class="tebra-summary-note-type">{row.typeLabel}</span>
                    <span class="tebra-summary-note-visit">{row.visit.label}</span>
                    <StatusChip status={row.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <SummaryEmpty>{FACESHEET.recentNotesEmpty}</SummaryEmpty>
          )}
        </SummaryCard>
      )}
    </div>
  );
}
