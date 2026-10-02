import { useRef } from "preact/hooks";
import { outsideRect } from "./interaction-policy";

/** Light dismissal requires one primary-pointer gesture entirely on the backdrop.
 * An interior click, scrollbar gesture, or text-selection drag cannot dismiss.
 * The current guard is consulted at click time, including pending-save guards.
 */
export function useBackdropDismiss(onDismiss: () => void, enabled = true) {
  const start = useRef<number | null>(null);
  const isBackdrop = (event: MouseEvent | PointerEvent) => {
    const dialog = event.currentTarget;
    if (!(dialog instanceof HTMLDialogElement) || event.target !== dialog) return false;
    const surface = dialog.querySelector<HTMLElement>(":scope > .cd2004-dialog-frame") ?? dialog;
    return outsideRect(event, surface.getBoundingClientRect());
  };
  return {
    onPointerDown: (event: PointerEvent) => {
      start.current = event.button === 0 && event.isPrimary !== false && isBackdrop(event)
        ? event.pointerId : null;
    },
    onPointerCancel: () => { start.current = null; },
    onClick: (event: MouseEvent) => {
      const pointer = event as PointerEvent;
      const samePointer = typeof pointer.pointerId !== "number" || pointer.pointerId === start.current;
      const dismiss = enabled && start.current !== null && samePointer && isBackdrop(event);
      start.current = null;
      if (dismiss) onDismiss();
    },
  };
}
