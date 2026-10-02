import { appointmentDateLabel, appointmentTimeLabel, appointmentVisitLabel, isAvsAppointment, type AvsAppointment } from "./avs-appointment";

const h = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Includes real writing space even when all stored strings are empty. */
export function appointmentLineBudget(appointment?: AvsAppointment): number {
  if (!appointment || appointment.mode === "omit") return 0;
  if (!isAvsAppointment(appointment) || appointment.mode === "schedule") return 4;
  if (appointment.mode === "write-in") return 8;
  return 7 + Math.ceil(appointment.provider.length / 48) + Math.ceil(appointment.location.length / 72);
}

/** A subordinate part of the existing next-injection panel, never a second due date. */
export function renderAvsAppointment(appointment?: AvsAppointment): string {
  if (!appointment || appointment.mode === "omit") return "";
  const wrap = (title: string, body: string, variant: string) =>
    `<section class="avs2-appointment avs2-appointment-${variant}" aria-label="${title}"><h2 class="avs2-appointment-title">${title}</h2>${body}</section>`;
  if (!isAvsAppointment(appointment)) return wrap("Provider appointment", '<p class="avs2-appointment-help">Appointment details could not be verified. Please confirm them with the front desk.</p>', "unverified");
  if (appointment.mode === "schedule") return wrap("Schedule your provider appointment", '<p class="avs2-appointment-help">Please see the front desk before you leave.</p>', "schedule");

  const a = appointment.mode === "write-in"
    ? { ...appointment, date: "", time: "", provider: "", location: "", visitType: "" as const }
    : appointment;
  const type = appointmentVisitLabel(a.visitType);
  const complete = Boolean(a.date && a.time && a.provider.trim() && a.location.trim() && a.visitType);
  const field = (label: string, value: string, extra = "") =>
    `<div class="avs2-appointment-field"><span class="avs2-appointment-label">${label}</span>${value.trim()
      ? `<strong>${h(value)}</strong>`
      : `<span class="avs2-write-line" aria-label="Write ${label.toLowerCase()} here"></span>${extra}`}</div>`;

  const content = complete
    ? `<div class="avs2-appointment-booked"><strong>${h(appointmentDateLabel(a.date))}</strong><strong class="avs2-appointment-time">${h(appointmentTimeLabel(a.time))}</strong></div>` +
      `<p class="avs2-appointment-provider"><span>With </span><strong>${h(a.provider)}</strong></p>` +
      `<p class="avs2-appointment-location">${h(type)} · ${h(a.location)}</p>`
    : `<div class="avs2-appointment-when">${field("Date", appointmentDateLabel(a.date))}${field("Time", appointmentTimeLabel(a.time), '<small>AM / PM</small>')}</div>` +
      `<div class="avs2-appointment-where">${field("With", a.provider)}${field(a.visitType === "video" || a.visitType === "phone" ? "Connect" : "Office", a.location)}</div>` +
      (type ? `<p class="avs2-appointment-type">${h(type)}</p>` : "");
  return wrap("Your next provider appointment", content +
    `<p class="avs2-appointment-help">${complete ? "For appointment changes, please call the clinic." : "Please have the front desk confirm these details before you leave."}</p>`, complete ? "complete" : "write-in");
}
