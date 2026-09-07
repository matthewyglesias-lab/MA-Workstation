import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { PATIENT, PATIENT_SEARCH, noteCount } from "../vocabulary";
import {
  PATIENT_QUERY_MIN_LENGTH,
  searchChartPatients,
  type ChartPatient,
} from "../patient-chart-model";

interface PatientSearchProps {
  patients: readonly ChartPatient[];
  /** Opens that patient's chart. Read-only: it starts no note. */
  onSelect: (patient: ChartPatient) => void;
}

/**
 * Patient search in the product header.
 *
 * The affordance and its copy are Tebra's: the first two or three letters of
 * a name, or a date of birth as mm/dd/yyyy. What differs is scope, and the
 * field says so rather than letting it be discovered - this searches notes
 * saved in this browser, not a practice directory, and a search box that looks
 * like it reaches the practice and quietly does not is precisely the kind of
 * seam this redesign exists to avoid.
 *
 * Selecting a result opens a chart. It never starts, resumes or modifies a
 * note; only New Note and Open do that.
 */
export function PatientSearch({ patients, onSelect }: PatientSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = useId();

  const results = useMemo(
    () => searchChartPatients(patients, query),
    [patients, query],
  );
  const longEnough = query.trim().length >= PATIENT_QUERY_MIN_LENGTH;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!hostRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (patient: ChartPatient) => {
    setOpen(false);
    setQuery("");
    onSelect(patient);
  };

  return (
    <div class="tebra-patient-search" ref={hostRef} data-patient-search>
      <label class="records-sr-only" for={inputId}>
        {PATIENT_SEARCH.label}
      </label>
      <input
        id={inputId}
        type="search"
        role="combobox"
        autocomplete="off"
        class="tebra-patient-search-input"
        placeholder={PATIENT_SEARCH.placeholder}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        value={query}
        onInput={(event) => {
          setQuery(event.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          setOpen(false);
        }}
      />
      {open ? (
        <div class="tebra-patient-search-results" id={listId} role="listbox" aria-label={PATIENT_SEARCH.results}>
          <p class="tebra-patient-search-scope">{PATIENT_SEARCH.scopeHint}</p>
          {!longEnough ? (
            <p class="tebra-patient-search-empty">{PATIENT_SEARCH.keepTyping}</p>
          ) : results.length ? (
            results.map((patient) => (
              <button
                key={patient.key}
                type="button"
                role="option"
                aria-selected="false"
                class="tebra-patient-search-result"
                data-patient-result={patient.key}
                onClick={() => choose(patient)}
              >
                <strong>{patient.name}</strong>
                <small>
                  {PATIENT.dob} {patient.dob || "—"}
                  <span aria-hidden="true"> · </span>
                  {noteCount(patient.noteCount)}
                </small>
              </button>
            ))
          ) : (
            <p class="tebra-patient-search-empty">{PATIENT_SEARCH.noMatches}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
