import { useMemo, useState } from "preact/hooks";
import "../workflow-panels.css";
import {
  KNOWLEDGE_CATEGORIES,
  allKnowledgeEntries,
  searchKnowledgeEntries,
  type KnowledgeCategory,
  type KnowledgeEntry,
  type KnowledgeRow,
} from "../../../domain/knowledge-catalog";

function EntryRow({ row }: { row: KnowledgeRow }) {
  if (row.kind === "list") {
    return (
      <div class="wfp-field">
        <label>{row.label}</label>
        <ul class="wfp-field-hint" style="margin:0;padding-left:14px;list-style:disc;">
          {row.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (row.kind === "facts") {
    return (
      <div class="wfp-field">
        <label>{row.label}</label>
        <div class="wfp-row">
          {row.items.map((item) => (
            <div key={item.term}>
              <div class="wfp-option-title">{item.term}</div>
              <div class="wfp-option-desc">{item.detail}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div class="wfp-field">
      <label>{row.label}</label>
      <p class="wfp-field-hint" style="margin:0;">
        {row.value}
      </p>
    </div>
  );
}

/**
 * Knowledge has no encounter, no domain engine, and no print output - it's
 * a static searchable reference. This panel binds directly to
 * allKnowledgeEntries()/searchKnowledgeEntries() (domain/knowledge-catalog.ts)
 * with plain local UI state.
 */
export function KnowledgePanel() {
  const [category, setCategory] = useState<KnowledgeCategory>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entries = useMemo(() => allKnowledgeEntries(), []);
  const results = useMemo(
    () => searchKnowledgeEntries(entries, category, query),
    [entries, category, query],
  );
  const selected = results.find((entry) => entry.id === selectedId) ?? results[0] ?? null;

  return (
    <div class="wfp-panel cd2004-print-exclude" tabIndex={-1}>
      <div class="wfp-summary-bar">
        <strong>Knowledge base</strong>
        <span class="wfp-status-flag is-idle">{results.length} entries</span>
        <span class="wfp-summary-spacer" />
      </div>

      <p class="wfp-field-hint">
        Fast MA-facing reference for injections, UDS, oral samples, TMS setup, and common psych-office safety
        reminders. Designed for handoff support — not a replacement for the prescriber, protocol, package insert,
        or lab policy.
      </p>

      <div class="wfp-tabbar" role="tablist">
        {KNOWLEDGE_CATEGORIES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            class="wfp-tab"
            aria-selected={category === entry.key}
            onClick={() => setCategory(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div class="wfp-tabpanel" role="tabpanel">
        <div class="wfp-section">
          <div class="wfp-section-head">Search</div>
          <div class="wfp-section-body">
            <div class="wfp-field">
              <input
                value={query}
                placeholder="Search LAIs, UDS panels, samples, TMS…"
                onInput={(event) => setQuery(event.currentTarget.value)}
              />
              <span class="wfp-field-hint">Search checks staff capture, flags, and handoff wording.</span>
            </div>
          </div>
        </div>

        <div class="wfp-section">
          <div class="wfp-section-head">
            Entries
            <span class="wfp-group-action">{results.length} shown</span>
          </div>
          <div class="wfp-option-list">
            {results.length ? (
              results.map((entry) => (
                <label
                  key={entry.id}
                  class={`wfp-option-row ${selected?.id === entry.id ? "is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="knowledge-entry"
                    checked={selected?.id === entry.id}
                    onChange={() => setSelectedId(entry.id)}
                  />
                  <span>
                    <span class="wfp-option-title">{entry.title}</span>
                    <div class="wfp-option-desc">{entry.sub}</div>
                  </span>
                </label>
              ))
            ) : (
              <div class="wfp-wall">
                <div class="wfp-wall-title">No matching entries</div>
                <p>Try a different search term or category.</p>
              </div>
            )}
          </div>
        </div>

        {selected && (
          <div class="wfp-section">
            <div class="wfp-section-head">{selected.title}</div>
            <div class="wfp-section-body">
              <p class="wfp-field-hint">{selected.sub}</p>
              {selected.rows.map((row) => (
                <EntryRow key={row.label} row={row} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
