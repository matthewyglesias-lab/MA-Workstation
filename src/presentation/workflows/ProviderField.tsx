import { useEffect, useState } from "preact/hooks";

import {
  OTHER_PROVIDER_KEY,
  hasProviderRegister,
  providerRegisterOptions,
  resolveProviderDisplay,
  type RegisteredProvider,
} from "../../domain/provider-register";
import { OptionList } from "./OptionList";

/**
 * Provider entry, shared by every field that names an ordering, prescribing,
 * or assigned provider.
 *
 * While the register is empty this renders the same plain text input the
 * fields used before, so an unpopulated roster can never leave staff with a
 * dropdown whose only choice is "Other". Once the register has entries it
 * becomes a lookup with a free-text escape, and the value written to the
 * record is the provider's stable id rather than whatever was typed.
 */

export interface ProviderFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name used when the surrounding field supplies no labelledBy. */
  fallbackLabel?: string;
  disabled?: boolean;
  register?: ReadonlyArray<RegisteredProvider>;
  labelledBy?: string;
  describedBy?: string;
  required?: boolean;
  invalid?: boolean;
}

export function ProviderField({
  value,
  onChange,
  placeholder = "Provider name",
  fallbackLabel = "Provider",
  disabled,
  register,
  labelledBy,
  describedBy,
  required,
  invalid,
}: ProviderFieldProps) {
  const options = providerRegisterOptions(register);
  const registered = options.some((option) => option.key === value);
  // Anything not matching a register id is free text: an "Other" entry, or a
  // record written before the register existed.
  const storedIsFreeText = Boolean(value) && !registered;
  // "Other" has to survive its own empty value. Picking it clears the id, and
  // deriving the mode from the value alone would hide the box on the same
  // render that opened it.
  const [otherSelected, setOtherSelected] = useState(storedIsFreeText);
  const usingOther = storedIsFreeText || otherSelected;

  // A record loaded underneath the field (resumed draft, promoted context)
  // decides the mode again; a registered provider always leaves Other.
  useEffect(() => {
    if (registered) setOtherSelected(false);
    else if (storedIsFreeText) setOtherSelected(true);
  }, [registered, storedIsFreeText]);

  // Samples and Forms build their own field chrome rather than going through
  // WorkflowField, so they pass no labelledBy and their controls have never
  // carried an accessible name. Fall back to an explicit one instead of
  // inheriting that gap.
  const naming = labelledBy
    ? { "aria-labelledby": labelledBy }
    : { "aria-label": fallbackLabel };

  if (!hasProviderRegister(register)) {
    return (
      <input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        {...naming}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        data-provider-field="text"
        onInput={(event) => onChange(event.currentTarget.value)}
      />
    );
  }

  return (
    <div class="wfp-provider-field" data-provider-field="register">
      <OptionList<string>
        name={`provider-${labelledBy ?? "select"}`}
        value={usingOther ? OTHER_PROVIDER_KEY : value}
        onChange={(next) => {
          // Switching to Other clears the id so the text box starts empty
          // rather than inheriting a provider's name as editable text.
          setOtherSelected(next === OTHER_PROVIDER_KEY);
          onChange(next === OTHER_PROVIDER_KEY ? "" : next);
        }}
        options={[...options, { key: OTHER_PROVIDER_KEY, label: "Other…" }]}
        placeholder="Select provider"
        labelledBy={labelledBy}
        ariaLabel={labelledBy ? undefined : fallbackLabel}
        describedBy={describedBy}
        required={required}
        invalid={invalid}
        inline
      />
      {usingOther && (
        <input
          class="wfp-provider-other"
          value={resolveProviderDisplay(value, register)}
          placeholder="Provider not in the register"
          disabled={disabled}
          aria-label="Provider name"
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </div>
  );
}
