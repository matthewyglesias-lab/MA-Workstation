/**
 * The workstation's user-facing vocabulary, in one place.
 *
 * Two rules, and they are the reason this module exists rather than a hundred
 * string literals scattered through the components:
 *
 * 1. NAME THINGS THE WAY TEBRA NAMES THEM. Terms here are taken from Tebra's
 *    own clinical product - Dashboard, Open Notes, Facesheet, Care Checklist,
 *    Sign, Incomplete - so a Tebra user reads this workstation without
 *    translating. Where we genuinely differ (there is no cosign flow here, and
 *    no server) we say less rather than inventing a term they would not
 *    recognise. See docs/redesign/PLAN.md 2.4.
 *
 * 2. NAME THE USER'S ACTION, NEVER THE SYSTEM'S INTERNALS. A control says
 *    exactly what happens - `Sign`, then a toast that says `Signed`. Words like
 *    "attest", "file", "post", "local record", "compatibility runtime" and
 *    "projection" describe how this codebase is built, not what a medical
 *    assistant is doing, and none of them belong on screen.
 *
 * New user-facing copy goes here, not inline. The point of a single source is
 * that renaming a concept is one edit rather than an archaeology exercise.
 */

import type { ReadinessVerdict } from "../application/readiness-projection";
import type {
  WorkflowTransactionPhase,
  WorkstationReadinessItem,
  WorkstationRecordLifecycle,
} from "../application/workstation-projection";

/* ------------------------------------------------------------------ modules */

/**
 * Module names as they appear in navigation. Injection / UDS / Samples / Forms
 * are note types and already read correctly; the rest were client/server-era
 * names for screens Tebra ships under different ones.
 */
export const MODULE = {
  /** Tebra's name for the landing screen. Was "Start Center". */
  dashboard: "Dashboard",
  injection: "Injection",
  uds: "UDS",
  samples: "Samples",
  forms: "Forms",
  /** Tebra files clinical guidance under Reference. Was "Knowledge". */
  reference: "Reference",
  /** No Tebra equivalent, and the existing name is already plain. */
  dailyCloseout: "Daily Closeout",
  future: "Future / TMS",
} as const;

/* -------------------------------------------------------------------- notes */

/**
 * Tebra's worklist of notes awaiting signature is called Open Notes, and its
 * status column reads Incomplete. We keep Incomplete verbatim, extend it with
 * the two states we have that they express differently, and drop Needs Cosign
 * because there is no cosign flow here.
 */
export const NOTES = {
  /** Tebra's screen name. Was "Record List" / "Current Worklist". */
  openNotes: "Open Notes",
  /** Action label when the current workflow narrows Open Notes to UDS. */
  openUdsNotes: "Open UDS notes",
  openNotesDescription: "Open notes saved in this browser.",
  statusIncomplete: "Incomplete",
  statusReadyToSign: "Ready to sign",
  statusSigned: "Signed",
  statusNotStarted: "Not started",
  statusNeedsReview: "Needs review",
} as const;

/** Labels and guidance shared by the note-selection dialogs. */
export const OPEN_NOTES = {
  close: `Close ${NOTES.openNotes}`,
  udsTitle: `${NOTES.openNotes} · UDS`,
  closeUds: "Close UDS notes",
  searchInjection: "Search injection notes",
  searchInjectionPlaceholder: "Patient, DOB, medication, NDC, or lot",
  filterInjection: "Filter injection notes",
  searchUds: "Search UDS notes",
  searchUdsPlaceholder: "Patient, DOB, device, or lot",
  filterUds: "Filter UDS notes",
  filterAll: "All",
  filterAddenda: "Addenda",
  closeAction: "Close",
  viewSigned: "View signed note",
  resumeDraft: "Resume draft",
  noMatches: "No matching notes.",
  noUdsMatches: "No matching UDS notes.",
  injectionFooter:
    "Saved in this browser. Signed notes remain read only. Starting a new injection keeps the current draft.",
  udsFooter:
    "Saved in this browser. Signed notes remain read only. Starting a new UDS screen keeps the current draft.",
} as const;

/** Visible labels for the global, filter-first Open Notes table. */
export const NOTES_TABLE = {
  injectionLabel: "Injection notes",
  udsLabel: "UDS notes",
  columnPatient: "Patient",
  columnLock: "Lock",
  columnType: "Type",
  columnStatus: "Status",
  columnVisitDate: "Visit Date",
  typeInjection: "Injection",
  typeUds: "UDS",
  dateUnavailable: "—",
  signerDetailsUnavailable: "signer details unavailable",
  untitledInjection: "Untitled injection",
  untitledUds: "Untitled UDS screen",
} as const;

/** Row and lock labels stay composed here rather than leaking implementation copy. */
export const openNoteRowLabel = (
  patient: string,
  type: string,
  status: string,
): string => `Open ${status.toLocaleLowerCase()} ${type} note for ${patient}`;

export const signedNoteLockLabel = (staff?: string, time?: string): string => {
  if (staff && time) return `Signed by ${staff} · ${time}`;
  if (staff) return `Signed by ${staff}`;
  if (time) return `Signed · ${time}`;
  return `${NOTES.statusSigned} · ${NOTES_TABLE.signerDetailsUnavailable}`;
};

export const WORKLIST_EMPTY = {
  review: "No notes are awaiting review.",
  today: "No other work is recorded for today.",
  drafts: "No saved injection drafts are available.",
  all: "No work or saved drafts are available.",
  reviewHint: "Items appear here only when a saved note needs review.",
  todayHint: `Completed history remains available in ${NOTES.openNotes} (F11).`,
  draftsHint: "Use Start new injection to create an editable draft.",
  allHint: `Start a new injection, or press F11 to view ${NOTES.openNotes} history.`,
} as const;

/* ---------------------------------------------------------------- lifecycle */

/**
 * Tebra signs notes. This workstation used to attest-and-lock them, which is
 * an accurate description of the mechanism and a poor description of the task.
 * The mechanism is unchanged; only the word staff read is.
 */
export const RECORD = {
  sign: "Sign",
  signed: "Signed",
  save: "Save",
  saveDraft: "Save draft",
  saveDraftDescription: "Save the editable draft.",
  validatingAndSaving: "Validating required fields and saving…",
  saving: "Saving…",
  saved: "Saved",
  discard: "Discard",
  discardDraft: "Discard draft",
  signing: "Signing…",
  discarding: "Discarding…",
  signedLegacy: "Signed (legacy)",
  draft: "Draft",
  newDraft: "New draft",
  readOnly: "Read only",
  editable: "Editable",
  addendum: "Add addendum",
  startNewInjection: "Start new injection",
  startNewUds: "Start new UDS screen",
  noteReview: "Note review",
  signAcknowledgement: "I reviewed this note and am ready to sign it.",
  signReadOnlyDetail:
    "Signing saves your name and time in this browser and makes the note read only. Use a dated addendum for later clarification.",
  signFailedRetry:
    "The note could not be signed. It is still editable; review the required fields and browser storage, then try again.",
  signFailed:
    "The note could not be signed. It is still editable; no signature was saved.",
  discardFailed: "The draft could not be discarded. It remains available for review.",
  discardWarning:
    "This removes the draft saved in this browser and clears the worksheet. It cannot be undone.",
  signedCannotDiscard: "Signed notes cannot be discarded.",
  closeConfirmation: "Close confirmation",
  signatureTime: "Signature time",
  backToEditing: "Back to editing",
  keepEditing: "Keep editing",
  draftSavedDetail: "Draft saved in this browser. Sign only when the note is final.",
  readOnlyDetail: "This note is read only. Corrections require a dated addendum.",
  newDraftDetail: "Enter encounter details to begin a draft.",
  savingDetail: "Saving the latest changes in this browser.",
  storageAttentionDetail: "This draft needs storage attention before you leave.",
  notePreview: "Note preview",
  saveFailed: "Note was not saved.",
  saveFailedDetail: "No changes were cleared or signed.",
  fieldsBeforeSigning: "Complete the required clinical fields before signing this note.",
  injectionActions: "Injection note actions",
  udsActions: "UDS note actions",
  enterBeforeSaving: "Enter encounter details before saving a draft.",
  saveInjectionDraftDescription:
    "Save this editable injection draft in this browser (F12).",
  startInjectionDescription:
    "Start a blank injection. Any current editable work is saved as a draft first.",
  noDraftToDiscard: "There is no editable draft to discard.",
  discardDraftDescription: "Discard this editable draft. This cannot be undone.",
  saveUdsDraftDescription: "Save this editable UDS draft in this browser.",
  udsFieldsBeforeSigning:
    "Complete the required clinical fields and sign in staff before signing this note.",
  startUdsDescription:
    "Start a blank UDS screen. Any current editable work is saved as a draft first.",
  handoffNoAdministration:
    "No medication was administered, so there is no administration note to sign.",
  rotationHistoryDetail:
    "Read-only rotation history from notes saved in this workstation. It informs site selection; it never gates it.",
} as const;

/** Copy helpers keep variable note names and counts out of component literals. */
export const noteReviewPrompt = (recordNoun: string): string =>
  `Review this ${recordNoun} note for`;

export const discardDraftPrompt = (recordNoun: string): string =>
  `Discard the editable ${recordNoun} draft for`;

export const noteCount = (count: number, noun = "note"): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

export const filteredNoteCount = (
  visible: number,
  total: number,
  noun = "note",
): string => `${visible} of ${noteCount(total, noun)}`;

export const fieldsBeforeSigning = (count: number): string =>
  `Complete ${count} required clinical ${count === 1 ? "field" : "fields"} before signing this note.`;

export const signedByCopy = (staff: string, timestamp: string): string =>
  `Signed by ${staff} at ${timestamp}.`;

export const signedAtCopy = (timestamp: string): string => `Signed ${timestamp}.`;

/* ---------------------------------------------------------------- facesheet */

/**
 * Tebra's patient hub is the Facesheet, and it writes allergies as prose -
 * "No known allergies" rather than an abbreviation. The NKDA default on the
 * legacy input is engine, not display, and is untouched.
 */
export const PATIENT = {
  facesheet: "Facesheet",
  noPatient: "No patient selected",
  allergiesLabel: "Allergies",
  noKnownAllergies: "No known allergies",
  allergiesUnavailable: "Not recorded for this patient",
  allergiesNoPatient: "Select a patient to see allergies",
  dob: "DOB",
  visitRecord: "Visit / record",
  clinic: "Clinic",
  staff: "Staff",
  notSignedIn: "Not signed in",
  noLocation: "No location selected",
  findPatient: "Find patient",
  useThisPatient: "Use this patient",
  contextMismatch: "Patient context mismatch",
} as const;

/**
 * Patient search. The affordance and its copy are Tebra's own: staff type the
 * first two or three letters of a name, or a date of birth. Ours matches
 * against notes saved in this browser and says so, because a search that looks
 * like it reaches a practice-wide directory and does not is the worst kind of
 * seam.
 */
export const PATIENT_SEARCH = {
  label: "Search patients",
  placeholder: "First 2-3 letters of the patient's name, or DOB as mm/dd/yyyy",
  scopeHint: "Patients with notes saved in this browser.",
  keepTyping: "Type at least two characters.",
  noMatches: "No patients match.",
  results: "Patient results",
  clear: "Clear search",
} as const;

/**
 * Hover card on a patient name. It carries only what this workstation holds -
 * name, date of birth, record id, allergies, last visit. Tebra's card also
 * shows insurance and contact detail; ours shows less, and an absent field is
 * a smaller seam than an empty one.
 */
export const PATIENT_CARD = {
  label: "Patient summary",
  recordId: "Record id",
  lastVisit: "Last visit",
  noLastVisit: "No visit date recorded",
  noRecordId: "Not recorded",
} as const;

/* --------------------------------------------------------------- facesheet */

/**
 * Facesheet summary cards. Each states its own ordering rule the way Tebra
 * states theirs, so staff know what a card is showing them rather than
 * guessing whether a short list means "recent" or "all".
 */
export const FACESHEET = {
  title: PATIENT.facesheet,
  summaryLabel: "Patient summary cards",
  lastInjection: "Last injection",
  lastInjectionRule: "Most recent administration saved in this browser.",
  lastInjectionEmpty: "No injection is saved here for this patient.",
  medicationLabel: "Medication",
  siteLabel: "Site",
  dateLabel: "Date",
  siteRotation: "Site rotation",
  siteRotationRule: "Last five sites by administration date.",
  siteRotationEmpty: "No administration site is saved here for this patient.",
  allergiesRule: "As recorded on this patient's most recent note.",
  careChecklistRule: "Open items first, then satisfied.",
  careChecklistEmpty: "Open a note for this patient to see the Care Checklist.",
  careChecklistSatisfied: "Every checklist item is satisfied.",
  recentNotes: "Recent notes",
  recentNotesRule: "Up to the last five notes by visit date.",
  recentNotesEmpty: "No notes are saved here for this patient.",
  viewAllNotes: "View all notes",
  openNote: "Open note",
  /**
   * The one fact the masthead carried that the chart does not. Browsing one
   * patient's chart while a note is open for another is exactly the mix-up a
   * clinical screen must not allow to go unsaid.
   */
  otherNoteOpen: (name: string): string =>
    `A note is open for ${name}. Nothing here changes it.`,
  siteEntry: (site: string, date: string): string => `${site} · ${date}`,
} as const;

/**
 * The patient-scoped Notes list. This is Tebra's newer, roomier chart list -
 * deliberately a different grammar from the global Open Notes table, which
 * stays on the legacy sparse-worklist convention.
 */
export const PATIENT_NOTES = {
  title: "Notes",
  filtersLabel: "Filter this patient's notes",
  filterType: "Note type",
  filterStatus: "Status",
  filterRecency: "Visit date",
  filterSearch: "Search",
  searchPlaceholder: "Medication, type, or date",
  typeAll: "All note types",
  statusAll: "All statuses",
  recencyAll: "All visit dates",
  recency30: "Last 30 days",
  recency12: "Last 12 months",
  open: "Open",
  empty: "No notes match these filters.",
  emptyHint: "Clear a filter to see this patient's other notes.",
} as const;

export const openPatientNoteLabel = (
  type: string,
  visit: string,
  status: string,
): string => `Open ${status.toLocaleLowerCase()} ${type} note from ${visit}`;

/* -------------------------------------------------------------- action bar */

/**
 * Page-level actions, top right. These four keep Tebra's own control names
 * verbatim - including their capitalisation - because a Tebra user reaches for
 * "New Note" by sight. That is rule 1 winning over the sentence-case default
 * for labels we observed in their product rather than wrote ourselves.
 *
 * This is NOT the per-note lifecycle footer. Save / Sign / Discard act on the
 * open note and live with it; these act on the page.
 */
export const ACTION_BAR = {
  label: "Page actions",
  newNote: "New Note",
  newNoteMenu: "Choose a note type",
  print: "Print",
  more: "More",
  customizeView: "Customize View",
  customizeViewMenu: "Choose which cards this Facesheet shows",
  printUnavailable: "Printing is available from an open note.",
  moreUnavailable: "No other actions are available here yet.",
} as const;

/* ----------------------------------------------------------------- checklist */

/** Tebra's name for the outstanding-items list on a patient. */
export const CHECKLIST = {
  title: "Care Checklist",
  view: "View Care Checklist",
  /**
   * Per-item state words. Extracted from NoteInspector so the Facesheet's
   * Care Checklist card and the inspector's list cannot drift apart on what
   * an item's state is called.
   */
  stateComplete: "Complete",
  stateRequired: "Required",
  stateReview: "Review",
  statePending: "Pending",
  stopCount: (count: number) => `${count} stop${count === 1 ? "" : "s"}`,
  reviewCount: (count: number) => `${count} to review`,
  remainingFromFirst: (count: number, first: string) =>
    `${count} checklist items, starting with: ${first}`,
} as const;

/* -------------------------------------------------------------------- shell */

export const SHELL = {
  productName: "MA Workstation",
  organizationShort: "IPMG",
  organization: "Integrated Psychiatric Medical Group",
  keyboardReference: "Keyboard Reference",
  shortcuts: "Keyboard shortcuts",
  currentWorkspace: "Current workspace",
  currentRecordMode: "Current note mode",
  noteTypes: "Note types",
  noteType: "Note type",
  status: "Status",
  readyToBegin: "Ready. Select a note type to begin.",
  skipToActiveNote: "Skip to active note",
  draftSaveRequested: "Draft save requested.",
  draftSaveUnavailable: "Draft saving is unavailable for this note type.",
  notePanelUnavailable: "This note type is not connected yet.",
  startNoteForReadiness: "Start this note to populate the Care Checklist.",
  /**
   * The local-only disclosure. This app has no server and no sync, and the
   * more faithfully it reads as a real EHR the likelier staff are to assume
   * their documentation reached the patient's chart. Said plainly, in the
   * same voice as everything else - not as a warning banner.
   */
  localOnlyBadge: "Local only",
  /** Compact provenance marker in the note heading. */
  localBadge: "Local",
  localOnlyDetail: "Records stay in this browser",
  storageUnavailable: "Browser storage is unavailable",
  storageError: "Storage error",
} as const;

/* --------------------------------------------------------------- navigation */

/**
 * Section-rail labels. The rail only points at work that exists in this local
 * module; it never advertises a Tebra destination the workstation cannot open.
 */
export const NAVIGATION = {
  clinicalWork: "Clinical work",
  resources: "Resources",
  closeout: "Closeout",
  localChart: "Local chart",
  selectRecordHint: "Use F11 to select a note",
  /** The patient-scoped group, shown only once a patient is in context. */
  patientChart: "Patient",
  openFacesheet: "Open the Facesheet",
  openPatientNotes: "Open this patient's notes",
  backToWork: "Back to clinical work",
} as const;

/* ------------------------------------------------------------------ verdict */

export interface ReadinessVerdictCopy {
  /** The verdict word staff read first. */
  headline: string;
  /** The count line beneath it. */
  detail: string;
}

/**
 * Words for the Care Checklist verdict.
 *
 * This lives in the presentation layer on purpose. `summarizeReadinessVerdict`
 * decides the clinical question - whether the documentation is blocked, needs
 * review, or is clear - and that decision is unchanged. Choosing which words
 * express it is a display concern, and having it sit in the application layer
 * was a layering leak that made this rename look like it required touching
 * clinical code. It did not.
 *
 * The headline deliberately reuses the Open Notes status vocabulary, so the
 * verdict on a note and the chip beside it in the worklist say the same word.
 *
 * SAFETY: the verdict is about whether the record can be SIGNED, never about
 * whether it is safe to administer. Administration and disposition are
 * documented after the clinical act, so a verdict worded as clearance would
 * read red at the exact moment staff inject - and a signal that is red when
 * you are supposed to act is one people learn to ignore. Wording here is
 * guarded by a test; keep it a documentation verdict.
 */
export function readinessVerdictCopy(verdict: ReadinessVerdict): ReadinessVerdictCopy {
  const headline =
    verdict.tone === "blocked"
      ? NOTES.statusIncomplete
      : verdict.tone === "review"
        ? `${NOTES.statusReadyToSign} · review flagged`
        : NOTES.statusReadyToSign;

  const reviewNote = verdict.warnings > 0 ? ` · ${verdict.warnings} needs review` : "";
  const detail = `${verdict.completed} of ${verdict.total} complete${reviewNote}`;

  return { headline, detail };
}

/* --------------------------------------------------------------- lifecycle */

/**
 * Words for the record lifecycle and the worksheet's transaction phase.
 *
 * Both label maps used to sit in `application/workstation-projection.ts`,
 * shouting in client/server case - NEW LOCAL DRAFT, READY TO ATTEST. Same leak
 * as the readiness verdict: the layer that decides *what state something is in*
 * had also been deciding what to call it, which made a copy change look like it
 * required editing the projection. Keys stay internal and unchanged; only the
 * words moved.
 */
/** One word for a single Care Checklist item's state. */
export const readinessItemStateLabel = (
  state: WorkstationReadinessItem["state"],
): string => {
  switch (state) {
    case "complete":
      return CHECKLIST.stateComplete;
    case "stop":
      return CHECKLIST.stateRequired;
    case "warning":
      return CHECKLIST.stateReview;
    case "pending":
      return CHECKLIST.statePending;
  }
};

export const RECORD_LIFECYCLE_LABEL: Record<WorkstationRecordLifecycle, string> = {
  new: RECORD.newDraft,
  draft: "Draft saved",
  locked: NOTES.statusSigned,
  saving: RECORD.saving,
  error: "Save failed",
};

export const TRANSACTION_PHASE_LABEL: Record<WorkflowTransactionPhase, string> = {
  locked: NOTES.statusSigned,
  "not-started": NOTES.statusNotStarted,
  entry: NOTES.statusIncomplete,
  review: NOTES.statusNeedsReview,
  // The phase key still reads "ready-to-attest": it is internal, addressed by
  // logic and tests, and renaming keys is a separate mechanical change from
  // renaming copy. What staff read is the Open Notes vocabulary.
  "ready-to-attest": NOTES.statusReadyToSign,
};
