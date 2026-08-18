import { describe, expect, it } from "vitest";

import {
  KNOWLEDGE_CATEGORIES,
  allKnowledgeEntries,
  searchKnowledgeEntries,
} from "../../src/domain/knowledge-catalog";
import { INJECTION_MEDICATIONS } from "../../src/domain/injection-catalog";
import { INJECTION_PREPARATION_REVIEWED_ON } from "../../src/domain/injection-clinical-reference";

describe("allKnowledgeEntries", () => {
  it("generates one LAI entry per non-'other' injection medication", () => {
    const entries = allKnowledgeEntries();
    const laiEntries = entries.filter((entry) => entry.category === "lai");
    const expectedCount = Object.keys(INJECTION_MEDICATIONS).length - 1; // exclude 'other'
    expect(laiEntries).toHaveLength(expectedCount);
    expect(laiEntries.map((entry) => entry.title)).toContain("Haldol Decanoate");
  });

  it("every entry belongs to a known category", () => {
    const categories = new Set(KNOWLEDGE_CATEGORIES.map((c) => c.key));
    for (const entry of allKnowledgeEntries()) {
      expect(categories.has(entry.category)).toBe(true);
    }
  });

  it("LAI entries include a dose summary and a route/site summary row", () => {
    const entries = allKnowledgeEntries();
    const haldol = entries.find((entry) => entry.title === "Haldol Decanoate");
    expect(haldol).toBeDefined();
    const doseRow = haldol!.rows.find((row) => row.label === "Doses");
    expect(doseRow?.kind).toBe("text");
    expect((doseRow as { value: string }).value).toContain("50 mg");
    const routeRow = haldol!.rows.find((row) => row.label === "Route/site");
    expect((routeRow as { value: string }).value).toContain("IM");
  });

  it("keeps the independently reviewed preparation source visible with each LAI synopsis", () => {
    const laiEntries = allKnowledgeEntries().filter((entry) => entry.category === "lai");
    for (const entry of laiEntries) {
      const preparationSource = entry.rows.find((row) => row.label === "Preparation source");
      expect(preparationSource?.kind, entry.title).toBe("text");
      expect((preparationSource as { value: string }).value, entry.title).toContain(
        `reviewed ${INJECTION_PREPARATION_REVIEWED_ON}`,
      );
    }
  });
});

describe("searchKnowledgeEntries", () => {
  const entries = allKnowledgeEntries();

  it("returns everything for an empty query and 'all' category", () => {
    expect(searchKnowledgeEntries(entries, "all", "")).toHaveLength(entries.length);
  });

  it("filters by category alone", () => {
    const results = searchKnowledgeEntries(entries, "tms", "");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((entry) => entry.category === "tms")).toBe(true);
  });

  it("filters by search text across title, sub, tags, and the search field", () => {
    const results = searchKnowledgeEntries(entries, "all", "lithium");
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Lithium level handoff");
  });

  it("combines category and search text", () => {
    const results = searchKnowledgeEntries(entries, "labs", "lithium");
    expect(results).toHaveLength(1);
    expect(searchKnowledgeEntries(entries, "uds", "lithium")).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    expect(searchKnowledgeEntries(entries, "all", "LITHIUM")).toHaveLength(1);
  });
});
