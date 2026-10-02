/**
 * Public AVS content entry point. Keep clinic visit instructions separate from
 * the preserved medication guidance; neither layer authorizes administration.
 * The 2026-10-01 clinic request changes hours and routine return-window copy
 * only. Dose calculations, due dates, preparation, and starting-series guidance
 * remain authoritative in their existing modules.
 */
import {
  buildInjectionAvsModel as buildGuidanceModel,
  type InjectionAvsInput,
  type InjectionAvsModel,
} from "./injection-avs-guidance";

export * from "./injection-avs-guidance";

export const AVS_CLINIC_HOURS =
  "Monday-Friday, 8:30 AM - 5:00 PM (appointments preferred)";
export const AVS_ROUTINE_RETURN_WINDOW =
  "With clinic confirmation, you may come in up to 3 days before or 3 days after your due date.";

export const buildInjectionAvsModel = (input: InjectionAvsInput): InjectionAvsModel => {
  const model = buildGuidanceModel(input);
  // Do not turn a starting/restarting/loading dose, a held encounter, an
  // unscheduled visit, or a one-time order into a flexible maintenance plan.
  const routine = Boolean(
    model.nextDose.dateLong &&
    input.reason === "scheduled" &&
    !String(input.initiationProtocol ?? "").trim() &&
    model.documentStatus !== "CARE HANDOFF" &&
    model.nextDose.firmness !== "firm" &&
    input.medicationKey !== "initio" &&
    input.intervalKey !== "once" && input.intervalKey !== "prn"
  );
  const visitCall = model.nextDose.firmness === "call-first"
    ? "Call ahead so we can prepare your medication; this is not a scheduled appointment."
    : `Call ${input.clinicPhone} to schedule or change your visit; this is not a scheduled appointment.`;
  const hasAppointmentSection = input.providerAppointment && input.providerAppointment.mode !== "omit";
  const scopeDateNote = (line: string) => hasAppointmentSection ? line
    .replace("This is your due date, not a scheduled appointment.", "An injection due date does not reserve an appointment time.")
    .replace("this is not a scheduled appointment.", "an injection due date does not reserve an appointment time.") : line;
  const notes = (routine
    ? [`${AVS_ROUTINE_RETURN_WINDOW} ${visitCall}`]
    : model.nextDose.notes).map(scopeDateNote);

  return {
    ...model,
    ...(input.providerAppointment ? { providerAppointment: input.providerAppointment } : {}),
    nextDose: {
      ...model.nextDose,
      notes,
      contactLines: model.nextDose.contactLines.map((row) =>
        row.label === "CLINIC HOURS" ? { ...row, value: AVS_CLINIC_HOURS } : row,
      ),
    },
    // The printed timeline consumes detail rather than nextDose.notes. Keep
    // both views in agreement without mutating the preserved guidance model.
    timeline: model.timeline.map((step) =>
      step.state === "due" && (routine || hasAppointmentSection)
        ? { ...step, detail: routine ? notes : step.detail.map(scopeDateNote) }
        : step,
    ),
    blocks: routine ? model.blocks.map((block) =>
      block.kind === "call-clinic" ? {
        ...block,
        items: block.items?.map((item) =>
          item === "You cannot make your due date - call before that day, not after."
            ? "You cannot come within the clinic-confirmed 3-day window, or need to change your visit."
            : item,
        ),
      } : block,
    ) : model.blocks,
  };
};
