import { InjectionRecordRepository } from "../persistence/injection-records";
import { browserSafeStorage } from "../persistence/storage";

/**
 * Column headers and click-to-sort for the injection record selection window.
 *
 * The window's markup is still produced by the legacy runtime, which rewrites
 * `#recordsDrawerResults.innerHTML` on every change. Rather than patch that
 * render, this installs a header row as a *sibling* of the results container -
 * a node legacy never touches - and re-applies the active sort whenever the
 * rows are replaced.
 *
 * Sorting reads the typed record store, not the rendered text: the "Last
 * activity" cell is a formatted string ("Locked Aug 2, 8:03 AM"), and sorting
 * those as text orders them alphabetically by month name. The repository has
 * the real timestamps.
 */

type SortKey = "patient" | "medication" | "activity";
type SortDirection = "asc" | "desc";

interface ColumnSpec {
  key: SortKey;
  label: string;
}

const COLUMNS: ColumnSpec[] = [
  { key: "patient", label: "Patient" },
  { key: "medication", label: "Medication" },
  { key: "activity", label: "Last activity" },
];

interface SortState {
  key: SortKey;
  direction: SortDirection;
}

// Newest first is what a records list opens on: the encounter you were just
// working in is the one you almost always want back.
let sort: SortState = { key: "activity", direction: "desc" };

const recordTimestamp = (record: { updatedAt?: unknown; createdAt?: unknown }): number => {
  const value = String(record.updatedAt ?? record.createdAt ?? "");
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const readRecordIndex = (): Map<string, { activity: number }> => {
  const index = new Map<string, { activity: number }>();
  const result = new InjectionRecordRepository(browserSafeStorage()).list();
  if (!result.ok) return index;
  for (const record of result.value) {
    index.set(String(record.id), { activity: recordTimestamp(record) });
  }
  return index;
};

const cellText = (row: Element, selector: string): string =>
  (row.querySelector(selector)?.textContent ?? "").trim().toLocaleLowerCase();

function applySort(results: HTMLElement): void {
  const rows = [...results.querySelectorAll<HTMLElement>(".records-drawer-row")];
  if (rows.length < 2) return;

  const index = sort.key === "activity" ? readRecordIndex() : null;
  const direction = sort.direction === "asc" ? 1 : -1;

  const sorted = [...rows].sort((a, b) => {
    if (index) {
      const left = index.get(a.dataset.recordsOpen ?? "")?.activity ?? 0;
      const right = index.get(b.dataset.recordsOpen ?? "")?.activity ?? 0;
      if (left !== right) return (left - right) * direction;
      return 0;
    }
    const selector =
      sort.key === "patient" ? ".records-drawer-row-title" : ".records-drawer-row-summary";
    return cellText(a, selector).localeCompare(cellText(b, selector)) * direction;
  });

  // Only touch the DOM when the order actually changed, so re-applying after a
  // legacy re-render is a no-op in the common case.
  if (sorted.every((row, position) => row === rows[position])) return;
  for (const row of sorted) results.append(row);
}

function syncHeaderState(header: HTMLElement): void {
  for (const button of header.querySelectorAll<HTMLElement>("[data-records-sort]")) {
    const active = button.dataset.recordsSort === sort.key;
    button.setAttribute(
      "aria-sort",
      active ? (sort.direction === "asc" ? "ascending" : "descending") : "none",
    );
    button.classList.toggle("is-sorted", active);
    button.classList.toggle("is-desc", active && sort.direction === "desc");
  }
}

function buildHeader(results: HTMLElement): HTMLElement {
  const header = document.createElement("div");
  header.className = "records-drawer-columns";
  header.setAttribute("role", "row");

  for (const column of COLUMNS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.recordsSort = column.key;
    button.setAttribute("role", "columnheader");
    button.textContent = column.label;
    button.addEventListener("click", () => {
      sort =
        sort.key === column.key
          ? { key: column.key, direction: sort.direction === "asc" ? "desc" : "asc" }
          : // Names read A-Z first; a date column is far more useful newest-first.
            { key: column.key, direction: column.key === "activity" ? "desc" : "asc" };
      syncHeaderState(header);
      applySort(results);
    });
    header.append(button);
  }

  syncHeaderState(header);
  return header;
}

function install(layer: HTMLElement): void {
  const results = layer.querySelector<HTMLElement>("#recordsDrawerResults");
  if (!results || layer.querySelector(".records-drawer-columns")) return;

  results.before(buildHeader(results));
  applySort(results);

  // Legacy replaces the results' innerHTML on search, filter, save and delete.
  // The header survives (it is a sibling), but the row order does not.
  new MutationObserver(() => applySort(results)).observe(results, { childList: true });
}

export function installRecordsWindowEnhancements(): void {
  if (typeof document === "undefined") return;

  const existing = document.querySelector<HTMLElement>(".records-drawer-layer");
  if (existing) {
    install(existing);
    return;
  }

  // The layer is created lazily the first time the window is opened.
  const observer = new MutationObserver(() => {
    const layer = document.querySelector<HTMLElement>(".records-drawer-layer");
    if (!layer) return;
    observer.disconnect();
    install(layer);
  });
  observer.observe(document.body, { childList: true });
}
