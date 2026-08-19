import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

import { DesktopIcon } from "../../src/presentation/DesktopIcon";

describe("DesktopIcon", () => {
  it("renders a decorative svg for a known icon name", () => {
    const { container } = render(<DesktopIcon name="home" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("viewBox", "0 0 16 16");
  });

  it("renders different markup for different icon names", () => {
    const home = render(<DesktopIcon name="home" />);
    const homeMarkup = home.container.querySelector("svg")?.innerHTML;
    home.unmount();

    const alert = render(<DesktopIcon name="alert" />);
    const alertMarkup = alert.container.querySelector("svg")?.innerHTML;

    expect(homeMarkup).toBeTruthy();
    expect(alertMarkup).toBeTruthy();
    expect(homeMarkup).not.toBe(alertMarkup);
  });

  it("passes through extra svg attributes to the root element", () => {
    const { container } = render(<DesktopIcon name="check" class="rail-icon" />);
    expect(container.querySelector("svg.rail-icon")).not.toBeNull();
  });
});
