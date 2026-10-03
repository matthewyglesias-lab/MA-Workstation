import { cloneElement, isValidElement, type ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { Patient, Lot, Activity, Movement } from "../shared/contracts.js";
export type Editor = {
  kind: "patient" | "activity" | "product" | "lot" | "movement" | "handoff";
  patient?: Patient;
  lot?: Lot;
  activity?: Activity;
  original?: Movement;
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    Injections:
      "m16 3 5 5m-3-7-5 5m-2-1 8 8m-6-6-9 9v4h4l9-9m-9 4 3 3M4 20l-2 2",
    Today: "M3 5h18v16H3z M7 3v4m10-4v4M3 11h18",
    Patients:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8m6 9v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    Work: "M9 4h6v4H9z M9 6H5v15h14V6h-4 M8 13h8m-8 4h5",
    Inventory: "m3 7 9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4m-9 4v10",
    Manage: "M4 7h16M4 17h16M8 4v6m8 4v6",
    search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    plus: "M12 5v14M5 12h14",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    check: "m5 12 4 4L19 6",
    close: "m6 6 12 12M6 18 18 6",
    leaf: "M20 3c-9-1-17 4-15 12s15 7 15-12ZM5 19 15 9",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.Work} />
    </svg>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: ComponentChildren;
  tone?: string;
}) {
  return <span class={`badge ${tone}`}>{children}</span>;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ComponentChildren;
}) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{label}</label>
      {isValidElement(children) ? cloneElement(children, { id }) : children}
    </div>
  );
}
export function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
export function ErrorText({ error }: { error: string }) {
  return error ? (
    <div role="alert" class="error">
      {error}
    </div>
  ) : null;
}
