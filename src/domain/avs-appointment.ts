/** Optional handout metadata. None of these facts authorize or schedule care. */
export interface AvsAppointment {
  version: 1;
  mode: "write-in" | "details" | "schedule" | "omit";
  date: string;
  time: string;
  provider: string;
  location: string;
  visitType: "" | "in-person" | "video" | "phone";
}
export const emptyAvsAppointment = (): AvsAppointment => ({
  version: 1, mode: "write-in", date: "", time: "", provider: "", location: "", visitType: "",
});
export function validAppointmentDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  if (year < 100 || year > 9999 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}
export const validAppointmentTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function isAvsAppointment(value: unknown): value is AvsAppointment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const a = value as Record<string, unknown>;
  return a.version === 1 && typeof a.mode === "string" && ["write-in", "details", "schedule", "omit"].includes(a.mode) &&
    typeof a.visitType === "string" && ["", "in-person", "video", "phone"].includes(a.visitType) &&
    typeof a.date === "string" && (!a.date || validAppointmentDate(a.date)) &&
    typeof a.time === "string" && (!a.time || validAppointmentTime(a.time)) &&
    typeof a.provider === "string" && a.provider.length <= 160 &&
    typeof a.location === "string" && a.location.length <= 240 &&
    !/[\u0000-\u001f\u007f]/.test(a.provider + a.location);
}
export const appointmentTimeLabel = (value: string): string => {
  if (!validAppointmentTime(value)) return "";
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
};
export const appointmentDateLabel = (value: string): string => validAppointmentDate(value)
  ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" })
    .format(new Date(`${value}T12:00:00Z`)) : "";
export const appointmentVisitLabel = (value: AvsAppointment["visitType"]): string =>
  ({ "": "", "in-person": "In person", video: "Video visit", phone: "Phone visit" })[value];

/** Fail closed on a stale bridge. Never fill another patient's or visit's handout. */
export function appointmentForInput(
  encounter: { patient: { name: string; dob: string }; administrationDate: string; medicationKey: string; avsAppointment?: AvsAppointment } | undefined,
  input: { patientName: string; patientDob: string; administrationDate: string; medicationKey: string },
): AvsAppointment | undefined {
  if (!encounter || !isAvsAppointment(encounter.avsAppointment)) return undefined;
  const dob = (s: string) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
    return m ? `${m[3]}-${m[1]}-${m[2]}` : s.trim();
  };
  return encounter.patient.name.trim() && encounter.patient.dob.trim() &&
    encounter.patient.name.trim() === input.patientName.trim() &&
    dob(encounter.patient.dob) === dob(input.patientDob) &&
    encounter.administrationDate === input.administrationDate && encounter.medicationKey === input.medicationKey
    ? structuredClone(encounter.avsAppointment) : undefined;
}
