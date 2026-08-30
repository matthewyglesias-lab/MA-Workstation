import type { InjectionClinicConfiguration } from "../../src/integrations/power-apps";

export interface DataverseConfiguration {
  url: string;
  actionEntitySet: string;
  draftJsonColumn: string;
  finalJsonColumn: string;
  statusColumn: string;
  idempotencyColumn: string;
  tebraAcknowledgedColumn: string;
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
