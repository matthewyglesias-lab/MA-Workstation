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
  transactionCode,
  onChoose,
  onDismiss,
}: {
  transaction: WorkstationLookupTransaction;
  transactionCode: string;
  onChoose: (option: WorkstationLookupOption) => void;
  onDismiss: () => void;
}) {
  const [query, setQuery] = useState("");
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
        <header class="cd2004-dialog-titlebar">
          <strong id={titleId}>
            {transactionCode} FIELD LOOKUP · {transaction.fieldCode}
          </strong>
          <button type="button" aria-label="Close field lookup" onClick={onDismiss}>
            ×
          </button>
        </header>

        <div class="cd2004-lookup-context">
          <strong>{transaction.fieldLabel}</strong>
          <span>{transaction.prompt || "Select one of the available local values."}</span>
        </div>

        <div class="cd2004-dialog-body cd2004-lookup-body">
          <label class="cd2004-dialog-field">
            Find value
            <input
              autoFocus
              type="search"
              value={query}
              placeholder="Type to filter the local value table"
              onInput={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusResult(preferredIndex);
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
            <div class="cd2004-lookup-columns" aria-hidden="true">
              <span>#</span>
              <span>Local value</span>
              <span>State</span>
            </div>
            {options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                class={`cd2004-lookup-row ${option.selected ? "is-selected" : ""}`}
                role="option"
                aria-selected={option.selected || undefined}
                onClick={() => onChoose(option)}
                onKeyDown={(event) => {
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
                <span>{String(option.ordinal ?? index + 1).padStart(2, "0")}</span>
                <span>
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
                <span>{option.selected ? "CURRENT" : ""}</span>
              </button>
            ))}
            {!options.length && (
              <div class="cd2004-lookup-empty" role="status">
                NO MATCHING LOCAL VALUES
              </div>
            )}
          </div>
        </div>

        <footer class="cd2004-dialog-actions cd2004-lookup-actions">
          <span>↑↓ MOVE · ENTER SELECT · ESC RETURN</span>
          <span />
          <button type="button" onClick={onDismiss}>
            Cancel
          </button>
        </footer>
      </section>
    </ModalDialog>
  );
}
