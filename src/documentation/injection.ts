import {
  ALERT,
  ARROW,
  INDENT,
  block,
  bullets,
  cleanText,
  documentationContribution,
  joinBlocks,
  joinSectionBodies,
  labeledNarrative,
  noteLines,
  nonEmpty,
  row,
} from "./grammar";
import type {
  DocumentationEvaluation,
  DocumentationSection,
  InjectionComponent,
  InjectionDisposition,
  InjectionDocumentationInput,
  InjectionDocumentationResult,
  InjectionInitiationProtocol,
  InjectionVitals,
} from "./types";

const dispositionLabels: Record<InjectionDisposition["kind"], string> = {
  administered: "Administered",
  held: "Held",
  escalated: "Escalated",
  "provider-directed": "Provider-directed plan",
};

const protocolLabels: Record<InjectionInitiationProtocol["kind"], string> = {
  "aripiprazole-two-injection":
    "Aripiprazole one-day initiation · two separate injections",
  "sustenna-day-8": "Invega Sustenna Day 8 initiation",
  "oral-overlap": "Ordered oral initiation / overlap",
  "provider-directed": "Provider-directed initiation / re-initiation",
};

const indentedRow = (label: string, value: unknown): string => {
  const content = row(label, value);
  return content ? `  ${content}` : "";
};

const componentName = (component: InjectionComponent): string =>
  cleanText(component.label) || cleanText(component.medication);

const componentLead = (
  component: InjectionComponent,
  index: number,
  total: number,
): string => {
  const name = componentName(component);
  if (total > 1) {
    return `${ARROW} Component ${index + 1}${name ? `: ${name}` : ""}`;
  }
  return `${ARROW} ${name || "Injection component"}`;
};

const componentAdministrationLines = (
  component: InjectionComponent,
  index: number,
  total: number,
): string[] =>
  noteLines([
    componentLead(component, index, total),
    indentedRow("Medication", component.medication),
    indentedRow("Dose", component.dose),
    indentedRow("Route", component.route),
    indentedRow("Site", component.site),
    indentedRow("Administration date", component.administrationDate),
    indentedRow("Actual administration time", component.administrationTime),
    indentedRow("Administered by", component.administeredBy),
    indentedRow("Administration amount", component.amount),
    indentedRow("Delivery device", component.device),
    indentedRow("Site condition", component.siteCondition),
    indentedRow("Response", component.response),
  ]);

const hasTraceability = (component: InjectionComponent): boolean =>
  Boolean(
    cleanText(component.ndc) ||
      cleanText(component.lot) ||
      cleanText(component.expiration) ||
      cleanText(component.quantity) ||
      cleanText(component.source) ||
      cleanText(component.preparation),
  );

const componentTraceabilityLines = (
  component: InjectionComponent,
  index: number,
  total: number,
): string[] => {
  if (!hasTraceability(component)) return [];
  return noteLines([
    componentLead(component, index, total),
    indentedRow("Medication", component.medication),
    indentedRow("Dose", component.dose),
    indentedRow("NDC / product code", component.ndc),
    indentedRow("Lot", component.lot),
    indentedRow("Expiration", component.expiration),
    indentedRow("Quantity / package", component.quantity),
    indentedRow("Product source", component.source),
    indentedRow("Preparation / reconstitution", component.preparation),
  ]);
};

const formatVitals = (vitals?: InjectionVitals): string => {
  if (!vitals) return "";
  const parts = nonEmpty([
    vitals.bloodPressure ? `BP ${cleanText(vitals.bloodPressure)}` : "",
    vitals.heartRate ? `HR ${cleanText(vitals.heartRate)}` : "",
    vitals.temperature ? `Temp ${cleanText(vitals.temperature)}` : "",
    vitals.weight ? `Weight ${cleanText(vitals.weight)}` : "",
  ]);
  return parts.length ? `Vitals: ${parts.join(" · ")}` : "";
};

const formatChiefComplaint = (
  input: InjectionDocumentationInput,
  extra: string[],
): string => {
  const chief = input.chiefComplaint;
  const components = input.components ?? [];
  const firstMedication = components.find((item) =>
    Boolean(cleanText(item.medication)),
  )?.medication;
  const disposition = input.disposition?.kind;
  const fallbackSummary =
    disposition && disposition !== "administered"
      ? "Injection encounter — medication not administered."
      : firstMedication
        ? `${cleanText(firstMedication)} injection encounter.`
        : "Injection encounter.";
  const summary = cleanText(chief?.summary) || fallbackSummary;
  const details = nonEmpty([
    row("Visit", chief?.visitType),
    row("Purpose", chief?.purpose),
    row("Encounter date", chief?.encounterDate),
    ...bullets(chief?.context),
    ...extra,
  ]);
  return details.length ? `${summary}\n\n${details.join("\n")}` : summary;
};

const formatAssessment = (
  input: InjectionDocumentationInput,
  extra: string[],
): string => {
  const review = input.preAdministration;
  const reviewBlock = block("Pre-administration review", [
    row("Active-order purpose / encounter context", review?.orderPurpose),
    row("Order verification", review?.orderVerification),
    row("Previous dose date", review?.previousDoseDate),
    row("Previous injection site", review?.previousSite),
    row("Timing review", review?.timingReview),
    row("Allergies", review?.allergiesReview),
    formatVitals(review?.vitals),
    ...bullets(review?.reviewItems),
  ]);
  const attentionBlock = block(
    "Clinician attention",
    (review?.clinicianAttention ?? []).map((item) => `${ALERT} ${cleanText(item)}`),
  );
  const engineBlock = block("Clinical review", bullets(extra));
  return joinBlocks([reviewBlock, attentionBlock, engineBlock]);
};

const formatInitiation = (
  protocol: InjectionInitiationProtocol | undefined,
): string => {
  if (!protocol) return "";
  const window =
    cleanText(protocol.windowStart) && cleanText(protocol.windowEnd)
      ? `${cleanText(protocol.windowStart)} ${ARROW} ${cleanText(protocol.windowEnd)}`
      : cleanText(protocol.windowStart) || cleanText(protocol.windowEnd);
  return block("Initiation protocol", [
    row("Protocol", protocol.label || protocolLabels[protocol.kind]),
    row("Order verification", protocol.orderVerification),
    row("Ordered oral dose", protocol.oralDose),
    ...labeledNarrative("Ordered oral plan", protocol.oralPlan),
    row("Day 1 administration date", protocol.day1Date),
    row("Day 8 target", protocol.day8TargetDate),
    row("Permitted window", window),
    row(
      "Scheduled / administered date",
      protocol.scheduledOrAdministeredDate,
    ),
    row("Timing review", protocol.timingReview),
    ...bullets(protocol.notes),
  ]);
};

const formatTraceability = (components: InjectionComponent[]): string => {
  const traceLines = components.flatMap((component, index) =>
    componentTraceabilityLines(component, index, components.length),
  );
  return block("Product traceability", traceLines);
};

const formatHandling = (
  input: InjectionDocumentationInput,
): string => {
  const handling = input.handling;
  const waste = cleanText(handling?.waste);
  const witness = cleanText(handling?.wasteWitness);
  const wasteDetail = nonEmpty([
    waste ? `Amount: ${waste}` : "",
    witness ? `Witness: ${witness}` : "",
  ]).join(" · ");
  return block("Product handling", [
    row("Product source", handling?.source),
    ...labeledNarrative(
      "Preparation / reconstitution",
      handling?.preparation,
    ),
    row("Medication waste", wasteDetail),
  ]);
};

const formatProductIssue = (
  input: InjectionDocumentationInput,
): string =>
  block("Product / device issue", [
    ...labeledNarrative("Issue", input.handling?.productIssue),
    ...labeledNarrative(
      "Action / disposition",
      input.handling?.productIssueAction,
    ),
    row("Notification recipient", input.handling?.productIssueNotified),
    row(
      "Notification / decision time",
      input.handling?.productIssueNotificationTime,
    ),
    ...labeledNarrative(
      "Direction received",
      input.handling?.productIssueDirection,
    ),
    ...labeledNarrative("Next step", input.handling?.productIssueNextStep),
  ]);

const formatException = (
  input: InjectionDocumentationInput,
): string => {
  const exception = input.exception;
  return block("Exception / escalation", [
    ...labeledNarrative("Event", exception?.summary),
    row("Notification", exception?.notified),
    row("Notification / decision time", exception?.notificationTime),
    ...labeledNarrative("Direction / action", exception?.direction),
    ...labeledNarrative("Next step", exception?.nextStep),
  ]);
};

const formatFollowUp = (
  input: InjectionDocumentationInput,
): string => {
  const followUp = input.followUp;
  return block("Follow-up", [
    row("Next dose due", followUp?.nextDoseDate),
    row("Timing window", followUp?.timingWindow),
    row("Ordering provider", followUp?.orderingProvider),
    row("Appointment status", followUp?.appointmentStatus),
    ...bullets(followUp?.education),
    ...bullets(followUp?.returnInstructions),
  ]);
};

const formatDisposition = (disposition?: InjectionDisposition): string => {
  if (!disposition || disposition.kind === "administered") return "";
  return block("Disposition — medication not administered", [
    row("Disposition", disposition.label || dispositionLabels[disposition.kind]),
    ...labeledNarrative("Reason", disposition.reason),
    row("Provider / recipient notified", disposition.notified),
    row("Contact / decision time", disposition.decisionTime),
    ...labeledNarrative("Direction / outcome", disposition.direction),
    ...labeledNarrative("Next step", disposition.nextStep),
  ]);
};

const formatIdentifiedProduct = (
  components: InjectionComponent[],
): string => {
  const lines = components.flatMap((component, index) => {
    const hasProduct = Boolean(
      cleanText(component.medication) ||
        cleanText(component.dose) ||
        hasTraceability(component),
    );
    if (!hasProduct) return [];
    return noteLines([
      componentLead(component, index, components.length),
      indentedRow("Medication", component.medication),
      indentedRow("Dose", component.dose),
      indentedRow("NDC / product code", component.ndc),
      indentedRow("Lot", component.lot),
      indentedRow("Expiration", component.expiration),
      indentedRow("Product source", component.source),
    ]);
  });
  return block("Product identification", lines);
};

const section = (
  id: string,
  label: string,
  destination: DocumentationSection["destination"],
  content: string,
): DocumentationSection => ({ id, label, destination, content });

export const formatInjectionDocumentation = (
  input: InjectionDocumentationInput,
  evaluation?: DocumentationEvaluation,
): InjectionDocumentationResult => {
  const contribution = documentationContribution(evaluation);
  const components = (input.components ?? []).filter(
    (component) => component && typeof component === "object",
  );
  const administered = input.disposition?.kind === "administered";

  const cc = formatChiefComplaint(input, contribution.cc ?? []);
  const assessment = formatAssessment(input, contribution.assessment ?? []);

  const administrationBlock = administered
    ? block(
        "Medication administration",
        components.flatMap((component, index) =>
          componentAdministrationLines(component, index, components.length),
        ),
      )
    : "";
  const plan = administered
    ? joinBlocks([
        administrationBlock,
        formatInitiation(input.initiation),
        formatTraceability(components),
        formatHandling(input),
        formatProductIssue(input),
        formatException(input),
        formatFollowUp(input),
        block("Clinical plan", bullets(contribution.plan)),
      ])
    : joinBlocks([
        formatDisposition(input.disposition),
        formatIdentifiedProduct(components),
        formatInitiation(input.initiation),
        formatHandling(input),
        formatProductIssue(input),
        formatException(input),
        formatFollowUp(input),
        block("Clinical plan", bullets(contribution.plan)),
      ]);

  const sections = [
    section("cc", "CC", "CC", cc),
    section("assessment", "Assessment", "Assessment", assessment),
    section("plan", "Plan", "Plan", plan),
  ];
  const all = joinSectionBodies([cc, assessment, plan]);

  return {
    workflow: "injection",
    sections,
    text: all,
    cc,
    assessment,
    plan,
    all,
  };
};
