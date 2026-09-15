import type { Patient, Product } from "./contracts.js";
import type { InjectionCase } from "./injections.js";
import {
  buildWorkstationEncounter,
  evaluateWorkstationInjection,
  workstationOrderForRecord,
  workstationStateForRecord,
  workstationLocalDate,
} from "./workstation-bridge.js";
import { workstationOralComponentIssue } from "./workstation-contracts.js";
import { instantLabel } from "./injection-documentation.js";
import {
  injectionAdministrationReviewFingerprint,
  type InjectionEncounter,
} from "./workstation/domain/injection.js";
import { injectionEncounterToDocumentationInput } from "./workstation/documentation/adapters/injection-from-encounter.js";
import { formatInjectionDocumentation } from "./workstation/documentation/injection.js";
import { joinSectionBodies } from "./workstation/documentation/grammar.js";
import type { InjectionDocumentationResult } from "./workstation/documentation/types.js";
import {
  buildInjectionAvsModel,
  formatGutterDate,
  formatLongDate,
  formatShortDate,
  type InjectionAvsInput,
  type InjectionAvsModel,
} from "./workstation/domain/injection-avs-content.js";
import { workstationDocumentationEncounter } from "./workstation-clinical-policy.js";
import { INJECTION_MEDICATIONS } from "./workstation/domain/injection-catalog.js";
import { resolveProviderDisplay } from "./workstation/domain/provider-register.js";

const CLINIC_PHONE = "(909) 887-6222";
const text = (value: string | null | undefined) => value?.trim() ?? "";
const decisionLabels = {
  proceed_as_ordered: "Proceed as ordered",
  hold: "Hold",
  clarify: "Clarification requested",
};
const observationLabels = {
  completed: "Completed",
  declined: "Declined",
  not_required: "Not required per recorded plan",
  transferred: "Transferred for further care",
};
function facts(record: InjectionCase, patient: Patient, product: Product) {
  const administration = record.administration;
  const review =
    administration?.reviewSnapshot ??
    record.disposition?.reviewSnapshot ??
    record.review;
  return {
    administration,
    review,
    order: workstationOrderForRecord(record),
    state: workstationStateForRecord(record),
    patient: review?.patientSnapshot ?? patient,
    product: review?.productSnapshot ?? product,
  };
}
function wasDelivered(record: InjectionCase): boolean {
  const a = record.administration;
  return !!a && a.delivery !== "not_delivered" && a.actualDose !== 0;
}
function documentationEncounter(
  record: InjectionCase,
  patient: Patient,
  product: Product,
  timezone: string,
  pairedCase?: InjectionCase,
): InjectionEncounter {
  const order = workstationOrderForRecord(record);
  const state = workstationStateForRecord(record);
  const encounter = workstationDocumentationEncounter(
    buildWorkstationEncounter(record, patient, product, timezone, pairedCase),
    {
      today: order.plannedOn,
      indication: order.clinicalContext?.indication,
      priorMaintenanceDoses: state?.priorMaintenanceDoses,
      priorDose: order.clinicalContext?.priorDose,
      priorProduct: order.clinicalContext?.priorProduct,
    },
  );
  const a = record.administration;
  if (a) {
    // Historical omissions are unknown actual facts; the active order does not
    // prove where or by which route an already-recorded injection was given.
    encounter.route = a.actualRoute === "SC" ? "SubQ" : (a.actualRoute ?? "");
    encounter.site = a.actualSite ? encounter.site : "";
    encounter.dose =
      a.actualDose === null
        ? "amount unknown"
        : `${a.actualDose} ${a.orderSnapshot.doseUnit}`;
    if (a.delivery !== "complete") encounter.nextDoseDate = "";
    if (!wasDelivered(record))
      encounter.disposition = {
        kind: "held",
        outcome: "Medication not delivered; administration attempt recorded.",
      };
    else {
      // This signature exists only in a rendering clone of a persisted receipt.
      // It never updates a review, stock ledger, or prospective readiness gate.
      encounter.disposition = {
        kind: "administered",
        reviewedBy: a.actorId,
        reviewedAt: a.recordedAt,
        reviewFingerprint: injectionAdministrationReviewFingerprint(encounter),
      };
    }
  }
  return encounter;
}
function addUnique(
  body: string,
  label: string,
  value: string | null | undefined,
): string {
  const content = text(value);
  if (!content || body.includes(content)) return body;
  return [body, `${label}: ${content}`].filter(Boolean).join("\n\n");
}
function assembled(
  cc: string,
  assessment: string,
  plan: string,
): InjectionDocumentationResult {
  const all = joinSectionBodies([cc, assessment, plan]);
  return {
    workflow: "injection",
    cc,
    assessment,
    plan,
    all,
    text: all,
    sections: [
      { id: "cc", label: "CC", destination: "CC", content: cc },
      {
        id: "assessment",
        label: "Assessment",
        destination: "Assessment",
        content: assessment,
      },
      { id: "plan", label: "Plan", destination: "Plan", content: plan },
    ],
  };
}

/** Original Tebra prose, augmented only where the console carries additional
 * recorded facts. Persisted errors remain chartable even when they would fail
 * today's prospective engine checks. No clinical clearance is inferred. */
export function getWorkstationNote(
  record: InjectionCase,
  patient: Patient,
  product: Product,
  timezone: string,
  pairedCase?: InjectionCase,
): InjectionDocumentationResult {
  const f = facts(record, patient, product);
  const a = f.administration;
  const encounter = documentationEncounter(
    record,
    patient,
    product,
    timezone,
    pairedCase,
  );
  const evaluation = evaluateWorkstationInjection(
    record,
    patient,
    product,
    timezone,
    pairedCase,
  );
  const renderingEvaluation =
    a && wasDelivered(record)
      ? {
          ...evaluation,
          readiness: "ready" as const,
          output: { ...evaluation.output, administrationDocumented: true },
        }
      : evaluation;
  let input = injectionEncounterToDocumentationInput(
    encounter,
    renderingEvaluation,
  );
  if (!input) {
    input = {
      chiefComplaint: {
        summary: a
          ? `${f.product.name} injection encounter.`
          : `${f.product.name} injection encounter — administration has not been recorded.`,
      },
      ...(record.disposition || a?.delivery === "not_delivered"
        ? {
            disposition: {
              kind: "held" as const,
              reason: record.disposition?.reason ?? "Medication not delivered.",
            },
          }
        : {}),
    };
  }
  if (a && input.noteFacts) {
    const noteFacts = input.noteFacts;
    if (
      a.delivery !== "complete" ||
      a.actualDose === null ||
      !a.actualRoute ||
      !a.actualSite
    ) {
      const outcome =
        a.delivery === "partial"
          ? "Partial injection"
          : a.delivery === "error"
            ? "Injection administration error"
            : "Injection";
      noteFacts.headline = `${outcome} — ${f.product.name}; actual dose ${a.actualDose === null ? "unknown" : `${a.actualDose} ${f.order.doseUnit}`}.`;
      noteFacts.administration = `${f.product.name}; actual dose ${a.actualDose === null ? "unknown" : `${a.actualDose} ${f.order.doseUnit}`}; actual route ${a.actualRoute ?? "not separately recorded"}; actual site ${a.actualSite ?? "not separately recorded"}.`;
      if (a.delivery !== "complete")
        noteFacts.followUp =
          "Next-dose plan requires provider confirmation before another dose.";
    }
    // Structured observation outcome never implies an uncomplicated response.
    if (
      a.followUp?.observationOutcome &&
      a.followUp.observationOutcome !== "completed"
    )
      noteFacts.observation = undefined;
  }
  // A protocol's historic assumed oral dose must not override the explicitly
  // recorded product/dose/status now carried by the console.
  const oral = f.state?.oral;
  if (input.initiation && oral) {
    input.initiation.oralDose = `${oral.product} ${oral.dose} — ${oral.status === "administered" && oral.administeredAt ? `administered ${instantLabel(oral.administeredAt, timezone)}` : "verified in the referenced record; administration here not recorded"}`;
    input.initiation.oralPlan = `Source: ${oral.source}${oral.startOn ? `; start ${oral.startOn}` : ""}${oral.endOn ? `; end ${oral.endOn}` : ""}`;
  } else if (input.initiation) {
    input.initiation.oralDose = undefined;
    if (/oral continuation/.test(input.initiation.oralPlan ?? ""))
      input.initiation.oralPlan = undefined;
  }
  const note = formatInjectionDocumentation(input);
  let assessment = note.assessment;
  let plan = note.plan;
  const r = f.review;
  if (r) {
    assessment = addUnique(assessment, "Clinical review", r.clinicalReview);
    assessment = addUnique(assessment, "Product preparation", r.preparation);
    assessment = addUnique(assessment, "Site assessment", r.siteAssessment);
    if (r.vitals.status === "not_recorded")
      assessment = addUnique(
        assessment,
        "Vitals not recorded",
        r.vitals.reason,
      );
    if (r.vitals.oxygenSaturation !== null)
      assessment = addUnique(
        assessment,
        "SpO₂",
        `${r.vitals.oxygenSaturation}%`,
      );
    if (r.assessment?.weightKg != null)
      assessment = addUnique(
        assessment,
        "Measured weight",
        `${r.assessment.weightKg} kg`,
      );
    if (r.assessment?.needle)
      assessment = addUnique(
        assessment,
        "Needle recorded at preparation",
        r.assessment.needle,
      );
    for (const screening of r.assessment?.screening ?? []) {
      if (screening.result !== "no_concern" || screening.detail)
        assessment = addUnique(
          assessment,
          screening.label,
          `${screening.result === "concern" ? "Concern" : screening.result === "not_applicable" ? "Not applicable" : "No concern recorded"}${screening.detail ? ` — ${screening.detail}` : ""}`,
        );
    }
    const c = r.assessment?.providerCommunication;
    if (c)
      assessment = addUnique(
        assessment,
        "Provider communication",
        `${c.provider}; contacted ${instantLabel(c.contactedAt, timezone)}; ${decisionLabels[c.decision]}. ${c.instructions} Reference: ${c.reference}.`,
      );
    if (r.assessment?.education.length)
      assessment = addUnique(
        assessment,
        "Education documented during review",
        r.assessment.education.join("; "),
      );
    assessment = addUnique(assessment, "Observation plan", r.observationPlan);
  }
  // Review snapshots can predate administration, so routine post-event fields
  // were legitimately deferred then. Suppress only findings now resolved by
  // the frozen receipt; genuine clinical discrepancies remain in the note.
  const resolvedReviewCodes = new Set<string>();
  if (a) {
    resolvedReviewCodes.add("disposition.required");
    if (a.administeredByName.trim())
      resolvedReviewCodes.add("administration.staff");
    if (a.administeredAt && Number.isFinite(Date.parse(a.administeredAt)))
      resolvedReviewCodes.add("administration.time");
    if (a.tolerance.trim() || f.state?.response.kind)
      resolvedReviewCodes.add("response.required");
    if (encounter.initiation?.second.given)
      resolvedReviewCodes.add("initiation.second.given");
    if (encounter.secondAdministrationTime)
      resolvedReviewCodes.add("administration.second-time");
    const pair = a.pairedCaseSnapshot ?? a.reviewSnapshot.pairedCaseSnapshot;
    if (pair?.review || pair?.administration?.reviewSnapshot)
      resolvedReviewCodes.add("workstation.paired-review-pending");
  }
  const reviewFindings = r?.engineFindings?.filter(
    (finding) => !resolvedReviewCodes.has(finding.code),
  );
  if (reviewFindings?.length)
    assessment = addUnique(
      assessment,
      "Review findings at documentation",
      reviewFindings.map((finding) => finding.message).join(" "),
    );
  const context = f.order.clinicalContext;
  if (context?.historySource)
    assessment = addUnique(
      assessment,
      "Prior-dose history source",
      context.historySource,
    );
  if (context?.priorProduct || context?.priorDose)
    assessment = addUnique(
      assessment,
      "Previous regimen",
      [context.priorProduct, context.priorDose].filter(Boolean).join(" "),
    );
  if (context?.linkedPlan)
    assessment = addUnique(
      assessment,
      "Linked treatment plan",
      context.linkedPlan,
    );
  if (context?.indication)
    assessment = addUnique(
      assessment,
      "Indication from order",
      context.indication,
    );
  if (a) {
    if (f.state?.recordingMode === "retrospective") {
      assessment = addUnique(
        assessment,
        "Retrospective documentation",
        `Actual event ${instantLabel(a.administeredAt, timezone)}; recorded ${instantLabel(a.recordedAt, timezone)} by ${a.actorId}. Reason: ${f.state.retrospectiveReason || "Not recorded"}.`,
      );
      if (r)
        assessment = addUnique(
          assessment,
          "Review recorded after the event",
          `${instantLabel(r.reviewedAt, timezone)}; this later review does not establish pre-dose clearance.`,
        );
    }
    if (!wasDelivered(record)) {
      plan = addUnique(
        plan,
        "Administration attempt",
        `Medication not delivered. ${f.product.name}; actual dose ${a.actualDose === null ? "unknown" : `${a.actualDose} ${f.order.doseUnit}`}; ${instantLabel(a.administeredAt, timezone)}; attempted by ${a.administeredByName}.`,
      );
    }
    if (a.delivery !== "complete") {
      plan = addUnique(
        plan,
        "Delivery outcome",
        a.delivery.replaceAll("_", " "),
      );
      plan = addUnique(
        plan,
        "Ordered dose / route / site",
        `${f.order.dose} ${f.order.doseUnit} / ${f.order.route} / ${f.order.site}`,
      );
    }
    plan = addUnique(plan, "Response recorded", a.tolerance);
    plan = addUnique(plan, "Observation recorded", a.observation);
    plan = addUnique(plan, "Delivery issue / provider plan", a.issueAction);
    const followUp = a.followUp;
    if (followUp?.observationOutcome)
      plan = addUnique(
        plan,
        "Observation disposition",
        observationLabels[followUp.observationOutcome],
      );
    if (followUp?.observationMinutes != null)
      plan = addUnique(
        plan,
        "Observation duration",
        `${followUp.observationMinutes} minutes`,
      );
    plan = addUnique(plan, "Observation details", followUp?.observationNote);
    plan = addUnique(plan, "Follow-up instructions", followUp?.instructions);
    if (followUp?.educationProvided.length)
      plan = addUnique(
        plan,
        "Education documented after encounter",
        followUp.educationProvided.join("; "),
      );
    if (a.engineFindings?.length)
      assessment = addUnique(
        assessment,
        "Recorded review issues",
        a.engineFindings.map((finding) => finding.message).join(" "),
      );
    if (evaluation.stops.length)
      assessment = addUnique(
        assessment,
        "Review notice",
        `Persisted administration is documented as recorded; current engine checks are unresolved: ${evaluation.stops.map((stop) => stop.message).join(" ")}`,
      );
  }
  for (const amendment of record.amendments)
    plan = addUnique(
      plan,
      `Amendment ${instantLabel(amendment.createdAt, timezone)} — ${amendment.actorId}`,
      `Reason: ${amendment.reason}. ${amendment.text}`,
    );
  return assembled(note.cc, assessment, plan);
}

function addAvsBlock(
  model: InjectionAvsModel,
  heading: string,
  paragraphs: Array<string | null | undefined>,
  emphasis = false,
) {
  const content = paragraphs.map(text).filter(Boolean);
  if (content.length)
    model.blocks.push({
      kind: emphasis ? "critical-alert" : "medication-reminder",
      heading,
      paragraphs: content,
      ...(emphasis ? { emphasis: true } : {}),
    });
}
function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(value.getTime())) return "";
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function setNextDate(
  model: InjectionAvsModel,
  date: string,
  administrationDate: string,
) {
  const long = date ? formatLongDate(date) : "";
  model.nextDose.dateLong = long;
  model.nextDose.instruction = long
    ? "Due date - call us to schedule or reschedule"
    : "Call the clinic to confirm your next-dose plan";
  if (!long)
    model.nextDose.notes = [
      `Your next-dose plan needs confirmation. Call ${CLINIC_PHONE} before another dose.`,
    ];
  for (const step of model.timeline)
    if (step.state === "due") {
      step.when = date ? formatGutterDate(date, administrationDate) : "";
      step.whenNote = date ? "Next" : "";
      step.dateLong = long;
      step.detail = [...model.nextDose.notes];
    }
  for (const row of model.schedule)
    if (row.due) row.date = date ? formatShortDate(date) : "To be confirmed";
}

/** The original English patient instructions with narrowly isolated corrections
 * for audited labeling and truthful receipt semantics. The Lightfully layer
 * changes presentation, not these clinical facts. */
export function getWorkstationAvsModel(
  record: InjectionCase,
  patient: Patient,
  product: Product,
  timezone: string,
  pairedCase?: InjectionCase,
): InjectionAvsModel {
  const f = facts(record, patient, product);
  const a = f.administration;
  const encounter = documentationEncounter(
    record,
    patient,
    product,
    timezone,
    pairedCase,
  );
  const complete =
    !!a &&
    a.delivery === "complete" &&
    a.actualDose !== null &&
    wasDelivered(record);
  const delivered = wasDelivered(record);
  const oral = f.state?.oral;
  const oralGiven =
    !!oral &&
    oral.status === "administered" &&
    !!oral.administeredAt &&
    workstationLocalDate(oral.administeredAt, timezone) ===
      encounter.administrationDate;
  const protocol = f.state?.initiation.protocol ?? "";
  const dual = [
    "maintena-1day",
    "asimtufii-1day",
    "aristada-initio-sameday",
  ].includes(protocol);
  const overlap = [
    "maintena-14day",
    "asimtufii-14day",
    "aristada-21day",
  ].includes(protocol);
  const second = encounter.initiation?.second;
  const pairedGiven = !!second?.given;
  const oralDays = protocol === "aristada-21day" ? 21 : 14;
  const verifiedOverlap =
    !!oral &&
    oral.startOn === encounter.administrationDate &&
    oral.endOn === shiftDate(encounter.administrationDate, oralDays - 1);
  const safeProtocol =
    complete &&
    f.state?.initiation.planVerified &&
    (!dual ||
      (pairedGiven &&
        oralGiven &&
        !workstationOralComponentIssue(
          f.state,
          encounter.administrationDate,
          timezone,
        ))) &&
    (!overlap || verifiedOverlap)
      ? protocol
      : "";
  const input: InjectionAvsInput = {
    patientName: f.patient.displayName,
    patientDob: f.patient.dob,
    recordNumber: f.patient.tebraId || record.id,
    orderingProvider: resolveProviderDisplay(f.order.orderingProvider),
    administeredBy: a?.administeredByName ?? "",
    medicationKey: encounter.medicationKey,
    medicationName: f.product.name,
    genericName: encounter.medicationKey
      ? (INJECTION_MEDICATIONS[encounter.medicationKey]?.generic ?? "")
      : "",
    dose: a
      ? a.actualDose === null
        ? "amount unknown"
        : `${a.actualDose} ${f.order.doseUnit}`
      : "",
    route: encounter.route,
    site: encounter.site,
    intervalKey: encounter.intervalKey,
    administrationDate: encounter.administrationDate,
    administrationTime: encounter.administrationTime ?? "",
    nextDoseDate: complete ? (f.order.nextDueOn ?? "") : "",
    lot: f.review?.lotSnapshot.lotNumber ?? "",
    expiration: f.review?.lotSnapshot.expiresOn.slice(0, 7) ?? "",
    responseLabel: a?.tolerance ?? "",
    reason: encounter.reason,
    initiationProtocol: safeProtocol,
    day1Date: f.state?.initiation.day1Date ?? "",
    clinicPhone: CLINIC_PHONE,
    dispositionKind: delivered ? "administered" : "held",
    secondDose: second?.dose,
    secondSite: second?.site,
    secondLot: second?.lot,
    secondExpiration: second?.expiration,
    secondGiven: pairedGiven && delivered,
    oralStatus: oralGiven ? "administered" : "",
  };
  const model = buildInjectionAvsModel(input);
  // Preserve explicit provider dates. The baseline Day 1 builder otherwise
  // silently replaces even a verified due date with its own day-eight target.
  setNextDate(
    model,
    complete ? (f.order.nextDueOn ?? "") : "",
    encounter.administrationDate,
  );
  if (encounter.medicationKey === "sustenna" && a?.actualDose === 234)
    model.administrationNote = "";
  if (safeProtocol === "sustenna-day1") {
    const ongoing =
      "The first regular monthly injection is usually due five weeks after the first starting injection, regardless of when the second starting injection is given. Follow the date confirmed by your provider.";
    model.scheduleNote = ongoing;
    for (const step of model.timeline)
      if (step.state === "ongoing") step.detail = [ongoing];
    const block = model.blocks.find(
      (block) => block.heading === "Why the second starting injection matters",
    );
    if (block)
      block.paragraphs = [
        "The first two injections work together as the starting treatment. Keep the date your care team confirmed for the second injection.",
        `If you miss the second starting injection, call ${CLINIC_PHONE}. Your provider will choose the next steps based on how much time has passed; do not restart or repeat a dose yourself.`,
        "Both starting injections are given in the arm. Tell the care team which arm was used for the first injection.",
      ];
  }
  if (dual && pairedGiven) {
    const pair =
      record.administration?.pairedCaseSnapshot ??
      record.administration?.reviewSnapshot.pairedCaseSnapshot;
    const pairName = pair?.administration?.reviewSnapshot.productSnapshot.name;
    if (pairName)
      for (const step of model.timeline)
        if (step.state === "given")
          step.detail = step.detail.map((line) =>
            line.startsWith("Second injection:")
              ? line.replace(
                  "Second injection:",
                  `Second injection: ${pairName},`,
                )
              : line,
          );
  }
  if (!safeProtocol && complete && protocol) {
    model.documentSubtitle = "Provider-directed starting plan";
    addAvsBlock(model, "Your starting treatment plan", [
      "Follow the starting plan confirmed by your provider. This record does not establish that every starting component has been completed.",
      f.state?.initiation.providerNote,
      f.order.clinicalContext?.linkedPlan,
    ]);
  }
  if (oral)
    addAvsBlock(model, "Your recorded oral medication", [
      `${oral.product} ${oral.dose}. ${oral.status === "administered" && oral.administeredAt ? `Recorded as given ${instantLabel(oral.administeredAt, timezone)}.` : "Plan verified in the referenced record; an oral dose is not recorded as given here."}`,
      oral.startOn
        ? `Recorded start date: ${formatLongDate(oral.startOn)}.`
        : "",
      oral.endOn ? `Recorded end date: ${formatLongDate(oral.endOn)}.` : "",
      "Follow your provider's instructions. This record does not confirm doses taken on other days.",
    ]);
  if (!a && !record.disposition) {
    model.documentStatus = "STAFF PREVIEW - NOT FINAL";
    model.documentSubtitle = "Administration has not been recorded";
    const step = model.timeline[0];
    if (step) {
      step.title = "Administration has not been recorded";
      step.detail = [
        "This is a staff preview. Your care team will confirm the completed treatment and next steps.",
      ];
    }
  } else if (!delivered) {
    model.documentStatus = "CARE HANDOFF";
    model.documentSubtitle = a
      ? "Medication not delivered"
      : record.status === "cancelled"
        ? "Injection cancelled"
        : "Injection held";
    addAvsBlock(
      model,
      "What happens next",
      [record.disposition?.reason, a?.issueAction],
      true,
    );
  } else if (!complete) {
    model.documentStatus = "CARE HANDOFF";
    model.documentSubtitle =
      a?.delivery === "partial"
        ? "Partial injection — follow-up needed"
        : a?.delivery === "error"
          ? "Injection administration error — follow-up needed"
          : "Administration details require review";
    model.administrationNote = "";
    addAvsBlock(
      model,
      "Your injection needs follow-up",
      [
        `Actual amount received: ${a!.actualDose === null ? "unknown" : `${a!.actualDose} ${f.order.doseUnit}`}.`,
        a!.issueAction,
        "Confirm the next-dose plan with the clinic before another injection. Do not repeat or replace the dose on your own.",
      ],
      true,
    );
  }
  if (a) {
    addAvsBlock(model, "Your recorded response and follow-up", [
      a.tolerance ? `Response recorded: ${a.tolerance}` : "",
      a.observation ? `Observation recorded: ${a.observation}` : "",
      a.followUp?.observationOutcome
        ? `Observation: ${observationLabels[a.followUp.observationOutcome]}${a.followUp.observationMinutes != null ? `; ${a.followUp.observationMinutes} minutes` : ""}.`
        : "",
      a.followUp?.observationNote,
      a.followUp?.instructions,
      ...(a.followUp?.educationProvided ?? []),
    ]);
  }
  return model;
}
