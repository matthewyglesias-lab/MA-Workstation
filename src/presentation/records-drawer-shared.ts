/**
 * Shared behavior for the two native-<dialog> record-list windows
 * (RecordsWindow for Injection, UdsRecordsWindow for UDS): the Tab-key
 * focus wraparound native <dialog> doesn't supply in Chromium, plus the
 * row-formatting helpers both windows need for their activity columns.
 */

/**
 * showModal() inerts the background but does not cycle focus: in Chromium,
 * Shift+Tab from the first control lands on <body>, outside the dialog. The
 * platform gives containment, not wrapping, so the wrap is ours to add.
 *
 * Escape is left to the dialog itself. Stopping propagation here matters:
 * the shell has a document-level Escape binding that closes an open menu and
 * pulls focus back to that menu's title, which otherwise fires as this
 * window closes and steals the focus restore out from under it.
 */
export function trapDialogTabKey(dialog: HTMLDialogElement | null, event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.stopPropagation();
    return;
  }
  if (event.key !== "Tab" || !dialog) return;
  const focusable = [
    ...dialog.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((node) => !node.hasAttribute("disabled") && node.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export const timeOf = (value: unknown): number => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** Matches legacy's `stamp()` output: "Aug 2, 9:41 AM". */
export const stamp = (value: unknown): string => {
  const at = timeOf(value);
  if (!at) return "—";
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const addendaCount = (record: { addenda?: unknown[] }): number =>
  Array.isArray(record.addenda) ? record.addenda.length : 0;

/** Legacy searched the whole record; keep that so results do not narrow. */
export const searchText = (record: unknown): string =>
  JSON.stringify(record).toLocaleLowerCase();
