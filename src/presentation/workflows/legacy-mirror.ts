/**
 * One-way sync from a migrated workflow's typed state into the still-present
 * (but no longer visible) legacy DOM fields for that workflow. The legacy
 * markup stays loaded — hidden, never mounted into the new shell — purely so
 * the untouched legacy print renderers, activity-log writer, and readiness/
 * note computation keep working exactly as before, fed by the new UI instead
 * of a visible legacy panel. See docs on the workflow migration plan for why
 * this bridge exists instead of rewriting the print pipeline.
 */
export function setLegacyFieldValue(id: string, value: string): void {
  const element = document.getElementById(id) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | null;
  if (!element) return;
  if (element.value === value) return;
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

export function clickLegacyControl(id: string): void {
  document.getElementById(id)?.click();
}
