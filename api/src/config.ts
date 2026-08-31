import type { InjectionClinicConfiguration } from "../../src/integrations/power-apps";

export interface DataverseConfiguration {
  url: string;
  actionEntitySet: string;
  draftJsonColumn: string;
  finalJsonColumn: string;
  statusColumn: string;
  idempotencyColumn: string;
  tebraAcknowledgedColumn: string;
  /**
   * Board/integration-owned, Canvas-read-only identity columns. The API
   * treats these as the authoritative check-in/patient/order binding for a
   * clinical action and rejects any Draft JSON that disagrees with them.
   */
  checkInIdColumn: string;
  patientIdColumn: string;
  orderIdColumn: string;
  /**
   * Board/integration-owned protected patient-identity snapshot column
   * (name/DOB/MRN as JSON). Required: the clinical note and AVS must never
   * let Canvas-supplied Draft JSON determine final-document patient
   * demographics, so a tenant that has not wired this column cannot
   * evaluate or finalize at all — see api/README.md "Authoritative patient
   * context" for the mandatory pre-tenant-integration blocker this
   * documents.
   */
  patientContextColumn: string;
  /** Optional order snapshot (medicationKey/dose/orderingProvider/route/intervalKey) checked against the encounter when configured. */
  orderContextColumn?: string;
  /**
   * Optional board-owned Tebra acknowledgement provenance columns. When all
   * four are configured and populated on a row, finalization records the
   * real acknowledgement source/time/identity/check-in instead of only the
   * finalizer's own attestation. readApiConfiguration requires these to be
   * either all configured or all absent — a partially configured set is a
   * deployment error, not a documented limitation.
   */
  acknowledgmentSourceColumn?: string;
  acknowledgedAtColumn?: string;
  acknowledgedByColumn?: string;
  acknowledgedCheckInIdColumn?: string;
  draftStatusValue: string | number;
  finalStatusValue: string | number;
}

export interface ApiConfiguration {
  clinic: InjectionClinicConfiguration;
  requiredRole: string;
  dataverse?: DataverseConfiguration;
}

const env = (name: string): string => String(process.env[name] ?? "").trim();

const required = (name: string): string => {
  const value = env(name);
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
};

const safeLogicalName = (name: string, value: string): string => {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`${name} must be a Dataverse logical/entity-set name.`);
  }
  return value;
};

/**
 * Optional Dataverse column configuration (order context, board
 * acknowledgement provenance). Absent when the tenant has not wired the
 * column yet; this is a documented acceptance-gate limitation, not a
 * fallback the API invents data for.
 */
const optionalLogicalName = (name: string): string | undefined => {
  const value = env(name);
  return value ? safeLogicalName(name, value) : undefined;
};

const ACK_PROVENANCE_ENV_NAMES = [
  "DATAVERSE_ACK_SOURCE_COLUMN",
  "DATAVERSE_ACK_AT_COLUMN",
  "DATAVERSE_ACK_BY_COLUMN",
  "DATAVERSE_ACK_CHECKIN_ID_COLUMN",
] as const;

/**
 * The four Tebra acknowledgement-provenance columns are meaningful only as
 * a set: finalization either has a complete board-sourced acknowledgement
 * (source, timestamp, identity, check-in) or none at all. A tenant that has
 * wired only some of the four would silently produce a partial/misleading
 * provenance record, so a partial configuration is rejected at startup
 * rather than tolerated as a documented limitation.
 */
const ackProvenanceColumns = (): {
  acknowledgmentSourceColumn?: string;
  acknowledgedAtColumn?: string;
  acknowledgedByColumn?: string;
  acknowledgedCheckInIdColumn?: string;
} => {
  const configuredCount = ACK_PROVENANCE_ENV_NAMES.filter((name) => env(name)).length;
  if (configuredCount !== 0 && configuredCount !== ACK_PROVENANCE_ENV_NAMES.length) {
    throw new Error(
      `${ACK_PROVENANCE_ENV_NAMES.join(", ")} must be either all configured or all absent.`,
    );
  }
  return {
    acknowledgmentSourceColumn: optionalLogicalName("DATAVERSE_ACK_SOURCE_COLUMN"),
    acknowledgedAtColumn: optionalLogicalName("DATAVERSE_ACK_AT_COLUMN"),
    acknowledgedByColumn: optionalLogicalName("DATAVERSE_ACK_BY_COLUMN"),
    acknowledgedCheckInIdColumn: optionalLogicalName("DATAVERSE_ACK_CHECKIN_ID_COLUMN"),
  };
};

const dataverseStatusValue = (name: string): string | number => {
  const value = required(name);
  if (!/^-?\d+$/.test(value)) return value;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) {
    throw new Error(`${name} must be a safe Dataverse Choice integer or text value.`);
  }
  return numeric;
};

const validTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

export const readApiConfiguration = (
  options: { requireDataverse?: boolean } = {},
): ApiConfiguration => {
  const timeZone = required("CLINIC_TIME_ZONE");
  if (!validTimeZone(timeZone)) {
    throw new Error("CLINIC_TIME_ZONE must be a valid IANA time zone.");
  }
  if (required("CLINIC_PROVIDER_REGISTER") !== "san-bernardino-v1") {
    throw new Error(
      "This build contains only the reviewed San Bernardino provider register.",
    );
  }

  const clinic: InjectionClinicConfiguration = {
    facilityName: required("CLINIC_FACILITY_NAME"),
    facilityUnit: required("CLINIC_FACILITY_UNIT"),
    clinicPhone: required("CLINIC_PHONE"),
    timeZone,
  };
  const requiredRole = required("ENTRA_REQUIRED_ROLE");
  const dataverseUrl = env("DATAVERSE_URL");
  if (!dataverseUrl) {
    if (options.requireDataverse) {
      throw new Error("DATAVERSE_URL is required for finalization and retrieval.");
    }
    return { clinic, requiredRole };
  }

  const parsedUrl = new URL(dataverseUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("DATAVERSE_URL must use HTTPS.");
  }
  const dataverse: DataverseConfiguration = {
    url: parsedUrl.origin,
    actionEntitySet: safeLogicalName(
      "DATAVERSE_ACTION_ENTITY_SET",
      required("DATAVERSE_ACTION_ENTITY_SET"),
    ),
    draftJsonColumn: safeLogicalName(
      "DATAVERSE_DRAFT_JSON_COLUMN",
      required("DATAVERSE_DRAFT_JSON_COLUMN"),
    ),
    finalJsonColumn: safeLogicalName(
      "DATAVERSE_FINAL_JSON_COLUMN",
      required("DATAVERSE_FINAL_JSON_COLUMN"),
    ),
    statusColumn: safeLogicalName(
      "DATAVERSE_STATUS_COLUMN",
      required("DATAVERSE_STATUS_COLUMN"),
    ),
    idempotencyColumn: safeLogicalName(
      "DATAVERSE_IDEMPOTENCY_COLUMN",
      required("DATAVERSE_IDEMPOTENCY_COLUMN"),
    ),
    tebraAcknowledgedColumn: safeLogicalName(
      "DATAVERSE_TEBRA_ACKNOWLEDGED_COLUMN",
      required("DATAVERSE_TEBRA_ACKNOWLEDGED_COLUMN"),
    ),
    checkInIdColumn: safeLogicalName(
      "DATAVERSE_CHECKIN_ID_COLUMN",
      required("DATAVERSE_CHECKIN_ID_COLUMN"),
    ),
    patientIdColumn: safeLogicalName(
      "DATAVERSE_PATIENT_ID_COLUMN",
      required("DATAVERSE_PATIENT_ID_COLUMN"),
    ),
    orderIdColumn: safeLogicalName(
      "DATAVERSE_ORDER_ID_COLUMN",
      required("DATAVERSE_ORDER_ID_COLUMN"),
    ),
    patientContextColumn: safeLogicalName(
      "DATAVERSE_PATIENT_CONTEXT_COLUMN",
      required("DATAVERSE_PATIENT_CONTEXT_COLUMN"),
    ),
    orderContextColumn: optionalLogicalName("DATAVERSE_ORDER_CONTEXT_COLUMN"),
    ...ackProvenanceColumns(),
    draftStatusValue: dataverseStatusValue("DATAVERSE_DRAFT_STATUS_VALUE"),
    finalStatusValue: dataverseStatusValue("DATAVERSE_FINAL_STATUS_VALUE"),
  };
  return { clinic, requiredRole, dataverse };
};

export const facilityDate = (timeZone: string, now = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
