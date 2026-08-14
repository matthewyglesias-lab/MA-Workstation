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

const sectionVariant = (heading: string): string => {
  const normalized = heading.toLowerCase();
  if (normalized === "contact") return "contact";
  if (normalized.startsWith("call the clinic")) return "call";
  if (normalized.includes("timing matters")) return "timing";
  if (normalized.includes("injection site")) return "site";
  if (normalized.includes("what to expect")) return "expect";
  return "general";
};

const sectionId = (heading: string): string =>
  `avs-${sectionVariant(heading)}-${heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;

/** A patient instruction section with a full-width, scan-friendly heading. */
const renderSection = (heading: string, body: string): string => {
  const variant = sectionVariant(heading);
  const id = sectionId(heading);
  return (
    `<section class="avs2-sec avs2-sec-${variant}" aria-labelledby="${id}">` +
    `<h2 class="avs2-lab" id="${id}">${escapeHtml(heading)}</h2>` +
    `<div class="avs2-b">${body}</div>` +
    `</section>`
  );
};

/**
 * Alerts break the grid on purpose. Spanning the full measure over a heavy rule
 * is what separates them from ordinary sections once the inverse-video bars are
 * gone, and it keeps long safety headings ("EMERGENCY - CALL 911 OR GO TO THE
 * NEAREST ER NOW IF") out of a narrow gutter that would wrap them to four lines.
 */
const renderAlert = (block: AvsBlock): string => {
  const id = `avs-alert-${block.heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
  return (
    `<section class="avs2-alert" aria-labelledby="${id}">` +
    `<h2 class="avs2-alert-bar" id="${id}">${escapeHtml(block.heading)}</h2>` +
    `<div class="avs2-alert-body">${renderBlockBody(block)}</div>` +
    `</section>`
  );
};

const renderBlock = (block: AvsBlock): string =>
  block.emphasis
    ? renderAlert(block)
    : renderSection(block.heading, renderBlockBody(block));

/**
 * One node on the spine: date in the gutter, marker on the rail, step body.
 *
 * `instruction` is the model's imperative for the due step. It rides above
 * the step's caveats so the call to action is read before the exceptions to it.
 */
const renderStep = (step: AvsTimelineStep, instruction = ""): string => {
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
  return (
    `<div class="avs2-heading">` +
    `<h1 class="avs2-title" id="avs-document-title">${escapeHtml(primary)}` +
    (descriptor
      ? `<span class="avs2-title-detail">${escapeHtml(descriptor)}</span>`
      : "") +
    `</h1>` +
    `<span class="avs2-status">${escapeHtml(status)}</span>` +
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
  formId: "IPMG-AVS-INJ (REV 08/26)",
};

/** Renders the model to the print sheet's inner HTML. */
export const renderInjectionAvsHtml = (
  model: InjectionAvsModel,
  chrome: InjectionAvsChrome,
): string => {
  const subtitle = model.documentSubtitle
    ? `<div class="avs2-subtitle">${escapeHtml(model.documentSubtitle)}</div>`
    : "";

  const contact = model.nextDose.contactLines.length
    ? renderSection("Contact", pairList(model.nextDose.contactLines))
    : "";

  const patientName =
    model.identity.find((row) => row.label === "PATIENT")?.value ?? "";
  const patientDob = model.identity.find((row) => row.label === "DOB")?.value ?? "";
  const complex = model.timeline.length > 2 || Boolean(model.documentSubtitle);
  const continuation = complex
    ? `<header class="avs2-continuation">` +
      `<h2>After Visit Summary - Continued</h2>` +
      `<span>${escapeHtml(patientName)} - DOB ${escapeHtml(patientDob)}</span>` +
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

  const guidance =
    `<div class="avs2-guidance">${model.blocks.map(renderBlock).join("")}</div>` +
    renderAlert(model.emergency);

  // The spine is the record of what was given and when, so model.administration
  // is not drawn a second time here; its dose-specific note rides with the step
  // it belongs to.
  return (
    `<article class="avs2${complex ? " avs2-complex" : ""}" aria-labelledby="avs-document-title">` +
    `<div class="avs2-page avs2-page-primary">` +
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
    model.leadAlerts.map(renderAlert).join("") +
    `<section class="avs2-overview" aria-labelledby="avs-treatment-summary">` +
    `<h2 class="avs2-overview-title" id="avs-treatment-summary">Treatment summary</h2>` +
    renderSpine(
      model.timeline,
      model.administrationNote,
      model.nextDose.instruction,
    ) +
    `</section>` +
    contact +
    (complex ? "" : guidance) +
    renderFooter(1, complex ? 2 : 1) +
    `</div>` +
    (complex
      ? `<div class="avs2-page avs2-page-continuation">` +
        continuation +
        guidance +
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
