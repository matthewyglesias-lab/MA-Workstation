import type { JSX } from "preact";
import type { DesktopIconName } from "./types";

interface DesktopIconProps extends JSX.SVGAttributes<SVGSVGElement> {
  name: DesktopIconName;
}

export function DesktopIcon({ name, ...props }: DesktopIconProps) {
  const common = {
    ...props,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "square" as const,
    strokeLinejoin: "miter" as const,
    "aria-hidden": true,
    focusable: "false",
  } satisfies JSX.SVGAttributes<SVGSVGElement>;

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="m2.5 9 7.5-6 7.5 6" />
          <path d="M4.5 8v9h11V8M8 17v-5h4v5" />
        </svg>
      );
    case "administer":
      return (
        <svg {...common}>
          <path d="m13 2 5 5M14.5 5.5 4 16l-2-2L12.5 3.5" />
          <path d="m6 12 2 2M3 17l2-2" />
        </svg>
      );
    case "uds":
      return (
        <svg {...common}>
          <path d="M7 2h6M8 2v5l-4 8a2 2 0 0 0 1.8 3h8.4A2 2 0 0 0 16 15l-4-8V2" />
          <path d="M6 13h8" />
        </svg>
      );
    case "samples":
      return (
        <svg {...common}>
          <path d="M5 3h10l-1 14H6L5 3Z" />
          <path d="M6 7h8M10 9v5M7.5 11.5h5" />
        </svg>
      );
    case "forms":
      return (
        <svg {...common}>
          <path d="M4 2h8l4 4v12H4V2Z" />
          <path d="M12 2v4h4M7 10h6M7 13h6M7 16h4" />
        </svg>
      );
    case "reference":
      return (
        <svg {...common}>
          <path d="M3 3h6a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H3V3Z" />
          <path d="M17 3h-2M17 6h-2M17 9h-2M17 12h-2M17 15h-2" />
        </svg>
      );
    case "log":
      return (
        <svg {...common}>
          <path d="M3 4h14v13H3V4Z" />
          <path d="M3 8h14M7 4v13M10 11h4M10 14h4" />
        </svg>
      );
    case "tms":
      return (
        <svg {...common}>
          <path d="M10 2a6 6 0 0 0-6 6v3a3 3 0 0 0 3 3h2M10 2a6 6 0 0 1 6 6v3a3 3 0 0 1-3 3h-2" />
          <path d="M10 12v6M7 18h6" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M3 2h12l2 2v14H3V2Z" />
          <path d="M6 2v5h8V2M6 18v-7h8v7" />
        </svg>
      );
    case "records":
      return (
        <svg {...common}>
          <path d="M4 2h12v16H4V2Z" />
          <path d="M7 6h6M7 9h6M7 12h6M7 15h4" />
        </svg>
      );
    case "note":
      return (
        <svg {...common}>
          <path d="M3 3h14v14H3V3Z" />
          <path d="M6 7h8M6 10h8M6 13h5" />
        </svg>
      );
    case "print":
      return (
        <svg {...common}>
          <path d="M6 7V2h8v5M5 15H3V8h14v7h-2" />
          <path d="M6 12h8v6H6v-6Z" />
        </svg>
      );
    case "reset":
      return (
        <svg {...common}>
          <path d="M4 7a7 7 0 1 1-1 6M4 3v4H0" />
        </svg>
      );
    case "patient":
      return (
        <svg {...common}>
          <circle cx="10" cy="6" r="3" />
          <path d="M4 18v-2a6 6 0 0 1 12 0v2" />
        </svg>
      );
    case "staff":
      return (
        <svg {...common}>
          <path d="M3 4h14v13H3V4Z" />
          <circle cx="7" cy="9" r="2" />
          <path d="M5 14c.8-2 3.2-2 4 0M11 8h4M11 11h4M11 14h3" />
        </svg>
      );
    case "location":
      return (
        <svg {...common}>
          <path d="M4 18V6l6-4 6 4v12" />
          <path d="M4 18h12M8 18v-5h4v5M8 8h1M11 8h1M8 11h1M11 11h1" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M10 2 18 17H2L10 2Z" />
          <path d="M10 7v5M10 15h.01" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m3 10 4 4L17 4" />
        </svg>
      );
    default:
      return null;
  }
}
