import {
  cloneElement,
  isValidElement,
  toChildArray,
  type ComponentChildren,
  type VNode,
} from "preact";
import { useId } from "preact/hooks";
import type {
  WorkflowFieldPresentation,
  WorkflowFieldState,
} from "../../application/workstation-projection";
import { requestWorkstationFieldLookup } from "../workstation-events";
import { RegisterMarkers } from "./ClinicalRegister";
import {
  WorkstationDateField,
  type WorkstationDateMode,
} from "./WorkstationDateField";

export interface OptionListProps<T extends string> {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ key: T; label: string; description?: string }>;
  placeholder?: string;
  inline?: boolean;
  labelledBy?: string;
  describedBy?: string;
  required?: boolean;
  invalid?: boolean;
}

export function OptionList<T extends string>({
  name,
  value,
  onChange,
  options,
  placeholder,
  inline,
  labelledBy,
  describedBy,
  required,
  invalid,
}: OptionListProps<T>) {
  const selected = options.find((option) => option.key === value);
  return (
    <div class={`wfp-select-group ${inline ? "wfp-select-group-inline" : ""}`}>
      <select
        name={name}
        value={value}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.currentTarget.value as T)}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.key} value={option.key} title={option.description}>
            {option.label}
          </option>
        ))}
      </select>
      {selected?.description && (
        <small class="wfp-select-desc">{selected.description}</small>
      )}
    </div>
  );
}

const registerState = (
  state: WorkflowFieldState,
  incomplete: boolean,
): "REQ" | "OK" | "OPT" | "PEND" | "STOP" | "N/A" => {
  if (incomplete) return "STOP";
  if (state === "required") return "REQ";
  if (state === "optional") return "OPT";
  if (state === "not-applicable") return "N/A";
  return "PEND";
};

/**
 * Recursively associates the first-party control subtree with the visible
 * field caption. This lets the dense workstation keep its compact caption /
 * control grid while exposing a real accessible name to assistive software.
 */
function labelControls(
  children: ComponentChildren,
  accessibility: {
    labelledBy: string;
    describedBy?: string;
    required: boolean;
    invalid: boolean;
  },
): ComponentChildren {
  return toChildArray(children).map((child) => {
    if (!isValidElement(child)) return child;
    const vnode = child as VNode<Record<string, unknown>>;
    if (
      (vnode.type as unknown) === OptionList ||
      (vnode.type as unknown) === WorkstationDateField
    ) {
      return cloneElement(vnode, {
        labelledBy: accessibility.labelledBy,
        describedBy: accessibility.describedBy,
        required: accessibility.required,
        invalid: accessibility.invalid,
      });
    }
    if (typeof vnode.type === "string") {
      const props = vnode.props ?? {};
      if (vnode.type === "input" || vnode.type === "select" || vnode.type === "textarea") {
        return cloneElement(vnode, {
          ...(!props["aria-label"] && !props["aria-labelledby"]
            ? { "aria-labelledby": accessibility.labelledBy }
            : {}),
          ...(accessibility.describedBy && !props["aria-describedby"]
            ? { "aria-describedby": accessibility.describedBy }
            : {}),
          ...(accessibility.required ? { "aria-required": true } : {}),
          ...(accessibility.invalid ? { "aria-invalid": true } : {}),
        });
      }
      if (props.children) {
        return cloneElement(vnode, {
          children: labelControls(props.children as ComponentChildren, accessibility),
        });
      }
    }
    return vnode;
  });
}

function containsSelectControl(children: ComponentChildren): boolean {
  return toChildArray(children).some((child) => {
    if (!isValidElement(child)) return false;
    const vnode = child as VNode<Record<string, unknown>>;
    if ((vnode.type as unknown) === OptionList || vnode.type === "select") return true;
    return typeof vnode.type === "string" && vnode.props?.children
      ? containsSelectControl(vnode.props.children as ComponentChildren)
      : false;
  });
}

function findDateControl(children: ComponentChildren): WorkstationDateMode | undefined {
  let found: WorkstationDateMode | undefined;
  toChildArray(children).forEach((child) => {
    if (found || !isValidElement(child)) return;
    const vnode = child as VNode<Record<string, unknown>>;
    if ((vnode.type as unknown) === WorkstationDateField) {
      found = (vnode.props?.mode as WorkstationDateMode) ?? "date";
      return;
    }
    if (typeof vnode.type === "string" && vnode.props?.children) {
      found = findDateControl(vnode.props.children as ComponentChildren);
    }
  });
  return found;
}

export function WorkflowField({
  label,
  hint,
  field,
  width,
  prompt,
  presentation,
  incomplete = false,
  children,
}: {
  label: string;
  hint?: string;
  field?: string;
  width?: "date" | "short";
  prompt?: string;
  presentation: WorkflowFieldPresentation;
  incomplete?: boolean;
  children: ComponentChildren;
}) {
  const generatedId = useId();
  const labelId = `${generatedId}-label`;
  if (presentation.state === "not-applicable") return null;

  const required = presentation.state === "required";
  const optional = presentation.state === "optional";
  const pending = presentation.state === "pending-context";
  const state = registerState(presentation.state, incomplete);
  const changed = presentation.changed || presentation.source === "OVR";
  const detail = presentation.detail || hint;
  const detailId = detail ? `${generatedId}-detail` : undefined;
  const labelledChildren = labelControls(children, {
    labelledBy: labelId,
    describedBy: detailId,
    required,
    invalid: incomplete,
  });
  const hasLookup = containsSelectControl(children);
  const dateMode = findDateControl(children);
  const fieldPrompt =
    prompt ??
    (hasLookup
      ? `Select ${label.toLowerCase()} or press F9 for available values`
      : dateMode
        ? `Enter ${label.toLowerCase()} as ${
            dateMode === "date" ? "MMDDYY" : "MMDDYY HHMM"
          } — T today, T-1 yesterday${dateMode === "datetime" ? ", N now" : ""}`
        : `Enter ${label.toLowerCase()}`);

  return (
    <div
      class={`wfp-field ${required ? "is-required" : ""} ${incomplete ? "is-incomplete" : ""} ${optional ? "is-optional" : ""} ${pending ? "is-pending-context" : ""} ${width ? `is-w-${width}` : ""}`}
      data-requirement={presentation.state}
      data-field-code={presentation.fieldCode}
      data-field-label={label}
      data-field-state={state}
      data-field-prompt={fieldPrompt}
      data-field-path={field}
      data-field-changed={changed || undefined}
    >
      <div class="wfp-field-label">
        <span class="wfp-field-caption" id={labelId}>{label}</span>
        {required && <abbr class="wfp-req" title="Required">*</abbr>}
        {optional && <span class="wfp-opt">optional</span>}
        {pending && <span class="wfp-pending">pending context</span>}
        <RegisterMarkers
          source={presentation.source}
          state={state}
          changed={changed}
          changeDetail={presentation.changeDetail}
        />
      </div>
      {hasLookup ? (
        <div class="wfp-field-entry">
          {labelledChildren}
          <button
            type="button"
            class="wfp-field-lookup-button"
            aria-label={`Open ${label} field lookup (F9)`}
            title={`Open ${label} field lookup (F9)`}
            onClick={(event) => {
              const select = event.currentTarget
                .closest<HTMLElement>(".wfp-field")
                ?.querySelector<HTMLSelectElement>("select:not(:disabled)");
              if (!select) return;
              select.focus({ preventScroll: true });
              requestWorkstationFieldLookup(select);
            }}
          >
            …
          </button>
        </div>
      ) : (
        labelledChildren
      )}
      {detail && <span class="wfp-field-hint" id={detailId}>{detail}</span>}
    </div>
  );
}
