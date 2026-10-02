import { useLayoutEffect, useRef } from "preact/hooks";
import { createDismissalOwner, type DismissReason } from "./dismissal-owner";

const owners = new WeakMap<Document, ReturnType<typeof createDismissalOwner>>();
function ownerFor(doc: Document) {
  let owner = owners.get(doc);
  if (!owner) {
    owner = createDismissalOwner(doc, () => Boolean(doc.querySelector("dialog[open]")));
    owners.set(doc, owner);
  }
  return owner;
}

/** All shell popovers use this owner. Listeners exist only while one is open;
 * callbacks stay current without rebinding global listeners on each keystroke.
 */
export function useDismissibleLayer(host: { current: HTMLElement | null }, onDismiss: (reason: DismissReason) => void) {
  const id = useRef({});
  const latestDismiss = useRef(onDismiss);
  latestDismiss.current = onDismiss;
  const owner = useRef<ReturnType<typeof createDismissalOwner> | null>(null);
  const deactivate = () => owner.current?.deactivate(id.current);
  useLayoutEffect(() => deactivate, []);
  // A field-information component can remain mounted while rendering null.
  // Release its old host too; do not wait for a future pointer event to clean up.
  useLayoutEffect(() => { if (!host.current) deactivate(); });
  return {
    deactivate,
    activate() {
      const element = host.current;
      if (!element) return false;
      const nextOwner = ownerFor(element.ownerDocument);
      owner.current = nextOwner;
      return nextOwner.activate({
        id: id.current,
        contains: target => target instanceof Node && element.contains(target),
        dismiss: reason => latestDismiss.current(reason),
      });
    },
  };
}

/** Native details retains its built-in keyboard/click semantics. This hook only
 * coordinates open ownership, outside dismissal and focus restoration.
 */
export function useDisclosureLayer(host: { current: HTMLDetailsElement | null }) {
  const layer = useDismissibleLayer(host, reason => close(reason === "escape"));
  const close = (restoreFocus = false) => {
    layer.deactivate();
    if (!host.current?.open) return;
    host.current.open = false;
    if (restoreFocus) host.current.querySelector<HTMLElement>(":scope > summary")?.focus({ preventScroll: true });
  };
  const open = () => {
    if (!layer.activate()) return false;
    if (host.current) host.current.open = true;
    return true;
  };
  return {
    close, open,
    onToggle: () => {
      if (host.current?.open) { if (!layer.activate()) host.current.open = false; }
      else layer.deactivate();
    },
    onSummaryClick: (event: Event) => {
      if (!host.current?.open) { if (!layer.activate()) event.preventDefault(); }
      else layer.deactivate();
    },
  };
}
