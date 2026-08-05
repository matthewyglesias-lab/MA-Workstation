import {
  buildInjectionAvsModel,
  type AvsBlock,
  type AvsDataRow,
  type InjectionAvsInput,
  type InjectionAvsModel,
} from "./injection-avs-content";

export type { InjectionAvsInput, InjectionAvsModel } from "./injection-avs-content";

/**
 * Renders the injection After Visit Summary as fixed-pitch clinical
 * paperwork - the "lab report" treatment: a run header, a ruled identity
 * band, dot-leader data rows, ruled section headings, and inverse-video
 * banners reserved for the two or three things that must not be missed.
 *
 * The markup is intentionally plain and self-describing (one `avs2-` class
 * per structural role) so the print stylesheet can control spacing without
 * this module knowing anything about page geometry.
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

/** Right-pads a label with dot leaders so values line up in a fixed pitch. */
const leader = (label: string, width: number): string => {
  const text = label.toUpperCase();
  if (text.length >= width) return text;
  return text + ".".repeat(width - text.length);
};

const renderRows = (rows: readonly AvsDataRow[], width: number): string =>
  rows
    .map(
      (row) =>
        `<div class="avs2-row"><span class="avs2-k">${escapeHtml(
          leader(row.label, width),
        )}</span> <span class="avs2-v">${escapeHtml(row.value)}</span></div>`,
    )
    .join("");

const renderBlockBody = (block: AvsBlock): string => {
  const parts: string[] = [];
  if (block.rows?.length) parts.push(renderRows(block.rows, 16));
  for (const paragraph of block.paragraphs ?? []) {
    parts.push(`<p class="avs2-p">${escapeHtml(paragraph)}</p>`);
  }
  if (block.items?.length) {
    parts.push(
      `<ul class="avs2-ul">${block.items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`,
    );
  }
  return parts.join("");
};

const renderBlock = (block: AvsBlock): string => {
  if (block.emphasis) {
    return (
      `<div class="avs2-alert">` +
      `<div class="avs2-alert-bar">${escapeHtml(block.heading)}</div>` +
      `<div class="avs2-alert-body">${renderBlockBody(block)}</div>` +
      `</div>`
    );
  }
  return (
    `<section class="avs2-sec">` +
    `<h2 class="avs2-h">${escapeHtml(block.heading)}</h2>` +
    `<div class="avs2-b">${renderBlockBody(block)}</div>` +
    `</section>`
  );
};

const renderSchedule = (model: InjectionAvsModel): string => {
  if (!model.schedule.length) return "";
  const rows = model.schedule
    .map(
      (row) =>
        `<tr${row.due ? ' class="is-due"' : ""}>` +
        `<td>${escapeHtml(row.label)}</td>` +
        `<td>${escapeHtml(row.date)}</td>` +
        `<td>${escapeHtml(row.dose)}</td>` +
        `<td>${escapeHtml(row.site)}</td>` +
        `<td>${escapeHtml(row.status)}</td>` +
        `</tr>`,
    )
    .join("");
  const note = model.scheduleNote
    ? `<p class="avs2-p">${escapeHtml(model.scheduleNote)}</p>`
    : "";
  return (
    `<section class="avs2-sec">` +
    `<h2 class="avs2-h">YOUR STARTING SCHEDULE</h2>` +
    `<div class="avs2-b">` +
    `<table class="avs2-table"><thead><tr>` +
    `<th>STEP</th><th>DATE</th><th>DOSE</th><th>SITE</th><th>STATUS</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>${note}` +
    `</div></section>`
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
  const identityLeft = model.identity.slice(0, 3);
  const identityRight = model.identity.slice(3);

  const subtitle = model.documentSubtitle
    ? `<div class="avs2-subtitle">*** ${escapeHtml(model.documentSubtitle)} ***</div>`
    : "";

  const nextNotes = model.nextDose.notes
    .map((note) => `<p class="avs2-p">${escapeHtml(note)}</p>`)
    .join("");

  const nextBlock =
    `<div class="avs2-next avs2-next-${escapeHtml(model.nextDose.firmness)}">` +
    `<div class="avs2-next-h">&gt;&gt; ${escapeHtml(model.nextDose.heading)}</div>` +
    (model.nextDose.dateLong
      ? `<div class="avs2-date">${escapeHtml(model.nextDose.dateLong.toUpperCase())}</div>`
      : "") +
    `<div class="avs2-date-sub">${escapeHtml(model.nextDose.instruction)}</div>` +
    `<div class="avs2-next-foot">${nextNotes}` +
    renderRows(model.nextDose.contactLines, 18) +
    `</div></div>`;

  const adminNote = model.administrationNote
    ? `<p class="avs2-p">${escapeHtml(model.administrationNote)}</p>`
    : "";

  return (
    `<div class="avs2">` +
    `<div class="avs2-run">` +
    `<div><span>${escapeHtml(chrome.facilityName)}</span><span>${escapeHtml(
      chrome.facilityUnit,
    )}</span><span>TEL ${escapeHtml(chrome.clinicPhone)}</span></div>` +
    `<div><span>PAGE 1 OF 1</span><span>RUN&nbsp; ${escapeHtml(
      chrome.runStamp,
    )}</span><span>RPT&nbsp; ${escapeHtml(chrome.reportId)}</span></div>` +
    `</div>` +
    `<div class="avs2-title">${escapeHtml(model.documentTitle)}</div>` +
    subtitle +
    `<div class="avs2-id">` +
    `<div>${renderRows(identityLeft, 12)}</div>` +
    `<div>${renderRows(identityRight, 12)}</div>` +
    `</div>` +
    model.leadAlerts.map(renderBlock).join("") +
    nextBlock +
    renderSchedule(model) +
    `<section class="avs2-sec"><h2 class="avs2-h">WHAT YOU RECEIVED TODAY</h2>` +
    `<div class="avs2-b">${renderRows(model.administration, 16)}${adminNote}</div></section>` +
    model.blocks.map(renderBlock).join("") +
    renderBlock(model.emergency) +
    `<div class="avs2-foot">` +
    `<span>${escapeHtml(chrome.formId)}</span>` +
    `<span>${escapeHtml(
      [model.identity[0]?.value, model.identity[3]?.value].filter(Boolean).join(" - "),
    )}</span>` +
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
