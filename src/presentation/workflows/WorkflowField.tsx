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
import { hasProviderRegister } from "../../domain/provider-register";
import { OptionList, type OptionListProps } from "./OptionList";
import { ProviderField } from "./ProviderField";
import {
  WorkstationDateField,
  type WorkstationDateMode,
} from "./WorkstationDateField";

export { OptionList };
export type { OptionListProps };

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
      (vnode.type as unknown) === WorkstationDateField ||
      (vnode.type as unknown) === ProviderField
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

/**
 * Walks the control subtree, returning the first non-undefined result.
 *
 * Both questions the field asks about its children - "is this a lookup?" and
 * "is this a date field?" - are the same depth-first walk over the same
 * intrinsic-element nesting. One traversal keeps them from drifting as more
 * first-party controls are added.
 */
function findInControls<T>(
  children: ComponentChildren,
  visit: (vnode: VNode<Record<string, unknown>>) => T | undefined,
): T | undefined {
  for (const child of toChildArray(children)) {
    if (!isValidElement(child)) continue;
    const vnode = child as VNode<Record<string, unknown>>;
    const hit = visit(vnode);
    if (hit !== undefined) return hit;
    if (typeof vnode.type === "string" && vnode.props?.children) {
      const nested = findInControls(vnode.props.children as ComponentChildren, visit);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

/**
 * True when the field's control offers a fixed value set, which is what earns
 * it the F9 lookup. ProviderField only qualifies when its register can actually
 * drive a list; with an empty roster it renders free text.
 */
function containsSelectControl(children: ComponentChildren): boolean {
  return (
    findInControls(children, (vnode) => {
      if ((vnode.type as unknown) === OptionList || vnode.type === "select") return true;
      if ((vnode.type as unknown) === ProviderField) {
        return hasProviderRegister(
          vnode.props?.register as Parameters<typeof hasProviderRegister>[0],
          { prescribersOnly: Boolean(vnode.props?.prescribersOnly) },
        ) || undefined;
      }
      return undefined;
    }) ?? false
  );
}

/**
 * The value of the field's own control, used to decide whether a required field
 * still needs an answer. Read from the control's `value` prop rather than the
 * DOM so it is correct on the first render, and independent of whether the
 * control sits directly under the field or inside a wrapper.
 *
 * A checkbox carries no `value` worth testing, so those fields are left alone -
 * their state is the checked flag, which the engine already tracks.
 */
function isControlFilled(children: ComponentChildren): boolean {
  return (
    findInControls(children, (vnode) => {
      const props = vnode.props ?? {};
      const isFirstParty =
        (vnode.type as unknown) === OptionList ||
        (vnode.type as unknown) === WorkstationDateField ||
        (vnode.type as unknown) === ProviderField;
      const isIntrinsic =
        vnode.type === "input" || vnode.type === "select" || vnode.type === "textarea";
      if (!isFirstParty && !isIntrinsic) return undefined;
      if (isIntrinsic && props.type === "checkbox") return undefined;
      if (!("value" in props)) return undefined;
      const value = props.value;
      return typeof value === "string" ? value.trim().length > 0 : value != null;
    }) ?? false
  );
}

function findDateControl(children: ComponentChildren): WorkstationDateMode | undefined {
  return findInControls(children, (vnode) =>
    (vnode.type as unknown) === WorkstationDateField
      ? ((vnode.props?.mode as WorkstationDateMode) ?? "date")
      : undefined,
  );
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
  const filled = isControlFilled(children);
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
      class={`wfp-field ${required ? "is-required" : ""} ${filled ? "is-filled" : ""} ${incomplete ? "is-incomplete" : ""} ${optional ? "is-optional" : ""} ${pending ? "is-pending-context" : ""} ${width ? `is-w-${width}` : ""}`}
      data-requirement={presentation.state}
      data-field-code={presentation.fieldCode}
      data-field-label={label}
      data-field-state={state}
      // Provenance stays readable to tests and assistive tooling even where the
      // chip is now silent, so dropping the decoration costs no contract.
      data-field-source={presentation.source}
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
