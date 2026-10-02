import { WorkstationDateField } from "../workflows/WorkstationDateField";
import { useId } from "preact/hooks";
import { emptyAvsAppointment, appointmentDateLabel, appointmentTimeLabel, validAppointmentDate, type AvsAppointment } from "../../domain/avs-appointment";

import { providerRegisterOptions } from "../../domain/provider-register";
import "./avs-appointment-editor.css";

interface Props {
  value?: AvsAppointment;
  dueDate: string;
  locked: boolean;
  disabled: boolean;
  onChange: (value: AvsAppointment) => void;
}
/** One disclosure in the existing output area, no new global listeners. */
export function AvsAppointmentEditor({ value, dueDate, locked, disabled, onChange }: Props) {
  const id = useId();
  const appointment = value ?? { ...emptyAvsAppointment(), mode: "omit" as const };
  const set = (partial: Partial<AvsAppointment>) => {
    if (!locked && !disabled) onChange({ ...appointment, ...partial });
  };
  const summary = appointment.mode === "write-in" ? "Space to write in on AVS" :
    appointment.mode === "schedule" ? "Front-desk scheduling reminder" :
    appointment.mode === "omit" ? "Not included" :
    [appointmentDateLabel(appointment.date), appointmentTimeLabel(appointment.time)].filter(Boolean).join(" · ") || "Details to complete";
  return <details class="lf-avs-appointment-editor" data-avs-appointment-editor>
    <summary><strong>Provider appointment</strong><span>{summary}</span><span class="lf-appointment-edit">{locked ? "View" : "Edit"}</span></summary>
    <div class="lf-appointment-editor-body">
      <p id={`${id}-scope`}>A reminder on this handout only. Confirm the appointment in Tebra; this does not book or change a visit.</p>
      {locked && <p>This record is signed. These details are preserved for reprinting; confirm later scheduling changes with the front desk and mark them clearly on the patient’s paper copy.</p>}
      <fieldset disabled={locked || disabled} aria-describedby={`${id}-scope`}>
        <label class="lf-appointment-field"><span>On the AVS</span><select aria-label="Appointment reminder format" value={appointment.mode}
          onChange={e => set({ mode: e.currentTarget.value as AvsAppointment["mode"] })}>
          <option value="write-in">Space to write in</option><option value="details">Enter appointment details</option>
          <option value="schedule">Ask front desk to schedule</option><option value="omit">Leave off this AVS</option>
        </select></label>
        {appointment.mode === "details" && <>
          <div class="lf-appointment-date-row">
            <label class="lf-appointment-field"><span id={`${id}-date`}>Provider appointment date</span><WorkstationDateField labelledBy={`${id}-date`} value={appointment.date} disabled={locked || disabled} onCommit={date => set({ date })}/></label>
            <label class="lf-appointment-field"><span>Appointment time</span><input type="time" aria-label="Provider appointment time" value={appointment.time} onInput={e => set({ time: e.currentTarget.value })}/></label>
          </div>
          <button type="button" class="lf-text-button" disabled={!validAppointmentDate(dueDate)} onClick={() => set({ date: dueDate })}>Use injection due date</button>
          <p class="lf-appointment-date-note">Copies the date once. Use only after confirming the appointment. Changing either date will not move the other.</p>
          {validAppointmentDate(dueDate) && appointment.date && appointment.date !== dueDate &&
            <p>Injection due: {appointmentDateLabel(dueDate)} · Appointment: {appointmentDateLabel(appointment.date)}</p>}
          <div class="lf-appointment-details-row">
            <label class="lf-appointment-field"><span id={`${id}-provider`}>Appointment provider</span>
              <input aria-labelledby={`${id}-provider`} list={`${id}-providers`} maxLength={160} value={appointment.provider}
                onInput={e => set({ provider: e.currentTarget.value.replace(/[\u0000-\u001f\u007f]/g, "") })}/>
              <datalist id={`${id}-providers`}>{providerRegisterOptions().map(p => <option key={p.key} value={p.label}/>)}</datalist></label>
            <label class="lf-appointment-field"><span>Visit type</span><select aria-label="Provider appointment visit type" value={appointment.visitType} onChange={e => set({ visitType: e.currentTarget.value as AvsAppointment["visitType"] })}>
              <option value="">Not entered</option><option value="in-person">In person</option><option value="video">Video</option><option value="phone">Phone</option>
            </select></label>
          </div>
          <label class="lf-appointment-field"><span>{appointment.visitType === "video" || appointment.visitType === "phone" ? "Connection instructions" : "Confirmed office / location"}</span>
            <input aria-label="Provider appointment location" maxLength={240} value={appointment.location} placeholder="Enter the confirmed office or connection instructions"
              onInput={e => set({ location: e.currentTarget.value.replace(/[\u0000-\u001f\u007f]/g, "") })}/></label>
          <p>Leave unknown details blank for handwriting. An empty field does not mean an appointment is not scheduled.</p>
        </>}
      </fieldset>
    </div>
  </details>;
}
