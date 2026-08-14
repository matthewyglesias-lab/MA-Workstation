import {
  buildInjectionAvsModel,
  type AvsAdministrationComponent,
  type AvsBlock,
  type AvsDataRow,
  type AvsTimelineStep,
  type InjectionAvsDocumentMode,
  type InjectionAvsInput,
  type InjectionAvsModel,
} from "./injection-avs-content";

export type {
  InjectionAvsDocumentMode,
  InjectionAvsInput,
  InjectionAvsModel,
} from "./injection-avs-content";

const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] as string,
  );

const renderList = (items: readonly string[], className = "avs3-list"): string =>
  items.length
    ? `<ul class="${className}">${items
        .filter(Boolean)
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`
    : "";

const renderParagraphs = (items: readonly string[]): string =>
  items
    .filter(Boolean)
    .map((item) => `<p>${escapeHtml(item)}</p>`)
    .join("");

const valueFor = (rows: readonly AvsDataRow[], label: string): string =>
  rows.find((row) => row.label === label)?.value ?? "-";

const renderPatientBand = (model: InjectionAvsModel): string => {
  const staff =
    valueFor(model.identity, "GIVEN BY") !== "-"
      ? valueFor(model.identity, "GIVEN BY")
      : valueFor(model.identity, "DOCUMENTED BY");
  const facts = [
    ["Patient", valueFor(model.identity, "PATIENT")],
    ["DOB", valueFor(model.identity, "DOB")],
    ["Record no.", valueFor(model.identity, "RECORD NO")],
    ["Provider", valueFor(model.identity, "PROVIDER")],
    [model.mode === "patient" ? "Administered by" : "Documented by", staff],
  ];
  return (
    `<section class="avs3-patient-band" aria-label="Patient and visit identification">` +
    facts
      .map(
        ([label, value]) =>
          `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`,
      )
      .join("") +
    `</section>`
  );
};

const sitePoint = (component: AvsAdministrationComponent): [number, number] => {
  const left = /\bleft\b|^l\b/i.test(component.site);
  const x = left ? 34 : 66;
  switch (component.siteRegion) {
    case "deltoid":
    case "upper-arm":
      return [x, 36];
    case "abdomen":
      return [left ? 44 : 56, 58];
    case "ventrogluteal":
    case "dorsogluteal":
      return [x, 70];
    default:
      return [50, 52];
  }
};

const renderSiteGraphic = (component: AvsAdministrationComponent): string => {
  const [x, y] = sitePoint(component);
  const label = `Injection site: ${component.site || "not documented"}`;
  return (
    `<svg class="avs3-site-svg" viewBox="0 0 100 100" role="img" aria-label="${escapeHtml(label)}">` +
    `<title>${escapeHtml(label)}</title>` +
    `<circle class="avs3-site-head" cx="50" cy="16" r="9"/>` +
    `<path class="avs3-site-body" d="M38 30 Q50 24 62 30 L68 55 61 84 51 84 50 58 49 84 39 84 32 55Z"/>` +
    `<circle class="avs3-site-mark" cx="${x}" cy="${y}" r="5"/>` +
    `</svg>`
  );
};

const renderComponent = (
  component: AvsAdministrationComponent,
  index: number,
  mode: InjectionAvsDocumentMode,
): string => {
  const details = [
    component.dose && `<span><b>Dose</b>${escapeHtml(component.dose)}</span>`,
    component.route && `<span><b>Route</b>${escapeHtml(component.route)}</span>`,
    component.site && `<span><b>Site</b>${escapeHtml(component.site)}</span>`,
    component.administrationTime &&
      `<span><b>Time</b>${escapeHtml(component.administrationTime)}</span>`,
  ]
    .filter(Boolean)
    .join("");
  const state =
    mode === "patient" && component.administered
      ? "Administered"
      : "Staff must verify before release";
  return (
    `<article class="avs3-component">` +
    `<div class="avs3-component-copy">` +
    `<div class="avs3-component-eyebrow">Component ${index + 1} · ${escapeHtml(state)}</div>` +
    `<h3>${escapeHtml(component.productLabel)}</h3>` +
    `<div class="avs3-component-facts">${details}</div>` +
    `</div>${renderSiteGraphic(component)}</article>`
  );
};

const renderOverview = (model: InjectionAvsModel): string => {
  const treatmentHeading =
    model.mode === "patient" ? "Today’s treatment" : "Treatment details for staff review";
  const dueDate = model.nextDose.dateLong || "Due date not yet set";
  return (
    `<section class="avs3-overview" aria-labelledby="avs3-treatment-heading">` +
    `<div class="avs3-treatment-card">` +
    `<h2 id="avs3-treatment-heading">${treatmentHeading}</h2>` +
    `<div class="avs3-components">${model.components
      .map((component, index) => renderComponent(component, index, model.mode))
      .join("")}</div>` +
    `</div>` +
    `<aside class="avs3-due-card" aria-labelledby="avs3-due-heading">` +
    `<span id="avs3-due-heading">Your next injection is due</span>` +
    `<strong>${escapeHtml(dueDate)}</strong>` +
    `<b>${escapeHtml(model.nextDose.instruction)}</b>` +
    renderParagraphs(model.nextDose.notes) +
    `</aside></section>`
  );
};

const renderAlert = (alert: AvsBlock): string =>
  `<section class="avs3-alert" aria-label="${escapeHtml(alert.heading)}">` +
  `<h2>${escapeHtml(alert.heading)}</h2>` +
  renderParagraphs(alert.paragraphs ?? []) +
  renderList(alert.items ?? []) +
  `</section>`;

const renderTimeline = (steps: readonly AvsTimelineStep[]): string =>
  `<section class="avs3-timeline" aria-labelledby="avs3-timeline-heading">` +
  `<h2 id="avs3-timeline-heading">Your treatment timeline</h2>` +
  `<ol>${steps
    .map(
      (step) =>
        `<li class="avs3-timeline-${escapeHtml(step.state)}">` +
        `<div class="avs3-timeline-when"><strong>${escapeHtml(step.when || "—")}</strong>` +
        `<span>${escapeHtml(step.whenNote)}</span></div>` +
        `<div><h3>${escapeHtml(step.title)}</h3>` +
        (step.dateLong ? `<b class="avs3-timeline-date">${escapeHtml(step.dateLong)}</b>` : "") +
        // The due-date card immediately above already carries the call path;
        // keeping that prose out of the spine avoids duplicate instructions
        // and makes the complex page count deterministic.
        renderList(step.state === "due" ? [] : step.detail, "avs3-plain-list") +
        `</div></li>`,
    )
    .join("")}</ol></section>`;

const renderCareSections = (model: InjectionAvsModel): string => {
  const sections = model.patientSections;
  return (
    `<section class="avs3-care-grid" aria-label="Aftercare and medication guidance">` +
    `<article class="avs3-card avs3-card-wide"><h2>Why timing matters</h2>${renderParagraphs(sections.timing)}</article>` +
    (sections.siteCare.length
      ? `<article class="avs3-card"><h2>Care for your injection site</h2>${renderList(sections.siteCare)}</article>`
      : "") +
    (sections.expectedEffects.length
      ? `<article class="avs3-card"><h2>What you may notice</h2>${renderList(sections.expectedEffects)}</article>`
      : "") +
    (sections.medicationReminders.length
      ? `<article class="avs3-card avs3-card-reminder"><h2>Medication reminders</h2>${renderList(sections.medicationReminders)}</article>`
      : "") +
    `<article class="avs3-card avs3-card-call"><h2>Call the clinic if</h2>${renderList(sections.callClinicReasons)}</article>` +
    `<article class="avs3-card avs3-card-emergency"><h2>Call 911 or go to the nearest ER now if</h2>${renderList(sections.emergencyGuidance)}</article>` +
    `</section>`
  );
};

const renderContactStrip = (model: InjectionAvsModel, chrome: InjectionAvsChrome): string =>
  `<section class="avs3-contact" aria-label="Clinic contact and injection hours">` +
  `<div><span>Call to schedule or reschedule</span><strong>${escapeHtml(chrome.clinicPhone)}</strong></div>` +
  `<div><span>Injection clinic hours</span><strong>${escapeHtml(chrome.clinicHours)}</strong></div>` +
  `</section>`;

const renderTrace = (model: InjectionAvsModel): string =>
  `<section class="avs3-trace" aria-label="Administration traceability">` +
  `<h2>${model.mode === "patient" ? "Administration trace" : "Documented component trace — not final"}</h2>` +
  `<div>${model.components
    .map(
      (component, index) =>
        `<p><b>${index + 1}. ${escapeHtml(component.productLabel)} ${escapeHtml(component.dose)}</b>` +
        ` · ${escapeHtml(component.site || "Site not documented")}` +
        ` · Lot ${escapeHtml(component.lot || "—")}` +
        ` · Exp ${escapeHtml(component.expiration || "—")}</p>`,
    )
    .join("")}</div></section>`;

export interface InjectionAvsChrome {
  facilityName: string;
  facilityUnit: string;
  clinicPhone: string;
  clinicHours: string;
  formId: string;
}

export const DEFAULT_AVS_CHROME: InjectionAvsChrome = {
  facilityName: "IPMG - SAN BERNARDINO",
  facilityUnit: "MEDICATION ADMINISTRATION CLINIC",
  clinicPhone: "(909) 887-6222",
  clinicHours: "Monday-Friday, 9:30 AM-4:30 PM",
  formId: "IPMG-AVS-INJ-02 (REV 08/26)",
};

const renderHeader = (model: InjectionAvsModel, chrome: InjectionAvsChrome): string =>
  `<header class="avs3-header">` +
  `<div><span class="avs3-clinic">${escapeHtml(chrome.facilityName)}</span>` +
  `<span>${escapeHtml(chrome.facilityUnit)}</span></div>` +
  `<div class="avs3-title-block"><h1>Injection After Visit Summary</h1>` +
  `<p>Visit date ${escapeHtml(valueFor(model.identity, "VISIT DATE"))}</p></div>` +
  `<span class="avs3-copy-status">${model.mode === "draft" ? "STAFF PREVIEW" : "PATIENT COPY"}</span>` +
  `</header>`;

const renderPage = (
  model: InjectionAvsModel,
  chrome: InjectionAvsChrome,
  page: number,
  total: number,
  body: string,
): string =>
  `<section class="avs3-page" data-avs-page="${page}" aria-label="Injection after visit summary page ${page} of ${total}">` +
  (model.mode === "draft"
    ? `<div class="avs3-draft-banner">STAFF DRAFT — ADMINISTRATION NOT FINALIZED</div><div class="avs3-watermark" aria-hidden="true">STAFF DRAFT</div>`
    : "") +
  renderHeader(model, chrome) +
  renderPatientBand(model) +
  body +
  `<footer class="avs3-footer"><span>${escapeHtml(chrome.formId)}</span><span>Page ${page} of ${total}</span></footer>` +
  `</section>`;

/** Renders a deterministic one- or two-page AVS article. */
export const renderInjectionAvsHtml = (
  model: InjectionAvsModel,
  chrome: InjectionAvsChrome,
): string => {
  const alerts = model.leadAlerts.map(renderAlert).join("");
  if (model.layoutVariant === "routine-one-page") {
    const body =
      renderOverview(model) +
      alerts +
      renderCareSections(model) +
      renderContactStrip(model, chrome) +
      renderTrace(model);
    return `<article class="avs3 avs3-${model.mode} avs3-routine">${renderPage(model, chrome, 1, 1, body)}</article>`;
  }

  const pageOne = renderOverview(model) + alerts + renderTimeline(model.timeline);
  const pageTwo =
    renderCareSections(model) +
    renderContactStrip(model, chrome) +
    renderTrace(model);
  return (
    `<article class="avs3 avs3-${model.mode} avs3-complex">` +
    renderPage(model, chrome, 1, 2, pageOne) +
    renderPage(model, chrome, 2, 2, pageTwo) +
    `</article>`
  );
};

export interface InjectionAvsDocumentRequest {
  mode: InjectionAvsDocumentMode;
  chrome?: Partial<InjectionAvsChrome>;
}

export type InjectionAvsBuildResult =
  | { ok: true; html: string; reason: ""; model: InjectionAvsModel }
  | { ok: false; html: ""; reason: string };

/** Fail-closed bridge contract used immediately before preview/release. */
export const buildInjectionAvsDocument = (
  input: InjectionAvsInput,
  request: InjectionAvsDocumentRequest,
): InjectionAvsBuildResult => {
  if (request?.mode !== "draft" && request?.mode !== "patient") {
    return { ok: false, html: "", reason: "A draft or patient document mode is required." };
  }
  try {
    const model = buildInjectionAvsModel(input, request.mode);
    const chrome = { ...DEFAULT_AVS_CHROME, ...(request.chrome ?? {}) };
    return {
      ok: true,
      html: renderInjectionAvsHtml(model, chrome),
      reason: "",
      model,
    };
  } catch (error) {
    return {
      ok: false,
      html: "",
      reason: error instanceof Error ? error.message : "The injection AVS could not be built.",
    };
  }
};
