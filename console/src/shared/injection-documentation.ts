import type { Lot, Patient, Product } from "./contracts.js";
import type { InjectionCase } from "./injections.js";
export function instantLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
export function calendarLabel(value: string, language: "en" | "es" = "en") {
  return new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
export function injectionOutcome(record: InjectionCase) {
  const a = record.administration;
  if (a?.delivery === "partial") return "Partial dose";
  if (a?.delivery === "not_delivered") return "Not delivered";
  return {
    draft: "Draft",
    reviewed: "Ready to administer",
    administered: "Administered",
    held: "Held",
    cancelled: "Cancelled",
  }[record.status];
}
export function injectionNote(
  record: InjectionCase,
  patient: Patient,
  product: Product,
  _lot: Lot | undefined,
  timezone: string,
): string {
  const a = record.administration;
  const r =
    a?.reviewSnapshot || record.review || record.disposition?.reviewSnapshot;
  const p = r?.patientSnapshot || patient;
  const med = r?.productSnapshot || product;
  const order = a?.orderSnapshot || record;
  const lines = [
    "INJECTION ENCOUNTER",
    `${p.displayName} | DOB ${p.dob} | Tebra #${p.tebraId}`,
    `Outcome: ${injectionOutcome(record)}`,
    "",
    "ORDER & TIMING",
    `Medication: ${med.name} · ${med.strength}`,
    `Ordered dose: ${order.dose} ${order.doseUnit} | ${order.route} | ${order.site}`,
    `Ordering provider: ${order.orderingProvider}`,
    `Tebra order: ${order.tebraOrderReference} | Component ${order.doseSequence}`,
    `Planned date: ${calendarLabel(order.plannedOn)}`,
    `Timing: ${order.timingCategory.replaceAll("_", " ")}. ${order.timingPlan}`,
    `Prior administration: ${order.lastAdministrationAt ? instantLabel(order.lastAdministrationAt, timezone) : order.lastAdministrationOn ? calendarLabel(order.lastAdministrationOn) + " (time not recorded)" : "Not recorded"}`,
  ];
  if (r) {
    lines.push(
      "",
      "PRE-ADMINISTRATION REVIEW",
      "Patient identity, active order, allergies, medication, timing, and consent confirmed.",
      `Allergies: ${r.allergyReview}`,
      `Clinical review: ${r.clinicalReview}`,
      `Preparation: ${r.preparation}`,
      `Site assessment: ${r.siteAssessment}`,
    );
    const v = r.vitals;
    const vitals = [
      v.bpSystolic === null ? "" : `BP ${v.bpSystolic}/${v.bpDiastolic} mmHg`,
      v.pulse === null ? "" : `Pulse ${v.pulse}/min`,
      v.temperatureC === null ? "" : `Temperature ${v.temperatureC} °C`,
      v.oxygenSaturation === null ? "" : `SpO₂ ${v.oxygenSaturation}%`,
    ].filter(Boolean);
    lines.push(
      v.status === "recorded"
        ? `Vitals: ${vitals.join(" · ")}`
        : `Vitals not recorded: ${v.reason}`,
      `Observation plan: ${r.observationPlan}`,
      `Reviewed: ${instantLabel(r.reviewedAt, timezone)} | Staff ${r.reviewedBy}`,
      "",
      "PRODUCT TRACEABILITY",
      `NDC: ${med.ndc || "Not recorded"}`,
      `Lot: ${r.lotSnapshot.lotNumber} | Expires ${r.lotSnapshot.expiresOn}`,
      `Source: ${r.lotSnapshot.ownership} | Location: ${r.lotSnapshot.location} | Stock units: ${r.stockUnits}`,
    );
  }
  if (a) {
    lines.push(
      "",
      "ADMINISTRATION",
      `Actual administration / attempt: ${instantLabel(a.administeredAt, timezone)}`,
      `Administered / attempted by: ${a.administeredByName}`,
      `Recorded by staff: ${a.actorId} at ${instantLabel(a.recordedAt, timezone)}`,
      `Delivery: ${injectionOutcome(record)}`,
      `Actual dose: ${a.actualDose === null ? "Unknown" : `${a.actualDose} ${order.doseUnit}`}`,
      `Tolerance / response: ${a.tolerance}`,
      `Observation: ${a.observation}`,
    );
    if (a.issueAction)
      lines.push(`Delivery issue / provider plan: ${a.issueAction}`);
  } else if (record.disposition) {
    lines.push(
      "",
      "DISPOSITION",
      `Medication not administered. ${record.disposition.reason}`,
      `Recorded: ${instantLabel(record.disposition.at, timezone)} | Staff ${record.disposition.actorId}`,
    );
  } else lines.push("", "DRAFT — administration has not been recorded.");
  lines.push(
    "",
    "FOLLOW-UP",
    `Provider-confirmed next date: ${order.nextDueOn ? calendarLabel(order.nextDueOn) : "To be confirmed in Tebra"}`,
  );
  for (const amendment of record.amendments)
    lines.push(
      "",
      `AMENDMENT — ${instantLabel(amendment.createdAt, timezone)} | Staff ${amendment.actorId}`,
      `Reason: ${amendment.reason}`,
      amendment.text,
    );
  lines.push(
    "",
    `Console record ${record.id} · Version ${record.version}`,
    "Prepared for staff review and filing in Tebra.",
  );
  return lines.join("\n");
}
export function injectionAvs(
  record: InjectionCase,
  patient: Patient,
  product: Product,
  timezone: string,
  language: "en" | "es" = "en",
) {
  const a = record.administration;
  const p = a?.reviewSnapshot.patientSnapshot || patient;
  const med = a?.reviewSnapshot.productSnapshot || product;
  const order = a?.orderSnapshot || record;
  const es = language === "es";
  const outcome = es
    ? {
        Administered: "Administrada",
        "Partial dose": "Dosis parcial",
        "Not delivered": "No administrada",
        Held: "En espera",
        Cancelled: "Cancelada",
        Draft: "Borrador",
        "Ready to administer": "Pendiente",
      }[injectionOutcome(record)]
    : injectionOutcome(record);
  const lines = [
    es ? "RESUMEN DE SU VISITA" : "YOUR VISIT SUMMARY",
    p.displayName,
    `${es ? "Fecha de nacimiento" : "Date of birth"}: ${p.dob}`,
    "",
    `${es ? "Medicamento" : "Medication"}: ${med.name} · ${med.strength}`,
    `${es ? "Resultado" : "Outcome"}: ${outcome}`,
  ];
  if (a) {
    lines.push(
      `${es ? "Fecha y hora" : "Date and time"}: ${instantLabel(a.administeredAt, timezone)}`,
      `${es ? "Dosis recibida" : "Dose received"}: ${a.actualDose === null ? (es ? "No determinada" : "Unknown") : `${a.actualDose} ${order.doseUnit}`}`,
      `${es ? "Vía / sitio" : "Route / site"}: ${order.route} · ${order.site}`,
    );
    if (a.issueAction)
      lines.push(
        "",
        es ? "PLAN DEL PROFESIONAL" : "PROVIDER PLAN",
        a.issueAction,
      );
  } else if (record.disposition)
    lines.push(
      "",
      es ? "No se administró la inyección." : "The injection was not given.",
      record.disposition.reason,
    );
  if (a?.delivery === "complete")
    lines.push(
      "",
      es ? "PRÓXIMA VISITA" : "NEXT VISIT",
      order.nextDueOn
        ? calendarLabel(order.nextDueOn, language)
        : es
          ? "Confirme la fecha con la clínica."
          : "Confirm the date with the clinic.",
    );
  else
    lines.push(
      "",
      es ? "PRÓXIMOS PASOS" : "NEXT STEPS",
      es
        ? "Confirme el plan y la próxima fecha con la clínica antes de otra dosis."
        : "Confirm the plan and next date with the clinic before another dose.",
    );
  lines.push(
    "",
    es
      ? "Llame a la clínica si no puede asistir."
      : "Call the clinic if you cannot make your next visit.",
  );
  if (record.amendments.length)
    lines.push(
      "",
      es
        ? "El registro tiene una corrección. Confirme las instrucciones con el personal antes de salir."
        : "This record has an amendment. Confirm your instructions with staff before leaving.",
    );
  return lines.join("\n");
}
