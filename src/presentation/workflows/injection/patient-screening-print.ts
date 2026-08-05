import {
  buildInjectionPatientScreenDocument,
  canBuildInjectionPatientScreenDocument,
  type InjectionEncounter,
  type InjectionPatientScreenDocument,
  type PatientScreenLanguage,
} from "../../../domain";

export const INJECTION_PATIENT_SCREEN_PRINT_CLASS = "print-inj-patient-screen";
export const INJECTION_PATIENT_SCREEN_SHEET_ID = "injPatientScreenSheet";

/**
 * The flag must be explicitly set by the PR-preview build. Undefined is
 * intentionally treated as production-safe/off for local and live builds.
 */
export const isDraftInjectionPatientScreeningEnabled = (
  value: string | undefined,
): boolean => value === "true";

export const DRAFT_INJECTION_PATIENT_SCREENING_ENABLED =
  isDraftInjectionPatientScreeningEnabled(
    import.meta.env.VITE_ENABLE_DRAFT_INJECTION_PATIENT_SCREENING,
  );

declare global {
  interface Window {
    __IPMG_DRAFT_INJECTION_PATIENT_SCREENING_ENABLED__?: boolean;
    cleanPrintClasses?: () => void;
  }
}

// The legacy print hardener owns the final runtime rejection too. Publishing
// the build value lets that plain-JS choke point reject a staged draft sheet in
// a production build even if a caller bypasses the Preact button.
if (typeof window !== "undefined") {
  window.__IPMG_DRAFT_INJECTION_PATIENT_SCREENING_ENABLED__ =
    DRAFT_INJECTION_PATIENT_SCREENING_ENABLED;
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

const addMeta = (root: HTMLElement, label: string, value: string): void => {
  const item = element("div", "ips-meta-item");
  item.append(element("span", undefined, label), element("strong", undefined, value));
  root.append(item);
};

const addSignatureLine = (root: HTMLElement, label: string): void => {
  const field = element("div", "ips-signature-field");
  field.append(element("span", "ips-signature-line"), element("span", "ips-signature-label", label));
  root.append(field);
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

  const draftMarker = element("div", "ips-draft-marker", labels.draftMarker);
  const header = element("header", "ips-header");
  const heading = element("div", "ips-heading");
  heading.append(
    element("p", "ips-kicker", "IPMG MA WORKSTATION"),
    element("h1", undefined, labels.title),
    element("p", "ips-subtitle", labels.subtitle),
  );
  header.append(heading, draftMarker);

  const metadataGrid = element("section", "ips-metadata");
  addMeta(metadataGrid, labels.patient, metadata.patientName);
  addMeta(metadataGrid, labels.dateOfBirth, metadata.patientDob);
  addMeta(metadataGrid, labels.medication, metadata.medication);
  addMeta(metadataGrid, labels.dose, metadata.dose);
  addMeta(metadataGrid, labels.route, metadata.route);
  addMeta(metadataGrid, labels.schedule, metadata.interval);
  addMeta(metadataGrid, labels.phase, metadata.phase);
  addMeta(metadataGrid, labels.date, metadata.administrationDate);

  page.append(header, metadataGrid);

  for (const sectionModel of documentModel.sections) {
    const section = element("section", `ips-section ips-section-${sectionModel.id}`);
    section.dataset.section = sectionModel.id;
    section.append(element("h2", undefined, sectionModel.title));
    for (const item of sectionModel.items) {
      const question = element("div", "ips-question");
      question.dataset.ruleId = item.id;
      question.append(
        element("p", "ips-question-prompt", item.prompt),
        element(
          "p",
          "ips-answer-options",
          `☐ ${labels.yes}    ☐ ${labels.no}    ☐ ${labels.discuss}`,
        ),
        element("p", "ips-details-line", `${labels.details}: ________________________________________________`),
      );
      section.append(question);
    }
    page.append(section);
  }

  const consent = element("section", "ips-consent-placeholder");
  consent.append(
    element("h2", undefined, labels.consentPlaceholderTitle),
    element("p", undefined, labels.consentPlaceholderBody),
  );
  page.append(consent);

  const signatures = element("section", "ips-signatures");
  addSignatureLine(signatures, labels.patientSignature);
  addSignatureLine(signatures, labels.patientDate);
  addSignatureLine(signatures, labels.staffReviewer);
  addSignatureLine(signatures, labels.staffDate);
  const followUp = element("div", "ips-follow-up");
  followUp.append(
    element("span", "ips-follow-up-label", labels.followUp),
    element("span", "ips-follow-up-line"),
  );
  signatures.append(followUp);
  page.append(signatures);

  const source = element("footer", "ips-source");
  if (documentModel.source) {
    const sourceLink = element("a", undefined, documentModel.source.title);
    sourceLink.href = documentModel.source.url;
    sourceLink.rel = "noreferrer";
    source.append(
      `${labels.source}: `,
      sourceLink,
      ` — ${documentModel.source.labelRevision}`,
    );
  } else {
    source.textContent = documentModel.labels.noProductSource;
  }
  page.append(source, element("div", "ips-footer-marker", labels.draftMarker));

  root.replaceChildren(page);
  root.dataset.reviewStatus = documentModel.reviewStatus;
};

/**
 * Builds and stages the draft output. The hardened legacy print wrapper owns
 * collision detection, empty-sheet checks, and cleanup after the print dialog.
 */
export const printInjectionPatientScreening = (
  encounter: InjectionEncounter,
  language: PatientScreenLanguage,
): boolean => {
  if (!DRAFT_INJECTION_PATIENT_SCREENING_ENABLED) return false;
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
