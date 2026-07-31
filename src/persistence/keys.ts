export const INJECTION_RECORDS_STORAGE_KEY = "ipmgMedAssistInjectionRecordsV1";
export const SITE_HISTORY_STORAGE_KEY = "ipmgMedAssistSiteHistory";
export const STAFF_STORAGE_KEY = "ipmgMedAssistStaff";
export const LEGACY_STAFF_STORAGE_KEY = "ipmgStaffName";
export const CLINIC_LOCATION_STORAGE_KEY = "ipmgMedAssistClinicLocation_v1";
export const UDS_SIGNATURE_FIELDS_STORAGE_KEY = "ipmgUdsSignatureFields";

export const activityLogStorageKey = (localDate: string): string =>
  `ipmgMedAssistActivityLog_${localDate}`;
