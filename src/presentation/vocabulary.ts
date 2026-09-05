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
  /**
   * The heading over the module grid. "Clinical Modules" named the software's
   * parts; this names what the row is for. Shown in sentence case - the
   * shouted caps were a client/server section rule, not a Tebra one.
   */
  startANote: "Start a note",
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
  statusIncomplete: "Incomplete",
  statusReadyToSign: "Ready to sign",
  statusSigned: "Signed",
  statusNotStarted: "Not started",
  statusNeedsReview: "Needs review",

  /**
   * Open Notes column headings. Tebra's set is
   * `Patient · Lock · Type · Status · Visit Date`, and the order is theirs.
   * The lock column's heading is for screen readers only - Tebra shows a
   * glyph there and so do we.
   */
  columnPatient: "Patient",
  columnLock: "Lock",
  columnType: "Type",
  columnStatus: "Status",
  columnVisitDate: "Visit date",

  /**
   * The lock hover. Tebra reveals who currently holds a note; this app has no
   * server and no second user, and the signer is not carried on the row (it
   * lives behind a frozen path), so ours says what it truthfully knows: the
   * note is signed and read-only, and when it was recorded. Same affordance,
   * less claim. See docs/redesign/MANIFEST.md 4.1.
   */
  lockedHint: "Signed · read only",
  /** No visit date is held for an unsigned draft. */
  noVisitDate: "—",
  /** Tebra's action-bar primary. Was "Start new injection". */
  newNote: "New note",
  /** Tebra's action-bar overflow. */
  more: "More",
  /** Where signed notes live once they leave the worklist. */
  signedNotes: "Signed notes",
  sortAscending: "sorted A to Z",
  sortDescending: "sorted Z to A",
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
} as const;

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

/* ----------------------------------------------------------------- checklist */

/** Tebra's name for the outstanding-items list on a patient. */
export const CHECKLIST = {
  title: "Care Checklist",
} as const;

/* -------------------------------------------------------------------- shell */

export const SHELL = {
  productName: "MA Workstation",
  organization: "Integrated Psychiatric Medical Group",
  keyboardReference: "Keyboard Reference",
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
