import {
  buildInjectionPatientScreenDocument,
  canBuildInjectionPatientScreenDocument,
  type InjectionEncounter,
  type InjectionPatientScreenDocument,
  type InjectionPatientScreenItem,
  type PatientScreenLanguage,
} from "../../../domain";

export const INJECTION_PATIENT_SCREEN_PRINT_CLASS = "print-inj-patient-screen";
export const INJECTION_PATIENT_SCREEN_SHEET_ID = "injPatientScreenSheet";

/**
 * Patient screening is live by default. An explicit false remains available as
 * an operational kill switch without leaving a caller able to bypass it.
 */
export const isInjectionPatientScreeningEnabled = (
  value: string | undefined,
): boolean => value !== "false";

export const INJECTION_PATIENT_SCREENING_ENABLED = isInjectionPatientScreeningEnabled(
  import.meta.env.VITE_ENABLE_INJECTION_PATIENT_SCREENING,
);

declare global {
  interface Window {
    __IPMG_INJECTION_PATIENT_SCREENING_ENABLED__?: boolean;
    cleanPrintClasses?: () => void;
  }
}

// The legacy print hardener owns final print-root isolation. Publishing the
// enabled value also lets its plain-JS choke point honor the operational kill
// switch if a caller bypasses the Preact button.
if (typeof window !== "undefined") {
  window.__IPMG_INJECTION_PATIENT_SCREENING_ENABLED__ = INJECTION_PATIENT_SCREENING_ENABLED;
}

const element = <Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[Tag] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const appendInfoPair = (root: HTMLElement, label: string, value: string): void => {
  const pair = element("span", "ips-info-pair");
  pair.append(element("strong", undefined, `${label}:`), document.createTextNode(` ${value}`));
  root.append(pair);
};

const addInfoLine = (
  root: HTMLElement,
  left: { label: string; value: string },
  right: { label: string; value: string },
): void => {
  const line = element("div", "ips-info-line");
  appendInfoPair(line, left.label, left.value);
  appendInfoPair(line, right.label, right.value);
  root.append(line);
};

const addQuestion = (
  root: HTMLElement,
  number: number,
  item: InjectionPatientScreenItem,
  labels: InjectionPatientScreenDocument["labels"],
): void => {
  const question = element("div", "ips-question");
  question.dataset.ruleId = item.id;
  question.dataset.responseType = item.responseType;
  question.dataset.staffInterpretation = item.staffInterpretation;

  const prompt = element("p", "ips-question-prompt", item.prompt);
  const answers = element(
    "p",
    "ips-answer-options",
    `\u2610 ${labels.yes}   \u2610 ${labels.no}   \u2610 ${labels.notSure}`,
  );
  question.append(
    element("span", "ips-question-number", `${String(number).padStart(2, "0")}.`),
    prompt,
    answers,
  );
  root.append(question);
};

const addSignatureRow = (root: HTMLElement, signerLabel: string, dateLabel: string): void => {
  const row = element("div", "ips-signature-row");
  const signature = element("div", "ips-signature-field");
  signature.append(element("span", "ips-signature-line"), element("span", "ips-signature-label", signerLabel));
  const date = element("div", "ips-signature-field ips-date-field");
  date.append(element("span", "ips-signature-line"), element("span", "ips-signature-label", dateLabel));
  row.append(signature, date);
  root.append(row);
};

/** Renders a paper-only document into the dedicated print root. */
export const renderInjectionPatientScreenDocument = (
  root: HTMLElement,
  documentModel: InjectionPatientScreenDocument,
): void => {
  const { labels, metadata } = documentModel;
  const page = element("article", "ips-page");
  page.dataset.patientScreenLanguage = documentModel.language;
  page.dataset.reviewStatus = documentModel.reviewStatus;

  const header = element("header", "ips-header");
  const topLine = element("div", "ips-topline");
  topLine.append(
    element("span", undefined, labels.workstation),
    element("span", undefined, labels.formLabel),
  );
  header.append(
    topLine,
    element("h1", "ips-heading", `** ${labels.title} **`),
    element("p", "ips-subtitle", labels.subtitle),
  );
  page.append(header);

  page.append(element("p", "ips-bar", labels.orderInformation));
  const metadataBlock = element("section", "ips-metadata");
  addInfoLine(
    metadataBlock,
    { label: labels.patient, value: metadata.patientName },
    { label: labels.date, value: metadata.administrationDate },
  );
  addInfoLine(
    metadataBlock,
    { label: labels.dateOfBirth, value: metadata.patientDob },
    { label: labels.phase, value: metadata.phase },
  );
  const orderLine = element("div", "ips-order-line");
  orderLine.append(
    element("strong", "ips-rx-label", "RX:"),
    document.createTextNode(
      ` ${metadata.medication} ${metadata.dose} / ${metadata.route} / ${metadata.interval}`,
    ),
  );
  metadataBlock.append(orderLine);
  page.append(metadataBlock);

  page.append(
    element("p", "ips-bar", labels.patientCheckIn),
    element("p", "ips-response-instruction", labels.responseInstruction),
  );

  let questionNumber = 1;
  for (const sectionModel of documentModel.sections) {
    const section = element("section", `ips-section ips-section-${sectionModel.id}`);
    section.dataset.section = sectionModel.id;
    section.append(element("h2", "ips-section-heading", sectionModel.title));
    for (const item of sectionModel.items) {
      addQuestion(section, questionNumber, item, labels);
      questionNumber += 1;
    }
    page.append(section);
  }

  const staffNote = element("p", "ips-staff-response-note");
  staffNote.append(element("strong", undefined, "STAFF NOTE: "), document.createTextNode(labels.staffResponseNote));
  page.append(staffNote);

  const followUp = element("section", "ips-follow-up");
  followUp.append(
    element("h2", undefined, labels.followUp),
    element("div", "ips-write-line"),
    element("div", "ips-write-line"),
  );
  page.append(followUp);

  if (documentModel.showsConsent) {
    const consent = element("section", "ips-consent");
    consent.append(
      element("h2", undefined, labels.consentTitle),
      element("p", undefined, labels.consentBody),
    );
    page.append(consent);

    const signatures = element("section", "ips-signatures");
    addSignatureRow(signatures, labels.patientSignature, labels.patientDate);
    addSignatureRow(signatures, labels.staffReviewer, labels.staffDate);
    page.append(signatures);
  }

  const footer = element("footer", "ips-source");
  if (documentModel.source) {
    const sourceLink = element("a", undefined, documentModel.source.title);
    sourceLink.href = documentModel.source.url;
    sourceLink.rel = "noreferrer";
    footer.append(`${labels.source}: `, sourceLink, ` - ${documentModel.source.labelRevision}`);
  } else {
    footer.textContent = documentModel.labels.noProductSource;
  }
  page.append(footer);

  root.replaceChildren(page);
  root.dataset.reviewStatus = documentModel.reviewStatus;
};

/**
 * Builds and stages the patient-facing output. The hardened legacy print wrapper owns
 * collision detection, empty-sheet checks, and cleanup after the print dialog.
 */
export const printInjectionPatientScreening = (
  encounter: InjectionEncounter,
  language: PatientScreenLanguage,
): boolean => {
  if (!INJECTION_PATIENT_SCREENING_ENABLED) return false;
  if (!canBuildInjectionPatientScreenDocument(encounter)) return false;

  const root = document.getElementById(INJECTION_PATIENT_SCREEN_SHEET_ID);
  if (!root) return false;

  renderInjectionPatientScreenDocument(root, buildInjectionPatientScreenDocument(encounter, language));
  if (!root.textContent?.trim()) return false;

  window.cleanPrintClasses?.();
  document.body.classList.add(INJECTION_PATIENT_SCREEN_PRINT_CLASS);
  window.print();
  return true;
};
