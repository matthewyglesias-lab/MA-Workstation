import {
  buildInjectionAvsModel,
  type AvsBlock,
  type AvsDataRow,
  type AvsTimelineStep,
  type InjectionAvsInput,
  type InjectionAvsModel,
} from "./injection-avs-content";

export type { InjectionAvsInput, InjectionAvsModel } from "./injection-avs-content";

/**
 * Renders the injection After Visit Summary as a marginalia sheet built around
 * a dated dose spine.
 *
 * One grid runs the length of the page - a right-aligned label gutter, a narrow
 * rail, and the content column. Ordinary sections put their heading in the
 * gutter and leave the rail empty; timeline steps put their date in the gutter
 * and draw a node on the rail. Safety alerts deliberately break that grid and
 * span the full measure, which is what makes them read as urgent without
 * needing a fill.
 *
 * The printed handout is black and white (only the archived PDF keeps colour),
 * so every level of the hierarchy has to survive greyscale. Size, weight, and
 * position carry it; the accent colour is an enrichment that the stylesheet
 * lets degrade rather than forcing with print-color-adjust.
 */

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

const paragraphs = (lines: readonly string[]): string =>
  lines
    .filter((line) => String(line ?? "").trim())
    .map((line) => `<p class="avs2-p">${escapeHtml(line)}</p>`)
    .join("");

const pairList = (rows: readonly AvsDataRow[]): string =>
  `<dl class="avs2-pairs">${rows
    .map(
      (row) =>
        `<div><dt>${escapeHtml(row.label)}</dt>` +
        `<dd>${escapeHtml(row.value)}</dd></div>`,
    )
    .join("")}</dl>`;

const renderBlockBody = (block: AvsBlock): string => {
  const parts: string[] = [];
  if (block.rows?.length) parts.push(pairList(block.rows));
  parts.push(paragraphs(block.paragraphs ?? []));
  if (block.items?.length) {
    parts.push(
      `<ul class="avs2-ul">${block.items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`,
    );
  }
  return parts.join("");
};

const sectionClass: Record<AvsBlock["kind"], string> = {
  timing: "timing",
  "site-care": "site",
  "expected-effects": "expect",
  "medication-reminder": "reminder",
  "call-clinic": "call",
  emergency: "emergency",
  contact: "contact",
  "critical-alert": "critical",
};

const sectionId = (block: AvsBlock, suffix = ""): string =>
  `avs-${sectionClass[block.kind]}${suffix ? `-${suffix}` : ""}`;

/** A patient instruction section with a full-width, scan-friendly heading. */
const renderSection = (
  block: AvsBlock,
  extraClass = "",
  idSuffix = "",
): string => {
  const variant = sectionClass[block.kind];
  const id = sectionId(block, idSuffix);
  return (
    `<section class="avs2-sec avs2-sec-${variant}${extraClass ? ` ${extraClass}` : ""}" aria-labelledby="${id}">` +
    `<h2 class="avs2-lab" id="${id}">${escapeHtml(block.heading)}</h2>` +
    `<div class="avs2-b">${renderBlockBody(block)}</div>` +
    `</section>`
  );
};

/**
 * Alerts break the grid on purpose. Spanning the full measure keeps long safety
 * headings readable and gives the reviewed emergency copy its own scan path.
 */
const renderAlert = (block: AvsBlock, idSuffix = ""): string => {
  const id = sectionId(block, idSuffix);
  return (
    `<section class="avs2-alert avs2-alert-${sectionClass[block.kind]}" aria-labelledby="${id}">` +
    `<h2 class="avs2-alert-bar" id="${id}">${escapeHtml(block.heading)}</h2>` +
    `<div class="avs2-alert-body">${renderBlockBody(block)}</div>` +
    `</section>`
  );
};

const renderBlock = (block: AvsBlock, idSuffix = ""): string =>
  block.emphasis
    ? renderAlert(block, idSuffix)
    : renderSection(block, "", idSuffix);

/**
 * Estimate rendered instruction height from the reviewed source copy, rather
 * than letting browser pagination decide whether a page needs a continuation.
 * The estimate intentionally counts headings and list items as separate lines:
 * those are the parts that carry vertical rhythm in the printed sheet.
 */
const estimatedTextLines = (value: string): number =>
  Math.max(1, Math.ceil(String(value ?? "").trim().length / 78));

const estimatedBlockLines = (block: AvsBlock): number =>
  estimatedTextLines(block.heading) +
  (block.paragraphs ?? []).reduce((total, value) => total + estimatedTextLines(value), 0) +
  (block.items ?? []).reduce((total, value) => total + estimatedTextLines(value), 0) +
  (block.rows ?? []).reduce(
    (total, row) => total + estimatedTextLines(`${row.label} ${row.value}`),
    0,
  );

/**
 * A routine AVS is one page only when its guidance fits the fixed printable
 * body. Keeping this deterministic avoids a browser creating an orphaned
 * overflow page while the document itself still claims "Page 1 of 1".
 */
export type InjectionAvsLayoutVariant =
  | "routine-one-page"
  | "routine-two-page"
  | "complex-two-page";

export const selectInjectionAvsLayout = (
  model: InjectionAvsModel,
): InjectionAvsLayoutVariant => {
  if (
    model.timeline.length > 2 ||
    Boolean(model.documentSubtitle) ||
    model.leadAlerts.length > 1
  ) {
    return "complex-two-page";
  }
  const guidanceLines = [...model.blocks, model.emergency].reduce(
    (total, block) => total + estimatedBlockLines(block),
    0,
  );
  return guidanceLines > 24 ? "routine-two-page" : "routine-one-page";
};

export interface InjectionAvsPagePartition {
  primary: AvsBlock[];
  continuation: AvsBlock[];
}

export const partitionInjectionAvsBlocks = (
  model: InjectionAvsModel,
  layout: InjectionAvsLayoutVariant,
): InjectionAvsPagePartition => {
  const all = [...model.blocks, model.emergency];
  if (layout === "routine-one-page") {
    return { primary: all, continuation: [] };
  }
  if (layout === "routine-two-page") {
    const primaryKinds = new Set<AvsBlock["kind"]>(["timing", "site-care"]);
    return {
      primary: all.filter((block) => primaryKinds.has(block.kind)),
      continuation: all.filter((block) => !primaryKinds.has(block.kind)),
    };
  }
  return { primary: [], continuation: all };
};

export const requiresInjectionAvsContinuation = (
  model: InjectionAvsModel,
): boolean => selectInjectionAvsLayout(model) !== "routine-one-page";

const renderInjectionSiteMarker = (siteLabel: string): string => {
  const normalized = siteLabel.toLowerCase();
  const isLeft = /(^|\b)(left|l\b)/.test(normalized);
  const isHip = /(glute|hip)/.test(normalized);
  const isThigh = /thigh|vastus/.test(normalized);
  const markerX = isLeft ? 18 : 6;
  const markerY = isThigh ? 27 : isHip ? 21.5 : 12.5;
  return (
    `<svg class="avs2-site-marker" viewBox="0 0 24 32" role="img" ` +
    `aria-label="Injection site: ${escapeHtml(siteLabel)}">` +
    `<circle cx="12" cy="4.2" r="2.6" fill="none" stroke="currentColor" stroke-width="1.2"/>` +
    `<path d="M8.2 9.2c1.1-1 2.3-1.5 3.8-1.5s2.7.5 3.8 1.5l2.1 8.1-2.7 4.1-.9 8.1M8.2 9.2l-2.1 8.1 2.7 4.1.9 8.1M9 10.2h6M8.8 21.4h6.4" ` +
    `fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle class="avs2-site-dot" cx="${markerX}" cy="${markerY}" r="2"/>` +
    `</svg>`
  );
};

/**
 * One node on the spine: date in the gutter, marker on the rail, step body.
 *
 * `instruction` is the model's imperative for the due step. It rides above
 * the step's caveats so the call to action is read before the exceptions to it.
 */
const renderStep = (
  step: AvsTimelineStep,
  instruction = "",
  siteLabel = "",
): string => {
  // The due step keeps the avs2-next / avs2-date hooks: it is still "the next
  // dose and its date", the roles those classes have always named, so the
  // print stylesheet and the structural test both stay pointed at the right
  // element after the layout change.
  const isDue = step.state === "due";
  const whenClass = isDue ? "avs2-when avs2-date" : "avs2-when";
  const bodyClass = isDue ? "avs2-step-body avs2-next" : "avs2-step-body";

  const when = step.when
    ? `<b>${escapeHtml(step.when)}</b>`
    : `<b class="avs2-when-none">&mdash;</b>`;
  const whenNote = step.whenNote
    ? `<span>${escapeHtml(step.whenNote)}</span>`
    : "";

  return (
    `<li class="avs2-step avs2-step-${escapeHtml(step.state)}">` +
    `<div class="${whenClass}">${when}${whenNote}</div>` +
    `<div class="avs2-rail"><i class="avs2-node"></i></div>` +
    `<div class="${bodyClass}">` +
    (step.state === "given" && siteLabel
      ? renderInjectionSiteMarker(siteLabel)
      : "") +
    `<div class="avs2-step-title">${escapeHtml(step.title)}</div>` +
    (step.dateLong
      ? `<div class="avs2-step-date">${escapeHtml(step.dateLong)}</div>`
      : "") +
    (instruction
      ? `<div class="avs2-step-instr">${escapeHtml(instruction)}</div>`
      : "") +
    paragraphs(step.detail) +
    `</div></li>`
  );
};

const renderSpine = (
  timeline: readonly AvsTimelineStep[],
  administrationNote: string,
  instruction: string,
  siteLabel: string,
): string => {
  if (!timeline.length) return "";
  // The dose-specific note is folded into the step it describes rather than
  // trailing the spine as its own row. That keeps every row in the spine a real
  // dated step, which is what lets the rail terminate cleanly at the first and
  // last nodes instead of running past a marker-less row.
  const steps = timeline
    .map((step) => {
      const detail =
        step.state === "given" && administrationNote
          ? [...step.detail, administrationNote]
          : step.detail;
      return renderStep(
        { ...step, detail },
        step.state === "due" ? instruction : "",
        step.state === "given" ? siteLabel : "",
      );
    })
    .join("");
  return `<ol class="avs2-spine" aria-label="Treatment timeline">${steps}</ol>`;
};

const IDENTITY_ORDER = [
  "PATIENT",
  "DOB",
  "RECORD NO",
  "PROVIDER",
  "VISIT DATE",
  "GIVEN BY",
];

/** Patient and visit facts, promoted from a footer run to a visible banner. */
const renderRecord = (identity: readonly AvsDataRow[]): string => {
  const ordered = [...identity].sort(
    (left, right) =>
      IDENTITY_ORDER.indexOf(left.label) - IDENTITY_ORDER.indexOf(right.label),
  );
  return (
    `<section class="avs2-id" aria-label="Patient and visit details"><dl>` +
    ordered
    .filter((row) => String(row.value ?? "").trim())
    .map(
      (row) =>
        `<div class="avs2-id-pair avs2-id-${row.label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}">` +
        `<dt class="avs2-id-k">${escapeHtml(row.label)}</dt>` +
        `<dd class="avs2-id-v">${escapeHtml(row.value)}</dd>` +
        `</div>`,
    )
    .join("") +
    `</dl></section>`
  );
};

const renderTitle = (title: string, status: string): string => {
  const [primary, ...rest] = title.split(" - ");
  const descriptor = rest.join(" - ");
  const statusVariant = status === "PATIENT COPY" ? "patient" : status === "CARE HANDOFF" ? "handoff" : "draft";
  const statusLabel = status === "PATIENT COPY" ? "Patient copy" : status === "CARE HANDOFF" ? "Care handoff" : status;
  return (
    `<div class="avs2-heading">` +
    `<h1 class="avs2-title" id="avs-document-title">${escapeHtml(primary)}` +
    (descriptor
      ? `<span class="avs2-title-detail">${escapeHtml(descriptor)}</span>`
      : "") +
    `</h1>` +
    `<span class="avs2-status avs2-status-${statusVariant}">${escapeHtml(statusLabel)}</span>` +
    `</div>`
  );
};

export interface InjectionAvsChrome {
  facilityName: string;
  facilityUnit: string;
  clinicPhone: string;
  /** Right-hand run stamp, e.g. "08/05/26 1024". */
  runStamp: string;
  reportId: string;
  formId: string;
}

export const DEFAULT_AVS_CHROME: InjectionAvsChrome = {
  facilityName: "IPMG - SAN BERNARDINO",
  facilityUnit: "MEDICATION ADMINISTRATION CLINIC",
  clinicPhone: "(909) 887-6222",
  runStamp: "",
  reportId: "AVS-INJ-01",
  formId: "IPMG-AVS-INJ (REV 08/26B)",
};

/** Renders the model to the print sheet's inner HTML. */
export const renderInjectionAvsHtml = (
  model: InjectionAvsModel,
  chrome: InjectionAvsChrome,
): string => {
  const subtitle = model.documentSubtitle
    ? `<div class="avs2-subtitle">${escapeHtml(model.documentSubtitle)}</div>`
    : "";

  const contactBlock: AvsBlock = {
    kind: "contact",
    heading: "Plan your next visit",
    rows: model.nextDose.contactLines,
  };
  const renderContact = (compact = false): string =>
    model.nextDose.contactLines.length
      ? renderSection(
          contactBlock,
          compact ? "avs2-sec-contact-compact" : "",
          compact ? "continued" : "primary",
        )
      : "";

  const patientName =
    model.identity.find((row) => row.label === "PATIENT")?.value ?? "";
  const patientDob = model.identity.find((row) => row.label === "DOB")?.value ?? "";
  const recordNumber = model.identity.find((row) => row.label === "RECORD NO")?.value ?? "";
  const visitDate = model.identity.find((row) => row.label === "VISIT DATE")?.value ?? "";
  // A routine sheet normally fits on one page, but product-specific guidance
  // can be longer than the fixed printable body. Select the fully identified
  // continuation before layout so no content can be pushed beneath the footer
  // or stranded on an unlabeled browser-created page.
  const layout = selectInjectionAvsLayout(model);
  const pages = partitionInjectionAvsBlocks(model, layout);
  const twoPage = layout !== "routine-one-page";
  const continuation = twoPage
    ? `<header class="avs2-continuation">` +
      `<h2>After Visit Summary - Continued</h2>` +
      `<dl class="avs2-continuation-id">` +
      `<div><dt>Patient</dt><dd>${escapeHtml(patientName)}</dd></div>` +
      `<div><dt>DOB</dt><dd>${escapeHtml(patientDob)}</dd></div>` +
      `<div><dt>Record no.</dt><dd>${escapeHtml(recordNumber)}</dd></div>` +
      `<div><dt>Visit date</dt><dd>${escapeHtml(visitDate)}</dd></div>` +
      `</dl>` +
      `</header>`
    : "";
  const renderFooter = (pageNumber: number, pageTotal: number): string =>
    `<footer class="avs2-foot">` +
    `<span class="avs2-foot-patient">${escapeHtml(patientName)} - DOB ${escapeHtml(patientDob)}</span>` +
    `<span>${escapeHtml(chrome.formId)} - ${escapeHtml(chrome.reportId)}` +
    ` - Page ${pageNumber} of ${pageTotal}` +
    (chrome.runStamp ? ` - Printed ${escapeHtml(chrome.runStamp)}` : "") +
    `</span>` +
    `</footer>`;

  const renderGuidance = (blocks: readonly AvsBlock[]): string => {
    if (!blocks.length) return "";
    const ordinary = blocks.filter((block) => block.kind !== "emergency");
    const urgent = blocks.filter((block) => block.kind === "emergency");
    return (
      (ordinary.length
        ? `<div class="avs2-guidance">${ordinary
            .map((block, index) => renderBlock(block, `guidance-${index + 1}`))
            .join("")}</div>`
        : "") +
      urgent
        .map((block, index) => renderAlert(block, `emergency-${index + 1}`))
        .join("")
    );
  };

  // The spine is the record of what was given and when, so model.administration
  // is not drawn a second time here; its dose-specific note rides with the step
  // it belongs to.
  return (
    `<article class="avs2 avs2-layout-${layout}${twoPage ? " avs2-complex" : ""}${model.documentStatus === "STAFF PREVIEW - NOT FINAL" ? " avs2-draft" : ""}" aria-labelledby="avs-document-title">` +
    `<div class="avs2-page avs2-page-primary">` +
    `<div class="avs2-page-body">` +
    `<header class="avs2-run">` +
    `<div class="avs2-brand">` +
    `<span class="avs2-run-name">${escapeHtml(chrome.facilityName)}</span>` +
    `<span>${escapeHtml(chrome.facilityUnit)}</span>` +
    `</div>` +
    `<div class="avs2-clinic-contact">` +
    `<span>San Bernardino clinic</span>` +
    `<span>${escapeHtml(chrome.clinicPhone)}</span>` +
    `</div>` +
    `</header>` +
    renderTitle(model.documentTitle, model.documentStatus) +
    subtitle +
    renderRecord(model.identity) +
    model.leadAlerts
      .map((block, index) => renderAlert(block, `lead-${index + 1}`))
      .join("") +
    `<section class="avs2-overview" aria-labelledby="avs-treatment-summary">` +
    `<h2 class="avs2-overview-title" id="avs-treatment-summary">Your treatment today</h2>` +
    renderSpine(
      model.timeline,
      model.administrationNote,
      model.nextDose.instruction,
      model.administration.find((row) => row.label === "ROUTE / SITE")?.value ?? "",
    ) +
    `</section>` +
    renderContact() +
    renderGuidance(pages.primary) +
    `</div>` +
    renderFooter(1, twoPage ? 2 : 1) +
    `</div>` +
    (twoPage
      ? `<div class="avs2-page avs2-page-continuation">` +
        `<div class="avs2-page-body">` +
        continuation +
        renderGuidance(pages.continuation) +
        renderContact(true) +
        `</div>` +
        renderFooter(2, 2) +
        `</div>`
      : "") +
    `</article>`
  );
};

/** Convenience wrapper: input values straight to print-ready HTML. */
export const buildInjectionAvsHtml = (
  input: InjectionAvsInput,
  chrome: Partial<InjectionAvsChrome> = {},
): string =>
  renderInjectionAvsHtml(buildInjectionAvsModel(input), {
    ...DEFAULT_AVS_CHROME,
    ...chrome,
  });
