import { describe, expect, it } from "vitest";
import { emptyAvsAppointment, isAvsAppointment, validAppointmentDate, validAppointmentTime, appointmentForInput, appointmentTimeLabel, appointmentDateLabel } from "../../src/domain/avs-appointment";
import { appointmentLineBudget, renderAvsAppointment } from "../../src/domain/avs-appointment-render";
import { buildInjectionAvsModel, type InjectionAvsInput } from "../../src/domain/injection-avs-content";
import { buildInjectionAvsHtml, renderInjectionAvsHtml, DEFAULT_AVS_CHROME, selectInjectionAvsLayout } from "../../src/domain/injection-avs-render";
import { emptyInjectionEncounter, InjectionEngine } from "../../src/domain/injection";
import { injectionPresentationExtensionValue, readInjectionPresentationExtension, TYPED_INJECTION_ENCOUNTER_KEY } from "../../src/presentation/workflows/injection/injection-presentation-extension";
import { writeFileSync, mkdirSync } from "node:fs";
const appointment = () => ({ ...emptyAvsAppointment(), mode: "details" as const, date: "2026-11-03", time: "10:30", provider: "Synthetic Provider, PMHNP-BC", location: "San Bernardino clinic", visitType: "in-person" as const });
const input = (overrides: Partial<InjectionAvsInput> = {}): InjectionAvsInput => ({
 patientName: "Example, Patient", patientDob: "01/02/1990", recordNumber: "DEMO", orderingProvider: "Synthetic Provider", administeredBy: "Synthetic Staff",
 medicationKey: "sustenna", medicationName: "Invega Sustenna", genericName: "paliperidone palmitate", dose: "156 mg", route: "IM", site: "R deltoid", intervalKey: "q4wk", administrationDate: "2026-10-06", administrationTime: "10:00", nextDoseDate: "2026-11-03", lot: "SYNTHETIC", expiration: "2027-12", responseLabel: "Tolerated well", reason: "scheduled", initiationProtocol: "", day1Date: "", clinicPhone: "(909) 887-6222", dispositionKind: "administered", ...overrides,
});
const envelope = (value = appointment()) => ({ [TYPED_INJECTION_ENCOUNTER_KEY]: injectionPresentationExtensionValue({ ...emptyInjectionEncounter(), avsAppointment: value }) });

describe("appointment reminder dates and validation", () => {
 it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "01/02/2026", "", "2026-11-03T00:00Z"])("rejects non-calendar ISO value %s", date => expect(validAppointmentDate(date)).toBe(false));
 it.each(["2024-02-29", "2000-02-29", "2026-11-03"])("accepts calendar date %s", date => expect(validAppointmentDate(date)).toBe(true));
 it("formats the patient's reminder with weekday, month and explicit AM/PM", () => {
  expect(appointmentDateLabel("2026-11-03")).toBe("Tuesday, November 3, 2026");
  expect(appointmentTimeLabel("00:00")).toBe("12:00 AM");expect(appointmentTimeLabel("12:30")).toBe("12:30 PM");expect(appointmentTimeLabel("23:05")).toBe("11:05 PM");
  expect(validAppointmentTime("24:00")).toBe(false);expect(validAppointmentTime("9:30")).toBe(false);
 });
 it.each([{ date: "2026-02-29" },{time:"24:00"},{version:2},{mode:"booked"},{provider: "A".repeat(161)},{location:"A".repeat(241)},{provider:"A\nB"}])("rejects malformed persisted data %j", bad => expect(isAvsAppointment({ ...appointment(), ...bad })).toBe(false));
});
describe("patient handout output", () => {
 it("keeps historical absent reminder output absent", () => {expect(renderAvsAppointment()).toBe("");expect(buildInjectionAvsHtml(input())).not.toContain("Your next provider appointment");});
 it("prints write-in lines without leaking retained typed strings", () => {
  const html = renderAvsAppointment({ ...appointment(), mode: "write-in" });
  expect(html).not.toContain("Synthetic Provider"); expect(html).not.toContain("November 3");
  expect(html.match(/class="avs2-write-line"/g)).toHaveLength(4); expect(appointmentLineBudget(emptyAvsAppointment())).toBeGreaterThan(0);
 });
 it("allows partial details without claiming that no appointment exists", () => {
  const html = renderAvsAppointment({ ...appointment(), time: "", location: "" });
  expect(html).toContain("Tuesday, November 3, 2026"); expect(html).toContain("AM / PM");expect(html).not.toContain("No appointment");
  expect(html.match(/class="avs2-write-line"/g)).toHaveLength(2);
 });
 it("supports explicit schedule and omit without false defaults", () => {
  expect(renderAvsAppointment({ ...appointment(), mode: "schedule" })).toContain("Please see the front desk");
  expect(renderAvsAppointment({ ...appointment(), mode: "omit" })).toBe("");
 });
 it("labels remote visits accurately", () => {const html=renderAvsAppointment({...appointment(),visitType:"video"});expect(html).toContain("Video visit");expect(html).not.toContain("Office");expect(html).not.toContain("In person");});
 it("escapes entered content instead of interpreting markup", () => {const html=renderAvsAppointment({...appointment(),provider:'<img src=x onerror=alert(1)>',location:'A & B'});expect(html).not.toContain('<img');expect(html).toContain('&lt;img');expect(html).toContain('A &amp; B');});
 it("puts the reminder between treatment dates and clinic contact", () => {
  const html=buildInjectionAvsHtml(input({providerAppointment:appointment()}));
  expect(html.indexOf('avs2-appointment')).toBeGreaterThan(html.indexOf('aria-label="Treatment timeline"'));
  expect(html.indexOf('avs2-appointment')).toBeLessThan(html.indexOf('id="avs-contact-primary"'));
  expect(html).toContain('Clinic information'); expect(html).toContain('an injection due date does not reserve an appointment time.');
 });
 it("integrates one reminder into the existing due panel, including typed typography", () => {
  const html = buildInjectionAvsHtml(input({ providerAppointment: appointment() }));
  const due = html.indexOf('class="avs2-step avs2-step-due"');
  const reminder = html.indexOf('class="avs2-appointment ');
  expect(reminder).toBeGreaterThan(due);
  expect(reminder).toBeLessThan(html.indexOf('</li>', due));
  expect(html.match(/class="avs2-appointment /g)).toHaveLength(1);
  expect(html).toContain('avs2-appointment-booked');
  expect(html).toContain('For appointment changes, please call the clinic.');
 });
 it("retains the reminder for a handoff without inventing a due-date step", () => {
  const model = buildInjectionAvsModel(input({ providerAppointment: emptyAvsAppointment() }));
  model.timeline = model.timeline.filter(step => step.state !== "due");
  const html = renderInjectionAvsHtml(model, DEFAULT_AVS_CHROME);
  expect(html).toContain('class="avs2-follow-up"');
  expect(html.match(/class="avs2-appointment /g)).toHaveLength(1);
  expect(html).not.toContain('class="avs2-step avs2-step-due"');
 });
 it("keeps both dates independent and all clinical instructions present", () => {
  const source=input();const before=buildInjectionAvsModel(source);const next=buildInjectionAvsModel({...source,providerAppointment:{...appointment(),date:"2026-11-05"}});
  expect(next.nextDose.dateLong).toBe(before.nextDose.dateLong);expect(next.blocks).toEqual(before.blocks);expect(next.emergency).toEqual(before.emergency);expect(next.leadAlerts).toEqual(before.leadAlerts);
  expect(next.providerAppointment?.date).toBe("2026-11-05");
 });
 it("charges print space for blank handwriting and moves guidance to a named continuation", () => {
  const model=buildInjectionAvsModel(input({providerAppointment:emptyAvsAppointment()}));
  expect(selectInjectionAvsLayout(model)).not.toBe('routine-one-page');
  const html=buildInjectionAvsHtml(input({providerAppointment:emptyAvsAppointment()}));expect(html).toContain('Page 2 of 2');expect(html).toContain('avs2-page-continuation');
 });
});
describe("encounter ownership and backwards compatibility", () => {
 it("round-trips exactly in the existing atomic typed envelope", () => {
  const a={...appointment(),provider:"  Synthetic Provider  "};const source={...emptyInjectionEncounter(),avsAppointment:a};
  const stored=injectionPresentationExtensionValue(source);expect(stored.version).toBe(3);
  expect(readInjectionPresentationExtension(emptyInjectionEncounter(),{[TYPED_INJECTION_ENCOUNTER_KEY]:stored}).encounter.avsAppointment).toEqual(a);
 });
 it("does not change clinical evaluation when scheduling metadata changes", () => {
  const before=emptyInjectionEncounter();const after={...before,avsAppointment:appointment()};expect(InjectionEngine.evaluate(after,{})).toEqual(InjectionEngine.evaluate(before,{}));
 });
 it("rejects malformed metadata rather than overwriting the record", () => {
  const data=envelope();data[TYPED_INJECTION_ENCOUNTER_KEY].avsAppointment!.date="2026-02-31";
  expect(readInjectionPresentationExtension(emptyInjectionEncounter(),data).status).toBe("invalid");
 });
 it("accepts older v2 envelopes without borrowing current appointment details", () => {
  const old:any=injectionPresentationExtensionValue(emptyInjectionEncounter());old.version=2;
  const restored=readInjectionPresentationExtension({...emptyInjectionEncounter(),avsAppointment:appointment()},{[TYPED_INJECTION_ENCOUNTER_KEY]:old});
  expect(restored.status).toBe("valid");expect(restored.encounter.avsAppointment).toBeUndefined();
 });
 it("only projects the currently matching patient and visit, with a detached copy", () => {
  const source={...emptyInjectionEncounter(), patient:{name:"Example, Patient",dob:"01/02/1990"},administrationDate:"2026-10-06",medicationKey:"sustenna" as const,avsAppointment:appointment()};
  const selected=appointmentForInput(source,input());expect(selected).toEqual(appointment());expect(selected).not.toBe(source.avsAppointment);
  expect(appointmentForInput(source,input({patientName:"Another, Patient"}))).toBeUndefined();
  expect(appointmentForInput(source,input({patientDob:"01/03/1990"}))).toBeUndefined();
  expect(appointmentForInput(source,input({administrationDate:"2026-10-07"}))).toBeUndefined();
  expect(appointmentForInput(source,input({medicationKey:"vivitrol"}))).toBeUndefined();expect(appointmentForInput(undefined,input())).toBeUndefined();
 });
 it("does not borrow appointment defaults when a historical envelope is absent", () => {
  const current={...emptyInjectionEncounter(),avsAppointment:appointment()};
  expect(readInjectionPresentationExtension(current,undefined).encounter.avsAppointment).toBeUndefined();
  expect(readInjectionPresentationExtension(current,{}).encounter.avsAppointment).toBeUndefined();
 });
 it("refuses to serialize an invalid appointment without producing replacement bytes", () => {
  const current={...emptyInjectionEncounter(),avsAppointment:{...appointment(),time:"25:00"}};
  expect(()=>injectionPresentationExtensionValue(current)).toThrow(/invalid/);
 });
 it("prints a handwriting rule for whitespace-only appointment text", () => {
  const html=renderAvsAppointment({...appointment(),provider:"   "});
  expect(html.match(/class="avs2-write-line"/g)).toHaveLength(1);
 });
 it("exports synthetic generated samples only when requested for print inspection", () => {
  if (!process.env.AVS_SAMPLE_DIR) return;
  mkdirSync(process.env.AVS_SAMPLE_DIR,{recursive:true});
  for(const [name,a] of Object.entries({handwriting:emptyAvsAppointment(),typed:appointment(),partial:{...appointment(),time:"",location:""},schedule:{...appointment(),mode:"schedule" as const},omit:{...appointment(),mode:"omit" as const}}))
   writeFileSync(`${process.env.AVS_SAMPLE_DIR}/${name}.html`,buildInjectionAvsHtml(input({providerAppointment:a})));
 });
});
