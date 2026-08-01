import type { JSX } from "preact";
import type { DesktopIconName } from "./types";

interface DesktopIconProps extends JSX.SVGAttributes<SVGSVGElement> {
  name: DesktopIconName;
}

/**
 * Two-tone "engraved" pictograms: a primary shape at full opacity plus a
 * secondary facet (a roof, a tab, a shutter) at reduced opacity, the way
 * period toolbar icon sets (Cerner Millennium/PowerChart-era) added subtle
 * dimensionality to small monochrome glyphs instead of a flat single-tone
 * silhouette. Stays entirely within `currentColor` so icons still recolor
 * correctly across hover/selected/disabled states - alert/check are the only
 * two exceptions, using fixed semantic colors since they always mean
 * urgent/complete regardless of context.
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
          <path fill-opacity="0.55" d="M10 1 19 9H1Z" />
          <path fill-rule="evenodd" d="M1 9h18v9H1Z M8 19v-6h4v6H8Z" />
        </svg>
      );
    case "administer":
      return (
        <svg {...common}>
          <path fill-opacity="0.55" d="M9.2 3h1.6v3H9.2Z M5 6h10v1.6H5Z M7 15h6l-3 4Z" />
          <path d="M8 1h4v2H8Z M7 7.6h6v7.4H7Z" />
        </svg>
      );
    case "uds":
      return (
        <svg {...common}>
          <path fill-opacity="0.55" d="M6 2h8v3H6Z" />
          <path fill-rule="evenodd" d="M4 6h12l-2 11H6L4 6Z M7 13h6v1H7Z" />
        </svg>
      );
    case "samples":
      return (
        <svg {...common}>
          <path fill-opacity="0.55" d="M7 2h6v4H7Z" />
          <path fill-rule="evenodd" d="M5 6h10v12H5Z M5 11h10v2H5Z" />
        </svg>
      );
    case "forms":
      return (
        <svg {...common}>
          <path
            fill-rule="evenodd"
            d="M4 2h9l5 5v11H4V2Z M6 10h9v1H6Z M6 13h9v1H6Z M6 16h6v1H6Z"
          />
          <path fill-opacity="0.55" d="M13 2 18 7h-5Z" />
        </svg>
      );
    case "reference":
      return (
        <svg {...common}>
          <path fill-opacity="0.55" d="M3 3h6.3v14H3Z" />
          <path fill-rule="evenodd" d="M10.7 3h6.3v14h-6.3Z M13 3h2v6l-1-1.5-1 1.5Z" />
        </svg>
      );
    case "log":
      return (
        <svg {...common}>
          <path fill-opacity="0.55" d="M8 2h4v3H8Z" />
          <path fill-rule="evenodd" d="M4 4h12v14H4Z M6 9h8v1H6Z M6 12h8v1H6Z M6 15h5v1H6Z" />
        </svg>
      );
    case "tms":
      return (
        <svg {...common}>
          <path fill-opacity="0.55" d="M9 1h2v3H9Z" />
          <path
            fill-rule="evenodd"
            d="M2 11a8 8 0 1 0 16 0 8 8 0 1 0-16 0Z M9.3 5h1.4v6.3H9.3Z M10 10.3h5v1.4H10Z"
          />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path fill-rule="evenodd" d="M3 3h9l5 5v9H3V3Z M6 3h5v4H6Z" />
          <path fill-opacity="0.55" d="M6 11h8v6H6Z" />
        </svg>
      );
    case "records":
      return (
        <svg {...common}>
          <path fill-opacity="0.55" d="M2 5 8 5 10 7 2 7Z" />
          <path fill-rule="evenodd" d="M2 7h16v11H2Z M4 11h11v1H4Z" />
        </svg>
      );
    case "note":
      return (
        <svg {...common}>
          <path
            fill-opacity="0.55"
            fill-rule="evenodd"
            d="M3 3h12v3H3Z M5 3h1v2H5Z M7.5 3h1v2H7.5Z M10 3h1v2H10Z M12.5 3h1v2H12.5Z"
          />
          <path fill-rule="evenodd" d="M3 6h12v11H3Z M5 9h8v1H5Z M5 12h8v1H5Z M5 15h5v1H5Z" />
        </svg>
      );
    case "print":
      return (
        <svg {...common}>
          <path
            fill-opacity="0.55"
            fill-rule="evenodd"
            d="M2 7h16v8H2Z M6 7h8v2H6Z M4 15h12v3H4Z"
          />
          <path d="M6 1h8v6H6Z" />
        </svg>
      );
    case "reset":
      return (
        <svg {...common}>
          <path
            fill-opacity="0.55"
            d="M10 2a8 8 0 1 1-6.9 3.96L4 5l-.4 4L0 8.1l1.13-.99A8 8 0 0 1 10 2Z"
          />
          <path d="M9.2 5h1.6v5.6l4 2.3-.8 1.4-4.8-2.8Z" />
        </svg>
      );
    case "patient":
      return (
        <svg {...common}>
          <path fill-opacity="0.55" d="M3 18v-1a7 7 0 0 1 14 0v1Z" />
          <path d="M6.8 6a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0Z" />
        </svg>
      );
    case "staff":
      return (
        <svg {...common}>
          <path fill-opacity="0.55" d="M8 1h4v2.5H8Z" />
          <path
            fill-rule="evenodd"
            d="M2 3h16v14H2Z M4 5h5v6H4Z M11 6h5v1H11Z M11 9h5v1H11Z M11 12h4v1H11Z"
          />
        </svg>
      );
    case "location":
      return (
        <svg {...common}>
          <path fill-opacity="0.55" d="M2 3h16v2.5H2Z" />
          <path
            fill-rule="evenodd"
            d="M3 5.5h14v13H3Z M6 8h3v2.5H6Z M11 8h3v2.5H11Z M8.5 14.5h3v4H8.5Z"
          />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path
            fill="var(--cd-red, #a31212)"
            fill-rule="evenodd"
            d="M10 2 19 18H1Z M9.2 7h1.6v6H9.2Z M9.2 15h1.6v1.6H9.2Z"
          />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path fill="var(--cd-green, #08713c)" d="M2 11 5 8 8 12 16 3 19 6 8 18Z" />
        </svg>
      );
    default:
      return null;
  }
}
