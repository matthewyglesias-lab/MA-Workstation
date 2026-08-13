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

/**
 * A section on the page grid: heading in the gutter, content in the wide
 * column. The gutter label is allowed to wrap - a two- or three-line
 * right-aligned label is the marginalia device working as intended, not an
 * overflow.
 */
const renderSection = (heading: string, body: string): string =>
  `<section class="avs2-sec">` +
  `<div class="avs2-lab">${escapeHtml(heading)}</div>` +
  `<div class="avs2-rail"></div>` +
  `<div class="avs2-b">${body}</div>` +
  `</section>`;

/**
 * Alerts break the grid on purpose. Spanning the full measure over a heavy rule
 * is what separates them from ordinary sections once the inverse-video bars are
 * gone, and it keeps long safety headings ("EMERGENCY - CALL 911 OR GO TO THE
 * NEAREST ER NOW IF") out of a narrow gutter that would wrap them to four lines.
 */
const renderAlert = (block: AvsBlock): string =>
  `<div class="avs2-alert">` +
  `<div class="avs2-alert-bar">${escapeHtml(block.heading)}</div>` +
  `<div class="avs2-alert-body">${renderBlockBody(block)}</div>` +
  `</div>`;

const renderBlock = (block: AvsBlock): string =>
  block.emphasis
    ? renderAlert(block)
    : renderSection(block.heading, renderBlockBody(block));

/**
 * One node on the spine: date in the gutter, marker on the rail, step body.
 *
 * `instruction` is the model's imperative for the due step ("PLEASE COME IN ON
 * THIS DAY", or "NOT YET SCHEDULED" when no date is documented). It rides above
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
    `<div class="avs2-step avs2-step-${escapeHtml(step.state)}">` +
    `<div class="${whenClass}">${when}${whenNote}</div>` +
    `<div class="avs2-rail"><i class="avs2-node"></i></div>` +
    `<div class="${bodyClass}">` +
    `<div class="avs2-step-title">${escapeHtml(step.title)}</div>` +
    (instruction
      ? `<div class="avs2-step-instr">${escapeHtml(instruction)}</div>`
      : "") +
    paragraphs(step.detail) +
    `</div></div>`
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
      const isDue = step.state === "due";
      const detail =
        step.state === "given" && administrationNote
          ? [...step.detail, administrationNote]
          : step.detail;
      return renderStep({ ...step, detail }, isDue ? instruction : "");
    })
    .join("");
  return `<div class="avs2-spine">${steps}</div>`;
};

/** The tier-3 record run: small, quiet, and deliberately last. */
const renderRecord = (identity: readonly AvsDataRow[]): string =>
  `<div class="avs2-id">` +
  identity
    .filter((row) => String(row.value ?? "").trim())
    .map(
      (row) =>
        `<span class="avs2-id-pair">` +
        `<span class="avs2-id-k">${escapeHtml(row.label)}</span> ` +
        `<span class="avs2-id-v">${escapeHtml(row.value)}</span>` +
        `</span>`,
    )
    .join("") +
  `</div>`;

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

  // The spine is the record of what was given and when, so model.administration
  // is not drawn a second time here; its dose-specific note rides with the step
  // it belongs to.
  return (
    `<div class="avs2">` +
    `<div class="avs2-run">` +
    `<div><span class="avs2-run-name">${escapeHtml(chrome.facilityName)}</span>` +
    `<span>${escapeHtml(chrome.facilityUnit)}</span>` +
    `<span>TEL ${escapeHtml(chrome.clinicPhone)}</span></div>` +
    `<div><span>PAGE 1 OF 1</span>` +
    `<span>RUN&nbsp; ${escapeHtml(chrome.runStamp)}</span>` +
    `<span>RPT&nbsp; ${escapeHtml(chrome.reportId)}</span></div>` +
    `</div>` +
    `<div class="avs2-title">${escapeHtml(model.documentTitle)}</div>` +
    subtitle +
    model.leadAlerts.map(renderAlert).join("") +
    renderSpine(
      model.timeline,
      model.administrationNote,
      model.nextDose.instruction,
    ) +
    contact +
    model.blocks.map(renderBlock).join("") +
    renderAlert(model.emergency) +
    renderRecord(model.identity) +
    `<div class="avs2-foot">` +
    `<span>${escapeHtml(chrome.formId)}</span>` +
    `<span>END OF DOCUMENT</span>` +
    `</div>` +
    `</div>`
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
