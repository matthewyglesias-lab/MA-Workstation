/** One owner for non-modal dismissal. Clinical dialogs keep the native top layer.
 * No encounter state, timers, mutation observers or document queries per field.
 */
export type DismissReason = "outside" | "escape" | "superseded";
export interface DismissibleLayer {
  readonly id: object;
  contains(target: EventTarget | null): boolean;
  dismiss(reason: DismissReason): void;
}

export function createDismissalOwner(target: EventTarget, modalOpen: () => boolean) {
  const active = new Map<object, DismissibleLayer>();
  let listening = false;
  let activation = 0;
  const remove = (id: object) => {
    active.delete(id);
    if (!active.size && listening) {
      target.removeEventListener("pointerdown", outside);
      target.removeEventListener("focusin", outside);
      target.removeEventListener("keydown", escape);
      listening = false;
    }
  };
  const dismiss = (layer: DismissibleLayer, reason: DismissReason) => {
    // Remove synchronously, before callers set state or hand off focus. A second
    // event in the same task cannot dismiss or invoke this layer a second time.
    remove(layer.id);
    layer.dismiss(reason);
  };
  const outside = (event: Event) => {
    for (const layer of [...active.values()].reverse()) {
      if (!layer.contains(event.target)) dismiss(layer, "outside");
    }
  };
  const escape = (event: Event) => {
    const key = event as KeyboardEvent;
    if (key.defaultPrevented || key.isComposing || key.key !== "Escape" || modalOpen()) return;
    const layer = [...active.values()].at(-1);
    if (!layer) return;
    key.preventDefault();
    key.stopPropagation();
    dismiss(layer, "escape");
  };
  return {
    activate(layer: DismissibleLayer) {
      if (active.has(layer.id)) { active.set(layer.id, layer); return true; }
      const ticket = ++activation;
      // These are independent shell/field popovers, not stacked windows.
      for (const current of [...active.values()]) dismiss(current, "superseded");
      // A dismissal callback may synchronously open another layer. The newest
      // activation wins; never leave two owners registered after re-entry.
      if (ticket !== activation) return false;
      active.set(layer.id, layer);
      if (!listening) {
        target.addEventListener("pointerdown", outside);
        target.addEventListener("focusin", outside);
        target.addEventListener("keydown", escape);
        listening = true;
      }
      return true;
    },
    deactivate: remove,
    get size() { return active.size; },
  };
}
