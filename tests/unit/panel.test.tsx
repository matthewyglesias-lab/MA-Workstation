import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

import { Panel } from "../../src/presentation/Panel";

describe("Panel", () => {
  it("renders as a labeled region with the given title", () => {
    render(
      <Panel pane="work" title="Injection">
        <p>Body content</p>
      </Panel>,
    );
    const region = screen.getByRole("region", { name: "Injection panel" });
    expect(region).toHaveAttribute("data-pane", "work");
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("marks the panel active and shows optional subtitle, toolbar, and footer", () => {
    render(
      <Panel
        pane="navigator"
        title="Records"
        subtitle="12 open"
        active
        toolbar={<button type="button">Filter</button>}
        footer={<span>Footer note</span>}
      >
        <p>Body</p>
      </Panel>,
    );
    expect(screen.getByRole("region", { name: "Records panel" })).toHaveClass("is-active");
    expect(screen.getByText("12 open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    expect(screen.getByText("Footer note")).toBeInTheDocument();
  });

  it("omits the toolbar and footer wrappers when not provided", () => {
    const { container } = render(
      <Panel pane="inspector" title="Notes">
        <p>Body</p>
      </Panel>,
    );
    expect(container.querySelector(".cd2004-window-toolbar")).toBeNull();
    expect(container.querySelector(".cd2004-window-footer")).toBeNull();
  });

  it("calls onActivate with the pane on mousedown", () => {
    const onActivate = vi.fn();
    render(
      <Panel pane="work" title="Injection" onActivate={onActivate}>
        <p>Body</p>
      </Panel>,
    );
    fireEvent.mouseDown(screen.getByRole("region", { name: "Injection panel" }));
    expect(onActivate).toHaveBeenCalledWith("work");
  });

  it("calls onActivate with the pane when focus enters the panel", () => {
    const onActivate = vi.fn();
    render(
      <Panel pane="inspector" title="Notes" onActivate={onActivate}>
        <button type="button">Inside</button>
      </Panel>,
    );
    fireEvent.focus(screen.getByRole("button", { name: "Inside" }));
    expect(onActivate).toHaveBeenCalledWith("inspector");
  });
});
