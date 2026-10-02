import {
  UDS_PANELS,
  UdsEngine,
  type UdsEncounter,
  type UdsPanel,
  type UdsResultState,
} from "../domain/uds";
import type { UdsRecord } from "../persistence/uds-records";
import { UDS_RECORDS_STORAGE_KEY } from "../persistence/keys";

export const UDS_RECORD_MUTATION_LOCK_NAME =
  `${UDS_RECORDS_STORAGE_KEY}:exclusiveMutationV1`;

export const UDS_RECORD_MUTATION_BUSY_MESSAGE =
  "Another browser tab is editing UDS records. This tab is read-only and will not write. Close the other UDS editor, then reopen UDS here.";

export const UDS_RECORD_MUTATION_PROTECTION_MESSAGE =
  "Exclusive UDS record protection is unavailable in this browser. This tab is read-only and will not write.";

export const UDS_RECORD_MUTATION_PENDING_MESSAGE =
  "Starting exclusive UDS record protection. Editing will unlock when it is ready.";

export type UdsRecordMutationAccess =
  | "pending"
  | "owned"
  | "busy"
  | "unsupported";

export interface UdsLockManagerLike {
  request(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: unknown | null) => Promise<void> | void,
  ): Promise<void>;
}

export type UdsOwnedMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

/** Synchronous mutation gate used after the session lock request settles. */
export const runOwnedUdsRecordMutation = <T>(
  access: UdsRecordMutationAccess,
  mutation: () => T,
): UdsOwnedMutationResult<T> => {
  if (access !== "owned") {
    return {
      ok: false,
      message:
        access === "busy"
          ? UDS_RECORD_MUTATION_BUSY_MESSAGE
          : access === "pending"
            ? UDS_RECORD_MUTATION_PENDING_MESSAGE
            : UDS_RECORD_MUTATION_PROTECTION_MESSAGE,
    };
  }
  return { ok: true, value: mutation() };
};

const browserLockManager = (): UdsLockManagerLike | undefined => {
  try {
    const candidate = (globalThis as typeof globalThis & {
      navigator?: { locks?: UdsLockManagerLike };
    }).navigator?.locks;
    return typeof candidate?.request === "function" ? candidate : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Requests the browser's same-origin exclusive Web Lock and holds it until
 * the returned release function is called. UDS keeps this lock for the full
 * mounted editor session, so later navigation and pagehide saves remain
 * synchronous while already protected by real cross-process mutual exclusion.
 *
 * `ifAvailable` is deliberate: a second tab becomes read-only immediately
 * instead of queuing an edit session that might activate after the user has
 * already interacted with stale data. Missing or failed Web Locks also fail
 * closed. The status callback is ignored after release/unmount.
 */
export const holdUdsRecordMutationLock = (
  onStatus: (status: UdsRecordMutationAccess) => void,
  lockManager: UdsLockManagerLike | undefined = browserLockManager(),
): (() => void) => {
  let active = true;
  let releaseHeldLock: (() => void) | undefined;

  if (!lockManager) {
    onStatus("unsupported");
    return () => { active = false; };
  }

  try {
    void lockManager
      .request(
        UDS_RECORD_MUTATION_LOCK_NAME,
        { mode: "exclusive", ifAvailable: true },
        (lock) => {
          if (!active) return;
          if (!lock) {
            onStatus("busy");
            return;
          }
          onStatus("owned");
          return new Promise<void>((resolve) => {
            releaseHeldLock = resolve;
            if (!active) resolve();
          });
        },
      )
      .catch(() => {
        if (active) onStatus("unsupported");
      });
  } catch {
    onStatus("unsupported");
  }

  return () => {
    active = false;
    releaseHeldLock?.();
  };
};

const UDS_RESULTS = ["neg", "pos", "invalid", "nt"] as const;
const UDS_REASONS = ["", "routine", "medmgmt", "preinj", "ordered", "other"] as const;
const UDS_TEMPERATURES = ["acceptable", "not documented", "not acceptable"] as const;
const UDS_CONTROLS = ["not documented", "valid", "invalid"] as const;
const UDS_VALIDITIES = ["acceptable", "needs review", "not documented"] as const;
const UDS_MEDICATION_ALIGNMENTS = [
  "",
  "no unexpected",
  "not aligned",
  "needs review",
  "patient explanation",
  "unavailable",
] as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const isString = (value: unknown): value is string => typeof value === "string";

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

const isPatient = (value: unknown): value is UdsEncounter["patient"] =>
  isObject(value) && isString(value.name) && isString(value.dob);

const normalizedPatientKey = (patient: UdsEncounter["patient"]): string =>
  `${patient.name.replace(/\s+/g, " ").trim().toLocaleLowerCase()}|${patient.dob
    .trim()
    .toLocaleLowerCase()}`;

const isOptionalString = (value: unknown): boolean =>
  value === undefined || isString(value);

const isOptionalBoolean = (value: unknown): boolean =>
  value === undefined || typeof value === "boolean";

const isUdsPanel = (value: unknown): value is UdsPanel =>
  isOneOf(value, UDS_PANELS);

const isUdsResult = (value: unknown): value is UdsResultState =>
  isOneOf(value, UDS_RESULTS);

const isResults = (value: unknown): value is UdsEncounter["results"] =>
  isObject(value) &&
  Object.entries(value).every(
    ([panel, result]) => isUdsPanel(panel) && isUdsResult(result),
  );

const isEncounter = (value: unknown): value is UdsEncounter =>
  isObject(value) &&
  isPatient(value.patient) &&
  isString(value.collectionDateTime) &&
  isOneOf(value.reason, UDS_REASONS) &&
  isOptionalString(value.reasonDetail) &&
  isString(value.device) &&
  (value.omittedPanel === undefined || value.omittedPanel === "" || isUdsPanel(value.omittedPanel)) &&
  typeof value.physicalReadingsVerified === "boolean" &&
  isOptionalString(value.customDeviceName) &&
  (value.customPanels === undefined ||
    (Array.isArray(value.customPanels) && value.customPanels.every(isUdsPanel))) &&
  isOptionalBoolean(value.customPanelSetVerified) &&
  isString(value.lot) &&
  isString(value.expiration) &&
  isString(value.collector) &&
  isOneOf(value.temperature, UDS_TEMPERATURES) &&
  isOneOf(value.control, UDS_CONTROLS) &&
  isOneOf(value.validity, UDS_VALIDITIES) &&
  isOneOf(value.medicationAlignment, UDS_MEDICATION_ALIGNMENTS) &&
  isResults(value.results) &&
  isOptionalString(value.labPlan) &&
  isOptionalString(value.comment);

const isAddendum = (value: unknown): boolean =>
  isObject(value) &&
  isString(value.id) &&
  isString(value.createdAt) &&
  isString(value.author) &&
  isString(value.text);

const isAttestation = (value: unknown): boolean =>
  isObject(value) &&
  isString(value.staff) &&
  isString(value.timestamp) &&
  isString(value.statementVersion);

const hasUsableShape = (value: unknown): value is UdsRecord => {
  if (
    !isObject(value) ||
    value.type !== "uds" ||
    !isString(value.id) ||
    !value.id.trim() ||
    (value.status !== "draft" && value.status !== "completed") ||
    !isString(value.createdAt) ||
    !isString(value.updatedAt) ||
    !isString(value.completedAt) ||
    !isPatient(value.patient) ||
    !isString(value.summary) ||
    !isEncounter(value.snapshot) ||
    !Array.isArray(value.addenda) ||
    !value.addenda.every(isAddendum) ||
    (value.attestation !== undefined && !isAttestation(value.attestation))
  ) {
    return false;
  }

  return normalizedPatientKey(value.patient) === normalizedPatientKey(value.snapshot.patient);
};

/**
 * Fail-closed boundary for browser-local UDS data. The persistence repository
 * intentionally performs only a shallow record check for compatibility, so
 * presentation code must prove the complete shape before dereferencing it.
 */
export const isUsableUdsRecord = (value: unknown): value is UdsRecord => {
  try {
    if (!hasUsableShape(value)) return false;
    UdsEngine.evaluate(value.snapshot, {});
    return true;
  } catch {
    return false;
  }
};

/** Whole-list guard for mutations: malformed rows and duplicate ids make a
 * browser-local read/modify/write ambiguous, even when the selected row is
 * individually sound. */
export const isUnambiguousUsableUdsRecordList = (
  values: readonly unknown[],
): values is readonly UdsRecord[] => {
  if (!values.every(isUsableUdsRecord)) return false;
  const ids = (values as readonly UdsRecord[]).map((record) => record.id);
  return new Set(ids).size === ids.length;
};
