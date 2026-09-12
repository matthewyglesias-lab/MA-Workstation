import {
  INJECTION_DEPARTURE_STATUS_OPTIONS,
  emptyInjectionEncounter,
  InjectionEngine,
  INJECTION_RESPONSE_OPTIONS,
  type InjectionAdministrationDetails,
  type InjectionEncounter,
  type InjectionResponse,
} from "../../../domain/injection";
import { INJECTION_MEDICATIONS } from "../../../domain/injection-catalog";
import { INJECTION_RECORDS_STORAGE_KEY } from "../../../persistence/keys";

export const TYPED_INJECTION_ENCOUNTER_KEY = "typedEncounterV1";
let activeInstallations = 0;
const installedSetItems = new Set<Storage["setItem"]>();

export const injectionPresentationExtensionAvailable = (): boolean =>
  activeInstallations > 0 &&
  typeof Storage !== "undefined" &&
  installedSetItems.has(Storage.prototype.setItem);

interface TypedInjectionEnvelope {
  version: 2;
  orderingProvider: string;
  // Empty strings are intentional clears. Omitting these values would allow
  // an older compatibility projection to resurrect a value the user cleared.
  habitus: NonNullable<InjectionEncounter["habitus"]> | "";
  weight: string;
  weightUnit: "kg" | "lb" | "";
  /** Keeps scanner/custom input byte-exact where the legacy v4 normalizer trims it. */
  pairedSecondNdc: string;
  response: InjectionResponse;
  details: Pick<
    InjectionAdministrationDetails,
    | "siteAssessed"
    | "postInjectionObservation"
    | "educationProvided"
    | "departureStatus"
    | "departureStatusNote"
  >;
}

export interface InjectionPresentationExtensionRead {
  encounter: InjectionEncounter;
  status: "absent" | "valid" | "invalid";
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * Restores material typed fields that the compatibility snapshot does not
 * otherwise preserve. Older records without the versioned extension continue
 * through the ordinary legacy hydrator; a present but malformed extension is
 * reported separately so callers can fail closed instead of overwriting it.
 */
export function readInjectionPresentationExtension(
  fallback: InjectionEncounter,
  documentation: unknown,
): InjectionPresentationExtensionRead {
  if (documentation === undefined) {
    return { encounter: fallback, status: "absent" };
  }
  const documentationRecord = asRecord(documentation);
  if (!documentationRecord) {
    return { encounter: fallback, status: "invalid" };
  }
  if (
    !Object.prototype.hasOwnProperty.call(
      documentationRecord,
      TYPED_INJECTION_ENCOUNTER_KEY,
    )
  ) {
    return { encounter: fallback, status: "absent" };
  }
  const envelope = asRecord(
    documentationRecord[TYPED_INJECTION_ENCOUNTER_KEY],
  );
  if (
    !envelope ||
    (envelope.version !== 1 && envelope.version !== 2) ||
    typeof envelope.orderingProvider !== "string" ||
    (envelope.version === 2 && typeof envelope.pairedSecondNdc !== "string") ||
    (envelope.version === 1 &&
      envelope.pairedSecondNdc !== undefined &&
      typeof envelope.pairedSecondNdc !== "string") ||
    !asRecord(envelope.response) ||
    !asRecord(envelope.details)
  ) {
    return { encounter: fallback, status: "invalid" };
  }
  const response = envelope.response as Record<string, unknown>;
  const details = envelope.details as Record<string, unknown>;
  const responseOption = INJECTION_RESPONSE_OPTIONS.find(
    (option) => option.key === response.kind,
  );
  const responseKindValid = response.kind === "" || Boolean(responseOption);
  const responseDetailValid =
    response.detail === undefined ||
    response.detail === "" ||
    (typeof response.detail === "string" &&
      Boolean(
        responseOption?.details?.some(
          (option) => option.key === response.detail,
        ),
      ));
  const departureStatusValid =
    details.departureStatus === "" ||
    details.departureStatus === "custom" ||
    INJECTION_DEPARTURE_STATUS_OPTIONS.some(
      (option) => option.key === details.departureStatus,
    );
  if (
    !responseKindValid ||
    !responseDetailValid ||
    (response.custom !== undefined && typeof response.custom !== "string") ||
    (envelope.habitus !== "" &&
      envelope.habitus !== "lean" &&
      envelope.habitus !== "average" &&
      envelope.habitus !== "larger") ||
    typeof envelope.weight !== "string" ||
    (envelope.weightUnit !== "" &&
      envelope.weightUnit !== "kg" &&
      envelope.weightUnit !== "lb") ||
    typeof details.siteAssessed !== "boolean" ||
    typeof details.postInjectionObservation !== "boolean" ||
    typeof details.educationProvided !== "boolean" ||
    !departureStatusValid ||
    typeof details.departureStatusNote !== "string"
  ) {
    return { encounter: fallback, status: "invalid" };
  }
  const fallbackVitals = { ...fallback.vitals };
  delete fallbackVitals.weight;
  delete fallbackVitals.weightUnit;
  const { habitus: _fallbackHabitus, ...fallbackWithoutHabitus } = fallback;
  const candidate: InjectionEncounter = {
    ...fallbackWithoutHabitus,
    orderingProvider: envelope.orderingProvider,
    ...(envelope.habitus === "lean" ||
    envelope.habitus === "average" ||
    envelope.habitus === "larger"
      ? { habitus: envelope.habitus }
      : {}),
    vitals: {
      ...fallbackVitals,
      ...(envelope.weight ? { weight: envelope.weight } : {}),
      ...(envelope.weightUnit === "kg" || envelope.weightUnit === "lb"
        ? { weightUnit: envelope.weightUnit }
        : {}),
    },
    ...(fallback.initiation
      ? {
          initiation: {
            ...fallback.initiation,
            second: {
              ...fallback.initiation.second,
              ndc:
                typeof envelope.pairedSecondNdc === "string"
                  ? envelope.pairedSecondNdc
                  : fallback.initiation.second.ndc,
            },
          },
        }
      : {}),
    response: {
      kind: typeof response.kind === "string"
        ? (response.kind as InjectionResponse["kind"])
        : fallback.response.kind,
      ...(typeof response.detail === "string"
        ? { detail: response.detail }
        : {}),
      ...(typeof response.custom === "string"
        ? { custom: response.custom }
        : {}),
    },
    details: {
      ...fallback.details,
      siteAssessed: details.siteAssessed === true,
      postInjectionObservation: details.postInjectionObservation === true,
      educationProvided: details.educationProvided === true,
      ...(typeof details.departureStatus === "string"
        ? {
            departureStatus:
              details.departureStatus as InjectionAdministrationDetails["departureStatus"],
          }
        : {}),
      ...(typeof details.departureStatusNote === "string"
        ? { departureStatusNote: details.departureStatusNote }
        : {}),
    },
  };
  try {
    InjectionEngine.evaluate(candidate, {});
    return { encounter: candidate, status: "valid" };
  } catch {
    return { encounter: fallback, status: "invalid" };
  }
}

export function withInjectionPresentationExtension(
  fallback: InjectionEncounter,
  documentation: unknown,
): InjectionEncounter {
  return readInjectionPresentationExtension(fallback, documentation).encounter;
}

/** Full presentation-safe record shape for opening and chart indexing. */
export function isUsableInjectionRecord(value: unknown): boolean {
  const record = asRecord(value);
  const patient = asRecord(record?.patient);
  const snapshot = asRecord(record?.snapshot);
  const fields = asRecord(snapshot?.fields);
  const state = asRecord(snapshot?.state);
  const initiation = asRecord(snapshot?.initiation);
  const second = asRecord(initiation?.second);
  const disposition = asRecord(snapshot?.disposition);
  const note = asRecord(snapshot?.note);
  const addenda = record?.addenda;
  const attestation = record?.attestation;
  const audit = record?.audit;
  const stringFields = (entry: unknown, required: string[]): boolean => {
    const candidate = asRecord(entry);
    return Boolean(
      candidate && required.every((key) => typeof candidate[key] === "string"),
    );
  };
  const optionalDocumentationIsPlain = (entry: unknown): boolean => {
    const candidate = asRecord(entry);
    return Boolean(
      candidate &&
        (candidate.documentation === undefined ||
          Boolean(asRecord(candidate.documentation))),
    );
  };
  const optionalLeavesHaveType = (
    entry: Record<string, unknown> | undefined,
    keys: string[],
    expected: "string" | "boolean" | "number",
  ): boolean => !entry || Boolean(
    keys.every((key) =>
      entry[key] === undefined || typeof entry[key] === expected,
    ),
  );
  const stringFieldIds = [
    "ptName", "ptDOB", "orderingProvider", "injOrderPurpose", "ndc",
    "lot", "exp", "injProductSource", "injProductSourceOther",
    "injPreparation", "injPreparationDetail", "injWasteAmount",
    "injWasteWitness", "injProductIssueDetail", "injProductIssueAction",
    "injProductIssueRecipient", "injProductIssueNotificationTime",
    "injProductIssueDirection", "injProductIssueNextStep", "allergies",
    "bp", "hr", "temp", "rr", "spo2", "vitalRepeatNote", "tech",
    "priorDose", "priorSite", "adminDate", "injAdminTime",
    "injSecondAdminTime", "nextDate", "clinic", "respCustom", "admin",
    "injVolume", "injVolumeUnit", "injDevice", "injDeviceOther",
    "injSiteCondition", "injSiteConditionDetail", "injExceptionSummary",
    "injExceptionRecipient", "injExceptionTime", "injExceptionOutcome",
  ];
  if (
    !record ||
    record.type !== "injection" ||
    typeof record.id !== "string" ||
    !record.id.trim() ||
    (record.status !== "draft" && record.status !== "completed") ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    typeof record.completedAt !== "string" ||
    typeof record.summary !== "string" ||
    !Array.isArray(addenda) ||
    !addenda.every((entry) =>
      stringFields(entry, ["id", "createdAt", "author", "text"]),
    ) ||
    (attestation !== undefined &&
      (!stringFields(attestation, ["staff", "timestamp", "statementVersion"]) ||
        !optionalDocumentationIsPlain(attestation))) ||
    (audit !== undefined &&
      (!Array.isArray(audit) ||
        !audit.every((entry) =>
          stringFields(entry, ["id", "event", "timestamp"]) &&
          optionalDocumentationIsPlain(entry) &&
          ["staff", "statementVersion", "attestationTimestamp"].every(
            (key) => {
              const candidate = asRecord(entry);
              return candidate?.[key] === undefined ||
                typeof candidate[key] === "string";
            },
          ),
        ))) ||
    !patient ||
    typeof patient.name !== "string" ||
    typeof patient.dob !== "string" ||
    !snapshot ||
    (snapshot.version !== 4 &&
      !(record.status === "completed" && snapshot.version === 3)) ||
    typeof snapshot.medKey !== "string" ||
    (snapshot.medKey !== "" &&
      !Object.prototype.hasOwnProperty.call(INJECTION_MEDICATIONS, snapshot.medKey)) ||
    !fields ||
    typeof fields.ptName !== "string" ||
    typeof fields.ptDOB !== "string" ||
    fields.ptName.trim() !== patient.name.trim() ||
    fields.ptDOB.trim() !== patient.dob.trim() ||
    !optionalLeavesHaveType(fields, stringFieldIds, "string") ||
    !optionalLeavesHaveType(
      fields,
      ["injWasteToggle", "injProductIssueToggle", "injExceptionToggle"],
      "boolean",
    ) ||
    (snapshot.state !== undefined && !state) ||
    !optionalLeavesHaveType(
      state,
      ["customMedication", "dose", "site", "route", "intervalKey", "reason", "resp"],
      "string",
    ) ||
    !optionalLeavesHaveType(state, ["retCustom"], "boolean") ||
    (state?.attest !== undefined && !asRecord(state.attest)) ||
    !optionalLeavesHaveType(
      asRecord(state?.attest),
      [
        "id2", "rights", "allergy", "consent", "prior", "screen",
        "twoperson", "hygiene", "observe", "education",
      ],
      "boolean",
    ) ||
    (state?.flags !== undefined && !asRecord(state.flags)) ||
    !optionalLeavesHaveType(
      asRecord(state?.flags),
      [
        "opioidFree", "naltrexHS", "suppliedNeedle", "resuspend",
        "visualInspection", "invegaInit", "oralOverlap", "stabilized",
        "paliperidoneTolerability", "aripiprazoleTolerability",
        "glutealOnly", "noMassage", "deepZtrack",
      ],
      "boolean",
    ) ||
    (state?.guard !== undefined && !asRecord(state.guard)) ||
    !optionalLeavesHaveType(
      asRecord(state?.guard),
      [
        "dizzy", "cardiac", "nms", "eps", "site", "opioid", "liver",
        "cvRisk", "dehydration", "antihyp", "frail", "doseChange",
      ],
      "boolean",
    ) ||
    (snapshot.initiation !== undefined && !initiation) ||
    !optionalLeavesHaveType(
      initiation,
      ["protocol", "oralStatus", "providerNote", "sustennaOrder", "day1Date"],
      "string",
    ) ||
    !optionalLeavesHaveType(initiation, ["planVerified"], "boolean") ||
    !optionalLeavesHaveType(initiation, ["version"], "number") ||
    (initiation?.second !== undefined && !second) ||
    !optionalLeavesHaveType(
      second,
      ["productKey", "dose", "site", "ndc", "lot", "exp", "expiration", "note"],
      "string",
    ) ||
    !optionalLeavesHaveType(second, ["given", "orderVerified"], "boolean") ||
    (snapshot.smartVitals !== undefined && !asRecord(snapshot.smartVitals)) ||
    !optionalLeavesHaveType(asRecord(snapshot.smartVitals), ["version"], "number") ||
    !optionalLeavesHaveType(asRecord(snapshot.smartVitals), ["recheck"], "boolean") ||
    (snapshot.disposition !== undefined && !disposition) ||
    !optionalLeavesHaveType(
      disposition,
      ["kind", "provider", "time", "outcome", "reviewedBy", "reviewedAt", "reviewFingerprint"],
      "string",
    ) ||
    (snapshot.note !== undefined && !note) ||
    !optionalLeavesHaveType(note, ["cc", "as", "pl"], "string")
  ) {
    return false;
  }
  const v4ShapeValid =
    Boolean(asRecord(snapshot.state)) &&
    Boolean(asRecord(snapshot.initiation)) &&
    Boolean(asRecord(snapshot.smartVitals)) &&
    Boolean(asRecord(snapshot.disposition)) &&
    Boolean(asRecord(snapshot.note)) &&
    typeof snapshot.safetyNone === "boolean";
  if (snapshot.version === 4 && !v4ShapeValid) return false;
  if (record.status === "completed" && snapshot.version === 3) return true;
  return readInjectionPresentationExtension(
    {
      ...emptyInjectionEncounter(),
      patient: { name: patient.name, dob: patient.dob },
      medicationKey: snapshot.medKey as InjectionEncounter["medicationKey"],
    },
    snapshot.documentation,
  ).status !== "invalid";
}

export function injectionPresentationExtensionValue(
  encounter: InjectionEncounter,
): TypedInjectionEnvelope {
  return {
    version: 2,
    orderingProvider: encounter.orderingProvider,
    habitus: encounter.habitus ?? "",
    weight: encounter.vitals?.weight ?? "",
    weightUnit: encounter.vitals?.weightUnit ?? "",
    pairedSecondNdc: encounter.initiation?.second.ndc ?? "",
    response: encounter.response,
    details: {
      siteAssessed: Boolean(encounter.details?.siteAssessed),
      postInjectionObservation: Boolean(
        encounter.details?.postInjectionObservation,
      ),
      educationProvided: Boolean(encounter.details?.educationProvided),
      departureStatus: encounter.details?.departureStatus ?? "",
      departureStatusNote: encounter.details?.departureStatusNote ?? "",
    },
  };
}

interface LegacyRecordBridge {
  state?: () => { activeRecordId?: string };
  list?: () => unknown[];
}

const recordListFingerprint = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) return undefined;
  const sorted = [...value].sort((left, right) => {
    const leftUpdated = asRecord(left)?.updatedAt;
    const rightUpdated = asRecord(right)?.updatedAt;
    return String(rightUpdated ?? "").localeCompare(String(leftUpdated ?? ""));
  });
  return JSON.stringify(sorted.map((entry) => {
    const record = asRecord(entry);
    const snapshot = asRecord(record?.snapshot);
    const documentation = asRecord(snapshot?.documentation);
    if (!record || !snapshot || !documentation) return entry;
    const {
      [TYPED_INJECTION_ENCOUNTER_KEY]: _ownedExtension,
      ...otherDocumentation
    } = documentation;
    return {
      ...record,
      snapshot: { ...snapshot, documentation: otherDocumentation },
    };
  }));
};

const snapshotFingerprintWithoutOwnedExtension = (value: unknown): string => {
  const snapshot = asRecord(value);
  const documentation = asRecord(snapshot?.documentation);
  if (!snapshot || !documentation) return JSON.stringify(value);
  const {
    [TYPED_INJECTION_ENCOUNTER_KEY]: _ownedExtension,
    ...otherDocumentation
  } = documentation;
  return JSON.stringify({
    ...snapshot,
    documentation: otherDocumentation,
  });
};

/**
 * Adds presentation-owned material typed fields to the same atomic
 * localStorage write made by the frozen legacy v4 record lifecycle.
 *
 * The wrapper is target-key-only and synchronous. It never performs a second
 * write, so a rejected write leaves the previous durable record untouched.
 * Deleting a record is also left untouched when the prior active id no longer
 * exists in the outgoing list.
 */
export function installInjectionPresentationExtension(
  getEncounter: () => InjectionEncounter | undefined,
  onStored?: () => void,
): () => void {
  const prototype = Storage.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "setItem");
  const nativeSetItem = descriptor?.value as Storage["setItem"] | undefined;
  if (!descriptor || typeof nativeSetItem !== "function") return () => undefined;
  let lastKnownValue: string | null;
  try {
    lastKnownValue = window.localStorage.getItem(INJECTION_RECORDS_STORAGE_KEY);
  } catch {
    return () => undefined;
  }
  try {
    const bridge = (window as unknown as { IPMGRecords?: LegacyRecordBridge })
      .IPMGRecords;
    const durableAtInstall: unknown = lastKnownValue === null
      ? []
      : JSON.parse(lastKnownValue);
    if (
      recordListFingerprint(durableAtInstall) === undefined ||
      recordListFingerprint(durableAtInstall) !==
        recordListFingerprint(bridge?.list?.())
    ) {
      return () => undefined;
    }
  } catch {
    return () => undefined;
  }

  const installedSetItem: Storage["setItem"] = function (
    this: Storage,
    key: string,
    value: string,
  ) {
    let nextValue = value;
    let activeEnvelopeUpdated = false;
    const targetWrite =
      this === window.localStorage && key === INJECTION_RECORDS_STORAGE_KEY;
    let durableBefore: string | null = null;
    if (targetWrite) {
      durableBefore = this.getItem(INJECTION_RECORDS_STORAGE_KEY);
      if (durableBefore !== lastKnownValue) {
        throw new Error(
          "Injection records changed outside this workstation session.",
        );
      }
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        throw new Error("Injection record write was not a list.");
      }
      let durableParsed: unknown[] = [];
      if (durableBefore !== null) {
        const candidate: unknown = JSON.parse(durableBefore);
        if (!Array.isArray(candidate)) {
          throw new Error("Stored Injection records were malformed.");
        }
        durableParsed = candidate;
      }
      let preservedPresentationData = false;

      // The legacy writer serializes its boot-time in-memory list, which does
      // not necessarily contain the presentation extension injected on an
      // earlier write. Preserve that one owned key for every durable row so
      // saving the active record cannot erase an inactive record's fields.
      for (const outgoingEntry of parsed) {
        const outgoingRecord = asRecord(outgoingEntry);
        if (!outgoingRecord || typeof outgoingRecord.id !== "string") {
          throw new Error("Injection record write contained an invalid row.");
        }
        const durableMatches = durableParsed.filter(
          (entry) => asRecord(entry)?.id === outgoingRecord.id,
        );
        if (durableMatches.length > 1) {
          throw new Error("Stored Injection records were ambiguous.");
        }
        const durableRecord =
          durableMatches.length === 1 ? asRecord(durableMatches[0]) : undefined;
        if (!durableRecord) continue;
        const durableSnapshot = asRecord(durableRecord.snapshot);
        if (!durableSnapshot) {
          throw new Error("Stored Injection snapshot was malformed.");
        }
        const outgoingSnapshot = asRecord(outgoingRecord.snapshot);
        if (!outgoingSnapshot) {
          throw new Error("Injection record snapshot was malformed.");
        }
        const durableFields = asRecord(durableSnapshot.fields);
        const outgoingFields = asRecord(outgoingSnapshot.fields);
        if (durableFields && !outgoingFields) {
          throw new Error("Injection record fields were malformed.");
        }
        if (durableFields && outgoingFields) {
          for (const [fieldId, fieldValue] of Object.entries(durableFields)) {
            if (
              !Object.prototype.hasOwnProperty.call(outgoingFields, fieldId) ||
              outgoingFields[fieldId] === undefined
            ) {
              outgoingFields[fieldId] = fieldValue;
              preservedPresentationData = true;
            }
          }
        }
        if (
          durableSnapshot.documentation !== undefined &&
          !asRecord(durableSnapshot.documentation)
        ) {
          throw new Error("Stored Injection documentation was malformed.");
        }
        const durableDocumentation = asRecord(durableSnapshot.documentation);
        if (
          !durableDocumentation ||
          !Object.prototype.hasOwnProperty.call(
            durableDocumentation,
            TYPED_INJECTION_ENCOUNTER_KEY,
          )
        ) {
          continue;
        }
        if (
          outgoingSnapshot.documentation !== undefined &&
            !asRecord(outgoingSnapshot.documentation))
        {
          throw new Error("Injection record snapshot was malformed.");
        }
        outgoingSnapshot.documentation = {
          ...(asRecord(outgoingSnapshot.documentation) ?? {}),
          [TYPED_INJECTION_ENCOUNTER_KEY]:
            durableDocumentation[TYPED_INJECTION_ENCOUNTER_KEY],
        };
        preservedPresentationData = true;
      }
      if (preservedPresentationData) nextValue = JSON.stringify(parsed);

      const activeRecordId = (
        window as unknown as { IPMGRecords?: LegacyRecordBridge }
      ).IPMGRecords?.state?.().activeRecordId;
      if (activeRecordId) {
        const matches = parsed.filter(
          (entry) => asRecord(entry)?.id === activeRecordId,
        );
        const record = matches.length === 1 ? asRecord(matches[0]) : undefined;
        if (
          matches.length !== 1 ||
          !record ||
          record.type !== "injection" ||
          (record.status !== "draft" && record.status !== "completed")
        ) {
          throw new Error("Active injection record was missing from its write.");
        }

        // Adding an append-only correction must never rewrite a locked
        // clinical snapshot or manufacture presentation metadata on a
        // historical completed record. If the durable and outgoing rows are
        // both completed, verify that the snapshot is byte-semantically
        // unchanged and retain the exact durable snapshot in the new row.
        if (record.status === "completed") {
          if (durableBefore !== null) {
            const durableMatches = durableParsed.filter(
              (entry) => asRecord(entry)?.id === activeRecordId,
            );
            if (durableMatches.length > 1) {
              throw new Error("Stored Injection records were ambiguous.");
            }
            const durableRecord =
              durableMatches.length === 1
                ? asRecord(durableMatches[0])
                : undefined;
            if (
              durableRecord &&
              (durableRecord.type !== "injection" ||
                (durableRecord.status !== "draft" &&
                  durableRecord.status !== "completed"))
            ) {
              throw new Error("Stored Injection record was malformed.");
            }
            if (durableRecord?.status === "completed") {
              if (
                snapshotFingerprintWithoutOwnedExtension(
                  durableRecord.snapshot,
                ) !== snapshotFingerprintWithoutOwnedExtension(record.snapshot)
              ) {
                throw new Error("A completed Injection snapshot changed.");
              }
              record.snapshot = durableRecord.snapshot;
              nextValue = JSON.stringify(parsed);
              const result = nativeSetItem.call(this, key, nextValue);
              lastKnownValue = nextValue;
              return result;
            }
          }
        }

        const encounter = getEncounter();
        if (!encounter) {
          throw new Error("Typed injection state was unavailable for its write.");
        }
        const snapshot = asRecord(record.snapshot);
        if (!snapshot || snapshot.version !== 4) {
          throw new Error("Active injection record snapshot was malformed.");
        }
        if (
          snapshot.documentation !== undefined &&
          !asRecord(snapshot.documentation)
        ) {
          throw new Error("Injection documentation was malformed.");
        }
        const documentation = asRecord(snapshot.documentation) ?? {};
        if (
          readInjectionPresentationExtension(encounter, documentation)
            .status === "invalid"
        ) {
          throw new Error(
            "Stored Injection presentation data was malformed.",
          );
        }
        snapshot.documentation = {
          ...documentation,
          [TYPED_INJECTION_ENCOUNTER_KEY]:
            injectionPresentationExtensionValue(encounter),
        };
        activeEnvelopeUpdated = true;
        nextValue = JSON.stringify(parsed);
      }
    }
    const result = nativeSetItem.call(this, key, nextValue);
    if (targetWrite) lastKnownValue = nextValue;
    if (
      this === window.localStorage &&
      key === INJECTION_RECORDS_STORAGE_KEY &&
      activeEnvelopeUpdated
    ) {
      try {
        onStored?.();
      } catch {
        // Persistence already succeeded; UI notification cannot reverse it.
      }
    }
    return result;
  };

  try {
    Object.defineProperty(prototype, "setItem", {
      ...descriptor,
      value: installedSetItem,
    });
  } catch {
    return () => undefined;
  }

  activeInstallations += 1;
  installedSetItems.add(installedSetItem);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    activeInstallations -= 1;
    installedSetItems.delete(installedSetItem);
    if (prototype.setItem !== installedSetItem) return;
    try {
      Object.defineProperty(prototype, "setItem", descriptor);
    } catch {
      // Unmount cleanup must not throw if another owner locks the prototype.
    }
  };
}
