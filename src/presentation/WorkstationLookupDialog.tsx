import { DialogHeading } from "./lightfully/DialogHeading";
import { useMemo, useRef, useState } from "preact/hooks";
import { ModalDialog } from "./ModalDialog";

export interface WorkstationLookupOption {
  value: string;
  label: string;
  description?: string;
  selected?: boolean;
  /** Stable row number from the unfiltered local table. */
  ordinal?: number;
}

export interface WorkstationLookupTransaction {
  control: HTMLSelectElement;
  fieldCode: string;
  fieldLabel: string;
  prompt?: string;
  options: WorkstationLookupOption[];
}

export function WorkstationLookupDialog({
  transaction,
  onChoose,
  onDismiss,
}: {
  transaction: WorkstationLookupTransaction;
  onChoose: (option: WorkstationLookupOption) => void;
  onDismiss: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [focusedValue, setFocusedValue] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const titleId = "cd2004FieldLookupTitle";
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const options = useMemo(
    () =>
      transaction.options.filter((option) => {
        if (!normalizedQuery) return true;
        return `${option.label} ${option.description ?? ""}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      }),
    [normalizedQuery, transaction.options],
  );
  const preferredIndex = normalizedQuery
    ? 0
    : Math.max(
        0,
        options.findIndex((option) => option.selected),
      );
  const preferredOption = options[preferredIndex];
  const focusedIndex = options.findIndex(option => option.value === focusedValue);
  const tabIndex = focusedIndex >= 0 ? focusedIndex : preferredIndex;
  const resetQuery = () => { setQuery(""); setFocusedValue(null); searchRef.current?.focus(); };

  const focusResult = (index: number) => {
    const rows = Array.from(
      resultsRef.current?.querySelectorAll<HTMLButtonElement>(
        ".cd2004-lookup-row:not(:disabled)",
      ) ?? [],
    );
    if (!rows.length) return;
    rows[(index + rows.length) % rows.length]?.focus();
  };

  return (
    <ModalDialog
      class="cd2004-dialog-layer cd2004-lookup-dialog cd2004-print-exclude"
      labelledBy={titleId}
      onDismiss={onDismiss}
    >
      <section class="cd2004-dialog-frame" data-field-lookup-dialog>
        <DialogHeading id={titleId} title={transaction.fieldLabel || transaction.fieldCode} description="Search the available options, then choose a value." closeLabel="Close field lookup" onClose={onDismiss} />
        <div class="cd2004-lookup-context lf-sr-only"><strong>{transaction.fieldCode}</strong><span>{transaction.prompt}</span></div>

        <div class="cd2004-dialog-body cd2004-lookup-body">
          <label class="cd2004-dialog-field">
            Search options
            <input
              ref={searchRef}
              autoFocus
              type="search"
              value={query}
              placeholder="Search available options"
              onInput={(event) => { setQuery(event.currentTarget.value); setFocusedValue(null); }}
              onKeyDown={(event) => {
                if (event.isComposing) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusResult(preferredIndex);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  focusResult(options.length - 1);
                } else if (event.key === "Enter" && preferredOption) {
                  event.preventDefault();
                  onChoose(preferredOption);
                }
              }}
            />
          </label>

          <div
            ref={resultsRef}
            class="cd2004-lookup-results"
            role="listbox"
            aria-label={`Available values for ${transaction.fieldLabel}`}
          >
            {options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                class={`cd2004-lookup-row ${option.selected ? "is-selected" : ""}`}
                role="option"
                tabIndex={index === tabIndex ? 0 : -1}
                onFocus={() => setFocusedValue(option.value)}
                aria-selected={option.selected || undefined}
                onClick={() => onChoose(option)}
                onKeyDown={(event) => {
                  if (event.isComposing) return;
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    focusResult(index + 1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    focusResult(index - 1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    focusResult(0);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    focusResult(options.length - 1);
                  }
                }}
              >
                <span>
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
                <span class="lf-lookup-selected">{option.selected ? "Selected" : ""}</span>
              </button>
            ))}
            {!options.length && (
              <div class="cd2004-lookup-empty" role="status">
                <p>No matching options. Your current field value has not changed.</p>
                <button type="button" class="lf-lookup-reset" onClick={resetQuery}>Clear search</button>
              </div>
            )}
          </div>
        </div>

        <footer class="cd2004-dialog-actions cd2004-lookup-actions">
          <span>Use ↑↓ to move, Enter to select, or Escape to close.</span>
          <span />
          <button type="button" onClick={onDismiss}>
            Cancel
          </button>
        </footer>
      </section>
    </ModalDialog>
  );
}
