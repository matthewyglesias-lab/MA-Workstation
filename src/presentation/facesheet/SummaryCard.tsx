import type { ComponentChildren } from "preact";

interface SummaryCardProps {
  /** Card heading. Names the thing, not the query behind it. */
  title: string;
  /**
   * The ordering rule, stated the way Tebra states theirs. A summary card that
   * shows five of something without saying which five reads as a truncation
   * bug rather than a rule.
   */
  rule: string;
  /** Card body, or the empty line when there is nothing to show. */
  children: ComponentChildren;
  /** Optional link into the full section this card summarizes. */
  action?: { label: string; onSelect: () => void };
}

/**
 * The Facesheet card grammar: heading, ordering rule, body, and an optional
 * link into the full section.
 *
 * Every card on the Facesheet uses this, so the five of them read as one
 * component family rather than five separately-built panels. The `is-empty`
 * modifier comes from the caller's state, never from the body text - deriving
 * a class from copy is how `.is-filed` lost its styling in Phase 1.
 */
export function SummaryCard({ title, rule, children, action }: SummaryCardProps) {
  return (
    <section class="tebra-summary-card" aria-labelledby={`facesheet-card-${cardId(title)}`}>
      <header class="tebra-summary-card-head">
        <h3 id={`facesheet-card-${cardId(title)}`}>{title}</h3>
        <p class="tebra-summary-card-rule">{rule}</p>
      </header>
      <div class="tebra-summary-card-body">{children}</div>
      {action ? (
        <footer class="tebra-summary-card-foot">
          <button type="button" class="tebra-card-link" onClick={action.onSelect}>
            {action.label}
          </button>
        </footer>
      ) : null}
    </section>
  );
}

/** Stable id fragment for the heading association. Not a style hook. */
const cardId = (title: string): string =>
  title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

interface SummaryEmptyProps {
  children: ComponentChildren;
}

/** One line in voice. Never a bare "No records." */
export function SummaryEmpty({ children }: SummaryEmptyProps) {
  return <p class="tebra-summary-card-empty">{children}</p>;
}
