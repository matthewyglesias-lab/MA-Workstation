/**
 * The workstation's single-choice control.
 *
 * Extracted from WorkflowField so controls that compose it - ProviderField and
 * anything after it - can import it without forming an import cycle with the
 * field wrapper that also has to recognize them. WorkflowField re-exports it,
 * so existing call sites are unaffected.
 */

export interface OptionListProps<T extends string> {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ key: T; label: string; description?: string }>;
  placeholder?: string;
  inline?: boolean;
  labelledBy?: string;
  /** Used only when no labelledBy is available, so the control is never nameless. */
  ariaLabel?: string;
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
  ariaLabel,
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
        aria-label={labelledBy ? undefined : ariaLabel}
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
