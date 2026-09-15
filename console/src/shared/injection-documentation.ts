import type { Lot, Patient, Product } from "./contracts.js";
import type { InjectionCase, InjectionInput } from "./injections.js";
import { getInjectionGuidance } from "./injection-guidance.js";
import {
  clinicDateAt,
  elapsedCalendarDays,
  injectionIntervalLabel,
} from "./injection-schedule.js";

export interface InjectionDocumentSection {
  heading: string;
  lines: string[];
  emphasis?: boolean;
}
export interface InjectionDocument {
  title: string;
  language: "en" | "es";
  identity: string[];
  sections: InjectionDocumentSection[];
  footer: string[];
}
export function instantLabel(
  value: string,
  timezone: string,
  language: "en" | "es" = "en",
) {
  return new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", {
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
  if (a?.delivery === "error") return "Administration error";
  return {
    draft: "Draft",
    reviewed: "Ready to administer",
    administered: "Administered",
    held: "Held",
    cancelled: "Cancelled",
  }[record.status];
}
function encounterFacts(
  record: InjectionCase,
  patient: Patient,
  product: Product,
) {
  const a = record.administration;
  const review =
    a?.reviewSnapshot ?? record.disposition?.reviewSnapshot ?? record.review;
  return {
    a,
    review,
    patient: review?.patientSnapshot ?? patient,
    product: review?.productSnapshot ?? product,
    order: a?.orderSnapshot ?? record.disposition?.orderSnapshot ?? record,
  };
}
function elapsedLabel(order: InjectionInput, at: string, timezone: string) {
  if (order.lastAdministrationAt) {
    const minutes = Math.floor(
      (Date.parse(at) - Date.parse(order.lastAdministrationAt)) / 60000,
    );
    if (minutes < 0) return null;
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return `${days} days, ${hours} hours (elapsed time)`;
  }
  if (order.lastAdministrationOn) {
    const current = clinicDateAt(at, timezone);
    const days = current
      ? elapsedCalendarDays(order.lastAdministrationOn, current)
      : null;
    return days === null || days < 0
      ? null
      : `${days} calendar days (prior time not recorded)`;
  }
  return null;
}
export function documentText(document: InjectionDocument): string {
  return [
    document.title.toUpperCase(),
    ...document.identity,
    ...document.sections.flatMap((section) => [
      "",
      section.heading.toUpperCase(),
      ...section.lines,
    ]),
    "",
    ...document.footer,
  ].join("\n");
}
export function buildInjectionNote(
  record: InjectionCase,
  patient: Patient,
  product: Product,
  timezone: string,
): InjectionDocument {
  const {
    a,
    review: r,
    patient: p,
    product: med,
    order,
  } = encounterFacts(record, patient, product);
  const context = order.clinicalContext;
  const timing = [
    `Medication: ${med.name} · ${med.strength}`,
    `Ordered dose: ${order.dose} ${order.doseUnit} | ${order.route} | Planned site: ${order.site}`,
    `Ordering provider: ${order.orderingProvider}`,
    `Tebra order: ${order.tebraOrderReference} | Component ${order.doseSequence}`,
    `Planned date: ${calendarLabel(order.plannedOn)}`,
    `Timing: ${order.timingCategory.replaceAll("_", " ")}. ${order.timingPlan}`,
    `Prior administration: ${order.lastAdministrationAt ? instantLabel(order.lastAdministrationAt, timezone) : order.lastAdministrationOn ? calendarLabel(order.lastAdministrationOn) + " (time not recorded)" : "Not recorded"}`,
  ];
  if (context) {
    timing.push(`Treatment phase: ${context.phase.replaceAll("_", " ")}`);
    if (context.indication)
      timing.push(`Indication from order: ${context.indication}`);
    if (context.schedule)
      timing.push(
        `Ordered interval: ${injectionIntervalLabel(context.schedule)}`,
      );
    if (context.historySource)
      timing.push(`Prior-dose history source: ${context.historySource}`);
    if (context.priorProduct || context.priorDose)
      timing.push(
        `Prior regimen: ${[context.priorProduct, context.priorDose].filter(Boolean).join(" · ")}`,
      );
    if (context.linkedPlan)
      timing.push(
        `Linked initiation / oral / switching plan: ${context.linkedPlan}`,
      );
  }
  if (a) {
    const elapsed = elapsedLabel(order, a.administeredAt, timezone);
    if (elapsed) timing.push(`Time since prior administration: ${elapsed}`);
  }
  const sections: InjectionDocumentSection[] = [
    { heading: "Order & timing", lines: timing },
  ];
  if (r) {
    const reviewLines = [
      `Review recorded: ${instantLabel(r.reviewedAt, timezone)} | Staff ${r.reviewedBy}`,
      "Patient identity, active order, allergies, medication, timing, and consent confirmed by reviewing staff.",
      `Allergies: ${r.allergyReview}`,
      `Clinical review: ${r.clinicalReview}`,
    ];
    const assessment = r.assessment;
    if (assessment?.screening.length) {
      const labels = {
        no_concern: "No concern recorded",
        concern: "CONCERN",
        not_applicable: "Not applicable",
      };
      for (const screen of assessment.screening)
        reviewLines.push(
          `${screen.label}: ${labels[screen.result]}${screen.detail ? ` — ${screen.detail}` : ""}`,
        );
    }
    sections.push({ heading: "Pre-administration review", lines: reviewLines });
    if (assessment?.providerCommunication) {
      const c = assessment.providerCommunication;
      sections.push({
        heading: "Provider communication",
        emphasis: c.decision !== "proceed_as_ordered",
        lines: [
          `${c.provider} | Contacted ${instantLabel(c.contactedAt, timezone)}`,
          `Decision: ${{ proceed_as_ordered: "Proceed as ordered", hold: "Hold", clarify: "Clarification requested" }[c.decision]}`,
          `Instructions: ${c.instructions}`,
          ...(c.reference ? [`Tebra / order reference: ${c.reference}`] : []),
        ],
      });
    }
    const v = r.vitals;
    const vitals = [
      v.bpSystolic === null ? "" : `BP ${v.bpSystolic}/${v.bpDiastolic} mmHg`,
      v.pulse === null ? "" : `Pulse ${v.pulse}/min`,
      v.temperatureC === null ? "" : `Temperature ${v.temperatureC} °C`,
      v.oxygenSaturation === null ? "" : `SpO₂ ${v.oxygenSaturation}%`,
    ].filter(Boolean);
    sections.push({
      heading: "Measurements & preparation",
      lines: [
        v.status === "recorded"
          ? `Vitals: ${vitals.join(" · ")}`
          : `Vitals not recorded: ${v.reason}`,
        ...(assessment?.weightKg != null
          ? [`Measured weight: ${assessment.weightKg} kg`]
          : []),
        ...(assessment?.needle
          ? [`Needle recorded at preparation: ${assessment.needle}`]
          : []),
        `Preparation: ${r.preparation}`,
        `Site assessment: ${r.siteAssessment}`,
        `Observation plan: ${r.observationPlan}`,
        ...(assessment?.education.length
          ? [
              `Education documented during review: ${assessment.education.join("; ")}`,
            ]
          : []),
      ],
    });
    sections.push({
      heading: a ? "Product traceability" : "Product reviewed / reserved",
      lines: [
        `NDC: ${med.ndc || "Not recorded"}`,
        `Lot: ${r.lotSnapshot.lotNumber} | Expires ${r.lotSnapshot.expiresOn}`,
        `Source: ${r.lotSnapshot.ownership} | Location: ${r.lotSnapshot.location} | Stock units: ${r.stockUnits}`,
      ],
    });
  }
  if (a) {
    const followUp = a.followUp;
    const lines = [
      `Actual administration / attempt: ${instantLabel(a.administeredAt, timezone)}`,
      `Administered / attempted by: ${a.administeredByName}`,
      `Recorded by staff: ${a.actorId} at ${instantLabel(a.recordedAt, timezone)}`,
      `Delivery: ${injectionOutcome(record)}`,
      `Actual dose: ${a.actualDose === null ? "Unknown" : `${a.actualDose} ${order.doseUnit}`}`,
      `Actual route: ${a.actualRoute ?? "Not separately recorded"} | Actual site: ${a.actualSite ?? "Not separately recorded"}`,
      `Tolerance / response recorded: ${a.tolerance}`,
      `Observation recorded: ${a.observation}`,
    ];
    if (a.delivery === "not_delivered")
      lines.push("Medication not delivered; no completed dose is recorded.");
    if (a.issueAction)
      lines.push(`Delivery issue / provider plan: ${a.issueAction}`);
    if (followUp?.observationOutcome) {
      const outcome = {
        completed: "Completed",
        declined: "Declined",
        not_required: "Not required per recorded plan",
        transferred: "Transferred for further care",
      }[followUp.observationOutcome];
      lines.push(`Observation disposition: ${outcome}`);
    }
    if (followUp?.observationMinutes != null)
      lines.push(
        `Observation duration recorded: ${followUp.observationMinutes} minutes`,
      );
    if (followUp?.observationNote)
      lines.push(`Observation details: ${followUp.observationNote}`);
    sections.push({
      heading: "Administration & response",
      lines,
      emphasis: a.delivery !== "complete",
    });
  } else if (record.disposition) {
    sections.push({
      heading: "Disposition",
      emphasis: true,
      lines: [
        `Medication not administered. ${record.disposition.reason}`,
        `Recorded: ${instantLabel(record.disposition.at, timezone)} | Staff ${record.disposition.actorId}`,
      ],
    });
  } else
    sections.push({
      heading: "Encounter status",
      lines: ["Administration has not been recorded."],
    });
  const followUpLines =
    a?.delivery === "complete"
      ? [
          `Provider-confirmed next date: ${order.nextDueOn ? calendarLabel(order.nextDueOn) : "To be confirmed in Tebra"}`,
        ]
      : [
          "Next-dose plan and date require confirmation in Tebra before further administration.",
        ];
  if (a?.followUp?.instructions)
    followUpLines.push(`Instructions recorded: ${a.followUp.instructions}`);
  if (a?.followUp?.educationProvided.length)
    followUpLines.push(
      `Education documented after encounter: ${a.followUp.educationProvided.join("; ")}`,
    );
  sections.push({ heading: "Follow-up", lines: followUpLines });
  for (const amendment of record.amendments)
    sections.push({
      heading: "Amendment",
      emphasis: true,
      lines: [
        `${instantLabel(amendment.createdAt, timezone)} | Staff ${amendment.actorId}`,
        `Reason: ${amendment.reason}`,
        amendment.text,
      ],
    });
  return {
    title: "Injection encounter",
    language: "en",
    identity: [
      `${p.displayName} | DOB ${p.dob} | Tebra #${p.tebraId}`,
      `Outcome: ${injectionOutcome(record)}${record.amendments.length ? " · Amendment appended" : ""}`,
    ],
    sections,
    footer: [
      `Console record ${record.id} · Version ${record.version} · Times: ${timezone}`,
      ...(r?.guidanceVersion
        ? [`Clinical reference version at review: ${r.guidanceVersion}`]
        : []),
      "Prepared from recorded encounter facts for staff review and filing in Tebra. This document is not a clinician signature.",
    ],
  };
}
export function injectionNote(
  record: InjectionCase,
  patient: Patient,
  product: Product,
  _lot: Lot | undefined,
  timezone: string,
): string {
  return documentText(buildInjectionNote(record, patient, product, timezone));
}
export function buildInjectionAvs(
  record: InjectionCase,
  patient: Patient,
  product: Product,
  timezone: string,
  language: "en" | "es" = "en",
): InjectionDocument {
  const {
    a,
    review,
    patient: p,
    product: med,
    order,
  } = encounterFacts(record, patient, product);
  const es = language === "es";
  const outcome = es
    ? {
        Administered: "Administrada",
        "Partial dose": "Dosis parcial",
        "Not delivered": "No administrada",
        "Administration error": "Error de administración",
        Held: "En espera",
        Cancelled: "Cancelada",
        Draft: "Borrador",
        "Ready to administer": "Pendiente",
      }[injectionOutcome(record)]
    : injectionOutcome(record);
  const today = [
    `${es ? "Medicamento" : "Medication"}: ${med.name} · ${med.strength}`,
    `${es ? "Resultado" : "Outcome"}: ${outcome}`,
  ];
  if (a) {
    today.push(
      `${es ? "Fecha y hora" : "Date and time"}: ${instantLabel(a.administeredAt, timezone, language)}`,
      `${es ? "Dosis recibida" : "Dose received"}: ${a.actualDose === null ? (es ? "No determinada" : "Unknown") : `${a.actualDose} ${order.doseUnit}`}`,
    );
    if (a.actualRoute || a.actualSite)
      today.push(
        `${es ? "Vía / sitio registrados" : "Recorded route / site"}: ${[a.actualRoute === "IM" ? (es ? "Intramuscular" : "Intramuscular") : a.actualRoute === "SC" ? (es ? "Subcutánea" : "Subcutaneous") : null, a.actualSite].filter(Boolean).join(" · ")}`,
      );
    if (a.delivery === "not_delivered")
      today.push(
        es ? "No se administró la inyección." : "The injection was not given.",
      );
  } else if (record.disposition)
    today.push(
      es ? "No se administró la inyección." : "The injection was not given.",
      record.disposition.reason,
    );
  else
    today.push(
      es
        ? "Este es un borrador. No se ha registrado una inyección administrada."
        : "This is a draft. An administered injection has not been recorded.",
    );
  const sections: InjectionDocumentSection[] = [
    { heading: es ? "En esta visita" : "At this visit", lines: today },
  ];
  const providerPlan =
    a?.issueAction ?? review?.assessment?.providerCommunication?.instructions;
  if (providerPlan)
    sections.push({
      heading: es
        ? "Plan registrado del profesional"
        : "Recorded provider plan",
      lines: [providerPlan],
      emphasis: true,
    });
  if (a?.delivery === "complete" && order.clinicalContext?.linkedPlan)
    sections.push({
      heading: es
        ? "Plan de tratamiento relacionado"
        : "Related treatment plan",
      lines: [order.clinicalContext.linkedPlan],
    });
  if (a?.followUp?.instructions)
    sections.push({
      heading: es
        ? "Instrucciones del equipo de atención"
        : "Instructions from your care team",
      lines: [a.followUp.instructions],
    });
  sections.push(
    a?.delivery === "complete"
      ? {
          heading: es ? "Próxima visita" : "Next visit",
          emphasis: true,
          lines: [
            order.nextDueOn
              ? calendarLabel(order.nextDueOn, language)
              : es
                ? "Confirme la fecha con la clínica."
                : "Confirm the date with the clinic.",
            es
              ? "La fecha indicada es la fecha prevista para su dosis. Confirme la cita con la clínica."
              : "This is the planned dose date. Confirm your appointment with the clinic.",
            es
              ? "Llame a la clínica si no puede asistir."
              : "Call the clinic if you cannot make your next visit.",
          ],
        }
      : {
          heading: es ? "Próximos pasos" : "Next steps",
          emphasis: true,
          lines: [
            es
              ? "Confirme el plan y la próxima fecha con la clínica antes de otra dosis."
              : "Confirm the plan and next date with the clinic before another dose.",
          ],
        },
  );
  const delivered =
    a &&
    (a.delivery === "complete" ||
      a.delivery === "partial" ||
      (a.delivery === "error" && a.actualDose !== null && a.actualDose > 0));
  if (delivered) {
    const guidance = getInjectionGuidance(med.name);
    const aftercare = guidance?.aftercare[language] ?? [];
    if (aftercare.length)
      sections.push({
        heading: es
          ? "Cuidados e indicaciones generales"
          : "General care & precautions",
        lines: [...aftercare],
      });
  }
  if (record.amendments.length)
    sections.push({
      heading: es ? "Confirme las instrucciones" : "Confirm your instructions",
      emphasis: true,
      lines: [
        es
          ? "El registro tiene una corrección. Confirme las instrucciones con el personal antes de salir."
          : "This record has an amendment. Confirm your instructions with staff before leaving.",
      ],
    });
  return {
    title: es ? "Resumen de su visita" : "Your visit summary",
    language,
    identity: [
      p.displayName,
      `${es ? "Fecha de nacimiento" : "Date of birth"}: ${calendarLabel(p.dob, language)}`,
    ],
    sections,
    footer: [
      es
        ? "Para una emergencia médica, llame al 911. Para otras preguntas, comuníquese con la clínica."
        : "For a medical emergency, call 911. For other questions, contact the clinic.",
      es
        ? "Inland Psychiatric Medical Group · Copia para el paciente"
        : "Inland Psychiatric Medical Group · Patient copy",
    ],
  };
}
export function injectionAvs(
  record: InjectionCase,
  patient: Patient,
  product: Product,
  timezone: string,
  language: "en" | "es" = "en",
) {
  return documentText(
    buildInjectionAvs(record, patient, product, timezone, language),
  );
}
