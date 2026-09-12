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
  onSelect: (patient: ChartPatient) => boolean | void;
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
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = useId();

  const results = useMemo(
    () => searchChartPatients(patients, query),
    [patients, query],
  );
  const longEnough = query.trim().length >= PATIENT_QUERY_MIN_LENGTH;
  const activeIndex = results.findIndex((patient) => patient.key === activeKey);

  const closeResults = () => {
    setOpen(false);
    setActiveKey(null);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!hostRef.current?.contains(event.target as Node)) closeResults();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !results.length) {
      if (activeKey !== null) setActiveKey(null);
      return;
    }
    if (!results.some((patient) => patient.key === activeKey)) {
      setActiveKey(results[0]!.key);
    }
  }, [activeKey, open, results]);

  const choose = (patient: ChartPatient) => {
    if (onSelect(patient) === false) return;
    closeResults();
    setQuery("");
  };

  const moveActive = (index: number) => {
    const patient = results[index];
    if (!patient) return;
    setOpen(true);
    setActiveKey(patient.key);
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
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
        }
        value={query}
        onInput={(event) => {
          const nextQuery = event.currentTarget.value;
          const nextResults = searchChartPatients(patients, nextQuery);
          setQuery(nextQuery);
          setOpen(true);
          setActiveKey(nextResults[0]?.key ?? null);
        }}
        onFocus={() => {
          setOpen(true);
          setActiveKey(results[0]?.key ?? null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (!open) return;
            event.preventDefault();
            event.stopPropagation();
            closeResults();
            return;
          }

          if (!results.length) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveActive(
              !open || activeIndex < 0
                ? 0
                : Math.min(activeIndex + 1, results.length - 1),
            );
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            moveActive(
              !open || activeIndex < 0
                ? results.length - 1
                : Math.max(activeIndex - 1, 0),
            );
            return;
          }
          if (event.key === "Home" && open) {
            event.preventDefault();
            moveActive(0);
            return;
          }
          if (event.key === "End" && open) {
            event.preventDefault();
            moveActive(results.length - 1);
            return;
          }
          if (event.key === "Enter" && open && activeIndex >= 0) {
            event.preventDefault();
            const patient = results[activeIndex];
            if (patient) choose(patient);
          }
        }}
      />
      {open ? (
        <div class="tebra-patient-search-results" id={listId} role="listbox" aria-label={PATIENT_SEARCH.results}>
          <p class="tebra-patient-search-scope">{PATIENT_SEARCH.scopeHint}</p>
          {!longEnough ? (
            <p class="tebra-patient-search-empty">{PATIENT_SEARCH.keepTyping}</p>
          ) : results.length ? (
            results.map((patient, index) => (
              <button
                id={`${listId}-option-${index}`}
                key={patient.key}
                type="button"
                role="option"
                aria-selected={patient.key === activeKey}
                tabIndex={-1}
                class="tebra-patient-search-result"
                data-patient-result={patient.key}
                onMouseDown={(event) => event.preventDefault()}
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
