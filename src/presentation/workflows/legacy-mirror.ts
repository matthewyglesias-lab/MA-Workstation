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
  dispatchCompatibilityProjectionEvent(element, "input");
  dispatchCompatibilityProjectionEvent(element, "change");
}

export function setLegacyCheckboxValue(id: string, checked: boolean): void {
  const element = document.getElementById(id) as HTMLInputElement | null;
  if (!element) return;
  if (element.checked === checked) return;
  element.checked = checked;
  dispatchCompatibilityProjectionEvent(element, "input");
  dispatchCompatibilityProjectionEvent(element, "change");
}

export function clickLegacyControl(id: string): void {
  document.getElementById(id)?.click();
}
const COMPATIBILITY_PROJECTION_EVENT = "ipmgCompatibilityProjection";

type CompatibilityProjectionEvent = Event & {
  [COMPATIBILITY_PROJECTION_EVENT]?: true;
};

function dispatchCompatibilityProjectionEvent(
  element: HTMLElement,
  type: "input" | "change",
): void {
  const event = new Event(type, { bubbles: true }) as CompatibilityProjectionEvent;
  event[COMPATIBILITY_PROJECTION_EVENT] = true;
  element.dispatchEvent(event);
}

export function isCompatibilityProjectionEvent(event: Event): boolean {
  return Boolean((event as CompatibilityProjectionEvent)[COMPATIBILITY_PROJECTION_EVENT]);
}
