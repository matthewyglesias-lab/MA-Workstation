import { describe, expect, it } from "vitest";
import type { VNode } from "preact";
import { providerRegisterOptions, SAN_BERNARDINO_PROVIDERS } from "../../src/domain/provider-register";
import { providerEntryOptions } from "../../src/presentation/workflows/ProviderField";
import { InjectionTimingRegister } from "../../src/presentation/workflows/InjectionTimingRegister";

// These two presentational timing components are pure and use no hooks. Walking
// their VNodes checks visible wording; browser tests own actual layout/interaction.
function visibleText(value: unknown): string {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(visibleText).join(" ");
  const node = value as VNode<{ children?: unknown }>;
  if (typeof node.type === "function") {
    return visibleText((node.type as (props: unknown) => unknown)(node.props));
  }
  return visibleText(node.props?.children);
}

describe("clinical component purpose and evidence", () => {
  it("retains canonical selectable provider identities and credentials exactly once", () => {
    const original = providerRegisterOptions();
    const presentation = providerEntryOptions();
    expect(presentation.map(({ key, label }) => ({ key, label }))).toEqual(original.map(({ key, label }) => ({ key, label })));
    expect(presentation.every(option => option.description === undefined)).toBe(true);
    expect(providerEntryOptions(SAN_BERNARDINO_PROVIDERS, true).map(o => o.key)).toEqual(providerRegisterOptions(SAN_BERNARDINO_PROVIDERS, { prescribersOnly: true }).map(o => o.key));
  });
  it("shows one ordinary verdict without removing dates, day count, provenance or instructions", () => {
    const text = visibleText(InjectionTimingRegister({ variant: "timing", tone: "ok", marker: "CALC", verdict: "ON SCHEDULE", bandTitle: "On schedule.", bandDetail: "Continue the required active-order and product-specific safety checks.", rows: [
      { kind: "next", label: "Next dose due", value: "10/30/2026", note: "Every 4 weeks from 10/02/2026" },
      { kind: "elapsed", label: "Days since prior", value: "28", flag: "IN WINDOW" },
      { kind: "window", label: "Window", value: "09/25/2026 – 10/09/2026" },
    ] }));
    expect(text).toContain("ON SCHEDULE"); expect(text).not.toContain("On schedule."); expect(text).not.toContain("IN WINDOW");
    for (const fact of ["10/30/2026", "Every 4 weeks", "28", "09/25/2026", "Calculated", "active-order"]) expect(text).toContain(fact);
  });
  it.each(["warning", "stop", "neutral"] as const)("retains all nonordinary guidance for %s", tone => {
    const text = visibleText(InjectionTimingRegister({ variant: "timing", tone, marker: "OVR", verdict: "REVIEW", bandTitle: "Review required", bandDetail: "Provider direction must remain visible", rows: [
      { kind: "elapsed", label: "Days since prior", value: "50", flag: "6 DAYS LATE" },
    ] }));
    for (const fact of ["REVIEW", "Review required", "Provider direction", "50", "6 DAYS LATE", "Override"]) expect(text).toContain(fact);
  });
});

import { OptionList } from "../../src/presentation/workflows/OptionList";
it("registered provider select honors a disabled presentation boundary without changing its value", () => {
  let called = 0;
  const node = OptionList({ name: "provider", value: "one", disabled: true, onChange: () => called++,
    options: [{ key: "one", label: "Synthetic Provider, MD" }] });
  const select = (node.props.children as any[])[0];
  expect(select.props.disabled).toBe(true);
  expect(select.props.value).toBe("one");
  select.props.onChange({ currentTarget: { value: "two" } });
  expect(called).toBe(0);
});
