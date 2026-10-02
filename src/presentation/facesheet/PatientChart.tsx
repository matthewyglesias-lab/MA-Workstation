import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { browserSafeStorage } from "../../persistence/storage";
import { SiteHistoryRepository } from "../../persistence/site-history";
import { FACESHEET, PATIENT_NOTES } from "../vocabulary";
import {
  recentPatientNotes,
  siteRotation,
  type ChartPatient,
} from "../patient-chart-model";
import type { NotesTableRow } from "../notes/note-table-model";
import { PatientNotesList } from "../notes/PatientNotesList";
import { ActionBar } from "../shell/ActionBar";
import type { ReadinessItem, WorkflowId } from "../types";
import {
  Facesheet,
  FACESHEET_CARD_ORDER,
  FACESHEET_CARD_TITLE,
  type FacesheetCardId,
} from "./Facesheet";
import { FacesheetBanner } from "./FacesheetBanner";
import {
  readFacesheetCards,
  toggleFacesheetCard,
  writeFacesheetCards,
} from "./facesheet-view-preference";

export type PatientChartView = "facesheet" | "notes";

interface PatientChartProps {
  patient: ChartPatient;
  /** This patient's notes, newest visit first. */
  rows: readonly NotesTableRow[];
  readiness: readonly ReadinessItem[];
  /** True when the open note belongs to the patient being browsed. */
  checklistAppliesToPatient: boolean;
  view: PatientChartView;
  onViewChange: (view: PatientChartView) => void;
  /** Type-qualified row key, so cross-workflow id collisions cannot misroute. */
  onOpenNote: (recordKey: string) => void;
  onNewNote: (workflow: WorkflowId) => boolean | void;
  onPrint?: () => void;
  /** Name of the patient an open note belongs to, when it is not this one. */
  otherNotePatient?: string;
}

const VIEW_TABS: ReadonlyArray<[PatientChartView, string]> = [
  ["facesheet", FACESHEET.title],
  ["notes", PATIENT_NOTES.title],
];

/**
 * A patient's chart: Facesheet and Notes, with the page-level action bar.
 *
 * Browsing here is read-only. Opening this page reads repositories and derives
 * display facts; it does not create a record. That is a deliberate departure
 * from the live product, where selecting Injection opens an editor and files a
 * blank `Incomplete` note before anything is typed. Copying that side effect
 * would put empty notes in a chart because someone looked at it, so this
 * module keeps its own persistence contract and crosses into a workflow only
 * on an explicit New Note or Open.
 */
export function PatientChart({
  patient,
  rows,
  readiness,
  checklistAppliesToPatient,
  view,
  onViewChange,
  onOpenNote,
  onNewNote,
  onPrint,
  otherNotePatient,
}: PatientChartProps) {
  const [visibleCards, setVisibleCards] = useState<FacesheetCardId[]>(() =>
    readFacesheetCards(),
  );

  // Storage is read once per mount rather than per render: a browser with
  // storage unavailable answers with the default set every time, and re-asking
  // on each render would spend a synchronous read to learn that again.
  useEffect(() => {
    setVisibleCards(readFacesheetCards());
  }, []);

  const rotation = useMemo(() => {
    if (!patient.name || !patient.dob) return [];
    const result = new SiteHistoryRepository(browserSafeStorage()).list(
      patient.name,
      patient.dob,
    );
    return result.ok ? siteRotation(result.value) : [];
  }, [patient.name, patient.dob]);

  const recent = useMemo(() => recentPatientNotes(rows), [rows]);

  const toggleCard = useCallback((id: string) => {
    setVisibleCards((current) => {
      const next = toggleFacesheetCard(current, id as FacesheetCardId);
      writeFacesheetCards(next);
      return next;
    });
  }, []);

  const customizeOptions = FACESHEET_CARD_ORDER.map((card) => ({
    id: card,
    label: FACESHEET_CARD_TITLE[card],
    checked: visibleCards.includes(card),
  }));

  return (
    <section class="tebra-patient-chart" data-patient-chart={patient.key}>
      <FacesheetBanner
        patient={patient}
        {...(otherNotePatient ? { otherNotePatient } : {})}
        actions={
          <ActionBar
            onNewNote={onNewNote}
            {...(onPrint ? { onPrint } : {})}
            customizeOptions={customizeOptions}
            onToggleCustomize={toggleCard}
          />
        }
      />

      <div class="tebra-patient-chart-tabs" role="tablist" aria-label={FACESHEET.title}>
        {VIEW_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            data-chart-tab={id}
            aria-selected={view === id}
            class={view === id ? "is-selected" : ""}
            onClick={() => onViewChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div class="tebra-patient-chart-body">
        {view === "facesheet" ? (
          <Facesheet
            patient={patient}
            rotation={rotation}
            recentNotes={recent}
            readiness={readiness}
            checklistAppliesToPatient={checklistAppliesToPatient}
            visibleCards={visibleCards}
            onOpenNote={onOpenNote}
            onViewAllNotes={() => onViewChange("notes")}
          />
        ) : (
          <PatientNotesList rows={rows} onOpen={onOpenNote} />
        )}
      </div>
    </section>
  );
}
