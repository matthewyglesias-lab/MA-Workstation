import type { JSX } from "preact";
import type { DesktopIconName } from "./types";

interface DesktopIconProps extends JSX.SVGAttributes<SVGSVGElement> {
  name: DesktopIconName;
}

/**
 * Solid-fill pictograms (compound paths, evenodd cutouts for interior detail)
 * instead of thin-stroke wireframes — the previous double-line outline style
 * read as a generic modern icon-font kit rather than a period toolbar glyph.
 */
export function DesktopIcon({ name, ...props }: DesktopIconProps) {
  const common = {
    ...props,
    viewBox: "0 0 20 20",
    fill: "currentColor",
    stroke: "none",
    "aria-hidden": true,
    focusable: "false",
  } satisfies JSX.SVGAttributes<SVGSVGElement>;

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path fill-rule="evenodd" d="M10 1 19 9v9H1V9L10 1Z M8 19v-6h4v6H8Z" />
        </svg>
      );
    case "administer":
      return (
        <svg {...common}>
          <g transform="rotate(-45 10 10)">
            <path d="M0 10 5 9.3 5 10.7Z M5 7h1.5v6H5Z M6.5 8h7.5v4H6.5Z M15 9.3h3v1.4H15Z M18 7.5h1.5v5H18Z" />
          </g>
        </svg>
      );
    case "uds":
      return (
        <svg {...common}>
          <path fill-rule="evenodd" d="M6 2h8v3H6Z M4 6h12l-2 11H6L4 6Z M7 13h6v1H7Z" />
        </svg>
      );
    case "samples":
      return (
        <svg {...common}>
          <path fill-rule="evenodd" d="M7 2h6v4H7Z M5 6h10v12H5Z M5 11h10v2H5Z" />
        </svg>
      );
    case "forms":
      return (
        <svg {...common}>
          <path
            fill-rule="evenodd"
            d="M4 2h9l5 5v11H4V2Z M6 10h9v1H6Z M6 13h9v1H6Z M6 16h6v1H6Z"
          />
        </svg>
      );
    case "reference":
      return (
        <svg {...common}>
          <path fill-rule="evenodd" d="M3 3h14v14H3Z M9.3 3h1.4v14H9.3Z M13 3h2v6l-1-1.5-1 1.5Z" />
        </svg>
      );
    case "log":
      return (
        <svg {...common}>
          <path
            fill-rule="evenodd"
            d="M8 2h4v3H8Z M4 4h12v14H4Z M6 9h8v1H6Z M6 12h8v1H6Z M6 15h5v1H6Z"
          />
        </svg>
      );
    case "tms":
      return (
        <svg {...common}>
          <path
            fill-rule="evenodd"
            d="M2 11a8 8 0 1 0 16 0 8 8 0 1 0-16 0Z M9 1h2v3H9Z M9.3 5h1.4v6.3H9.3Z M10 10.3h5v1.4H10Z"
          />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path fill-rule="evenodd" d="M3 3h9l5 5v9H3V3Z M6 3h5v4H6Z M6 11h8v6H6Z" />
        </svg>
      );
    case "records":
      return (
        <svg {...common}>
          <path fill-rule="evenodd" d="M2 5H8L10 7H18V18H2Z M4 11h11v1H4Z" />
        </svg>
      );
    case "note":
      return (
        <svg {...common}>
          <path
            fill-rule="evenodd"
            d="M3 3h12v14H3Z M5 3h1v2H5Z M7.5 3h1v2H7.5Z M10 3h1v2H10Z M12.5 3h1v2H12.5Z M5 9h8v1H5Z M5 12h8v1H5Z M5 15h5v1H5Z"
          />
        </svg>
      );
    case "print":
      return (
        <svg {...common}>
          <path
            fill-rule="evenodd"
            d="M6 1h8v6H6Z M2 7h16v8H2Z M6 7h8v2H6Z M4 15h12v3H4Z"
          />
        </svg>
      );
    case "reset":
      return (
        <svg {...common}>
          <path
            fill-rule="evenodd"
            d="M10 2a8 8 0 1 1-6.9 3.96L4 5l-.4 4L0 8.1l1.13-.99A8 8 0 0 1 10 2Z M9.2 5h1.6v5.6l4 2.3-.8 1.4-4.8-2.8Z"
          />
        </svg>
      );
    case "patient":
      return (
        <svg {...common}>
          <path
            fill-rule="evenodd"
            d="M6.8 6a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0Z M3 18v-1a7 7 0 0 1 14 0v1Z"
          />
        </svg>
      );
    case "staff":
      return (
        <svg {...common}>
          <path
            fill-rule="evenodd"
            d="M8 1h4v2.5H8Z M2 3h16v14H2Z M4 5h5v6H4Z M11 6h5v1H11Z M11 9h5v1H11Z M11 12h4v1H11Z"
          />
        </svg>
      );
    case "location":
      return (
        <svg {...common}>
          <path
            fill-rule="evenodd"
            d="M2 3h16v2.5H2Z M3 5.5h14v13H3Z M6 8h3v2.5H6Z M11 8h3v2.5H11Z M8.5 14.5h3v4H8.5Z"
          />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path
            fill-rule="evenodd"
            d="M10 2 19 18H1Z M9.2 7h1.6v6H9.2Z M9.2 15h1.6v1.6H9.2Z"
          />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M2 11 5 8 8 12 16 3 19 6 8 18Z" />
        </svg>
      );
    default:
      return null;
  }
}
