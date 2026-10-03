import "../../lightfully/reference-content.css";
import { ToolPageHeader } from "../../lightfully/ToolPageHeader";
import { useMemo, useState } from "preact/hooks";
import {
  KNOWLEDGE_CATEGORIES,
  allKnowledgeEntries,
  searchKnowledgeEntries,
  type KnowledgeCategory,
  type KnowledgeRow,
} from "../../../domain/knowledge-catalog";

function EntryRow({ row }: { row: KnowledgeRow }) {
  return <section class="lf-reference-fact">
    <h3>{row.label}</h3>
    {row.kind === "list" ? <ul>{row.items.map(item => <li key={item}>{item}</li>)}</ul> :
      row.kind === "facts" ? <dl>{row.items.map(item => <div key={item.term}>
        <dt>{item.term}</dt><dd>{item.detail}</dd>
      </div>)}</dl> : <p>{row.value}</p>}
  </section>;
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
    <div class="wfp-panel lf-reference-panel cd2004-print-exclude" tabIndex={-1}>
      <ToolPageHeader title="Reference">
        <span class="wfp-status-flag is-idle">{results.length} entries</span>
      </ToolPageHeader>

      <p class="wfp-field-hint">
        Fast MA-facing reference for injections, UDS, oral samples, TMS setup, and common psych-office safety
        reminders. Designed for handoff support — not a replacement for the prescriber, protocol, package insert,
        or lab policy.
      </p>

      <div class="wfp-tabbar" role="tablist" aria-label="Reference categories" onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const current = KNOWLEDGE_CATEGORIES.findIndex(entry => entry.key === category);
        const next = event.key === "Home" ? 0 : event.key === "End" ? KNOWLEDGE_CATEGORIES.length - 1 :
          (current + (event.key === "ArrowRight" ? 1 : -1) + KNOWLEDGE_CATEGORIES.length) % KNOWLEDGE_CATEGORIES.length;
        setCategory(KNOWLEDGE_CATEGORIES[next]!.key);
        event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
      }}>
        {KNOWLEDGE_CATEGORIES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            id={`lf-reference-category-${entry.key}`}
            aria-controls="lf-reference-results"
            tabIndex={category === entry.key ? 0 : -1}
            class="wfp-tab"
            aria-selected={category === entry.key}
            onClick={() => setCategory(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div class="wfp-tabpanel" role="tabpanel" id="lf-reference-results" aria-labelledby={`lf-reference-category-${category}`}>
        <div class="wfp-section">
          <div class="wfp-section-head">Search</div>
          <div class="wfp-section-body">
            <div class="wfp-field">
              <input
                type="search"
                value={query}
                aria-label="Search clinical reference"
                placeholder="Search LAIs, UDS panels, samples, TMS…"
                onInput={(event) => setQuery(event.currentTarget.value)}
              />
              <span class="wfp-field-hint">Search checks staff capture, flags, and handoff wording.</span>
            </div>
          </div>
        </div>

        {/* List left, detail right - a reference lookup should not make you
            scroll past every entry to read the one you picked. */}
        <div class="wfp-lookup">
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
                  class={`lf-reference-entry ${selected?.id === entry.id ? "is-selected" : ""}`}
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
                <button type="button" class="lf-reference-clear" onClick={() => {
                  setQuery(""); setCategory("all"); setSelectedId(null);
                  document.querySelector<HTMLInputElement>('[aria-label="Search clinical reference"]')?.focus();
                }}>Clear search & category</button>
              </div>
            )}
          </div>
        </div>

        {selected && (
          <article class="wfp-section lf-reference-article" aria-label={selected.title}>
            <h2 class="wfp-section-head">{selected.title}</h2>
            <div class="wfp-section-body">
              <p class="wfp-field-hint">{selected.sub}</p>
              {selected.rows.map((row) => (
                <EntryRow key={row.label} row={row} />
              ))}
            </div>
          </article>
        )}
        </div>
      </div>
    </div>
  );
}
