import type { JSX } from "preact";
import type { DesktopIconName } from "./types";

interface DesktopIconProps extends JSX.SVGAttributes<SVGSVGElement> {
  name: DesktopIconName;
}

const ink = "var(--mt-icon-ink, #20356f)";
const blue = "var(--mt-icon-blue, #3764aa)";
const blueLight = "var(--mt-icon-blue-light, #b9d0ef)";
const yellow = "var(--mt-icon-yellow, #f2d34a)";
const paper = "var(--mt-icon-paper, #fff3ad)";
const red = "var(--mt-icon-red, #b52c2c)";
const green = "var(--mt-icon-green, #278247)";
const metal = "var(--mt-icon-metal, #c8cbd6)";
const white = "#fff";

/**
 * Small 16-bit-style pictograms modelled on the colored chart, pencil,
 * specimen, and command glyphs used by MEDITECH Client/Server workstations.
 * Integer geometry and crisp edges keep each object legible in a 12px rail
 * gutter; the adjacent text remains the accessible name.
 */
export function DesktopIcon({ name, ...props }: DesktopIconProps) {
  const common = {
    ...props,
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": true,
    focusable: "false",
    shapeRendering: "crispEdges",
  } satisfies JSX.SVGAttributes<SVGSVGElement>;

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M1.5 4.5h5l1.5 2h6.5v7h-13z" fill={yellow} stroke={ink} />
          <path d="M2.5 2.5h7v4h-7z" fill={paper} stroke={ink} />
          <path d="M4 4h4M4 5.5h3" stroke={blue} />
          <path d="M2.5 8h11" stroke={white} />
        </svg>
      );
    case "administer":
      return (
        <svg {...common}>
          <g transform="rotate(-45 8 8)">
            <path d="M2 7.5h3M12 7.5h3.5" stroke={ink} />
            <path d="M5 5.5h7v4H5z" fill={metal} stroke={ink} />
            <path d="M6 6.5h5" stroke={white} />
            <path d="M3 5.5h2v4H3zM2 4.5h1v6H2z" fill={red} stroke={ink} />
            <path d="M12 7.5h3.5" stroke={blue} />
          </g>
        </svg>
      );
    case "uds":
      return (
        <svg {...common}>
          <path d="M3 5h10l-1 8H4z" fill="#e5b54b" stroke={ink} />
          <path d="M2.5 3h11v2.5h-11z" fill={blue} stroke={ink} />
          <path d="M4 3.5h8" stroke={white} />
          <path d="M5 9h6M5 11h4" stroke={paper} />
        </svg>
      );
    case "samples":
      return (
        <svg {...common}>
          <path d="M5 2h6v3H5z" fill={red} stroke={ink} />
          <path d="M6 5h4v8.5l-2 1-2-1z" fill={paper} stroke={ink} />
          <path d="M6.5 9h3v4l-1.5.7-1.5-.7z" fill="#d78080" />
          <path d="M7 6h2" stroke={white} />
        </svg>
      );
    case "forms":
      return (
        <svg {...common}>
          <path d="M2.5 1.5h8l3 3v10h-11z" fill={paper} stroke={ink} />
          <path d="M10.5 1.5v3h3" fill={white} stroke={ink} />
          <path d="M4 6h6M4 8h5M4 10h4" stroke={blue} />
          <path d="m8 13 5-5 1.5 1.5-5 5-2 .5z" fill={yellow} stroke={ink} />
        </svg>
      );
    case "reference":
      return (
        <svg {...common}>
          <path d="M1.5 3h5.7l.8 1v10l-.8-1H1.5z" fill={paper} stroke={ink} />
          <path d="M14.5 3H8.8L8 4v10l.8-1h5.7z" fill={yellow} stroke={ink} />
          <path d="M3 5h3M3 7h3M10 5h3M10 7h3" stroke={blue} />
          <path d="M8 4v10" stroke={ink} />
        </svg>
      );
    case "log":
      return (
        <svg {...common}>
          <path d="M3 3h10v12H3z" fill={paper} stroke={ink} />
          <path d="M6 1.5h4v3H6z" fill={blueLight} stroke={ink} />
          <path d="m5 9 1.5 1.5L11 6" stroke={green} stroke-width="2" />
          <path d="M5 13h6" stroke={blue} />
        </svg>
      );
    case "tms":
      return (
        <svg {...common}>
          <path d="M2 3h12v11H2z" fill={blueLight} stroke={ink} />
          <path d="M2 3h12v3H2z" fill={blue} stroke={ink} />
          <path d="M5 1.5v3M11 1.5v3" stroke={ink} />
          <circle cx="8" cy="10" r="3" fill={paper} stroke={ink} />
          <path d="M8 8v2h2" stroke={green} />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M2 1.5h11l1 1v12H2z" fill={blue} stroke={ink} />
          <path d="M4 2.5h7v4H4z" fill={white} stroke={ink} />
          <path d="M5 9h6v5H5z" fill={paper} stroke={ink} />
          <path d="M10 3v3" stroke={red} />
        </svg>
      );
    case "records":
      return (
        <svg {...common}>
          <path d="M1.5 4h5l1.5 2h6.5v8h-13z" fill={yellow} stroke={ink} />
          <path d="M4 2h7v8H4z" fill={paper} stroke={ink} />
          <path d="M5 4h5M5 6h5M5 8h3" stroke={blue} />
          <path d="M2.5 7h11" stroke={white} />
        </svg>
      );
    case "note":
      return (
        <svg {...common}>
          <path d="M2 2h10v13H2z" fill={paper} stroke={ink} />
          <path d="M4 1v3M7 1v3M10 1v3" stroke={blue} />
          <path d="M4 6h6M4 8h6M4 10h5M4 12h4" stroke={blue} />
        </svg>
      );
    case "print":
      return (
        <svg {...common}>
          <path d="M4 1.5h8v5H4z" fill={paper} stroke={ink} />
          <path d="M2 6h12v6H2z" fill={metal} stroke={ink} />
          <path d="M4 10h8v4.5H4z" fill={white} stroke={ink} />
          <path d="M5 12h6" stroke={blue} />
          <path d="M3.5 8h1" stroke={green} />
        </svg>
      );
    case "reset":
      return (
        <svg {...common}>
          <path d="M3 6V2l2 2a6 6 0 1 1-2 4" stroke={blue} stroke-width="2" />
          <path d="M8 5v4l3 2" stroke={green} />
        </svg>
      );
    case "new":
      return (
        <svg {...common}>
          <path d="M2 1.5h8l3 3v10H2z" fill={paper} stroke={ink} />
          <path d="M10 1.5v3h3" fill={white} stroke={ink} />
          <path d="M4 9h6M7 6v6" stroke={blue} stroke-width="2" />
        </svg>
      );
    case "discard":
      return (
        <svg {...common}>
          <path d="M3 3h10v11H3z" fill={metal} stroke={ink} />
          <path d="M2 2h12M6 1h4" stroke={ink} />
          <path d="m5 6 6 6m0-6-6 6" stroke={red} stroke-width="2" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <path d="M4 7V5a4 4 0 0 1 8 0v2" stroke={ink} stroke-width="2" />
          <path d="M2.5 7h11v8h-11z" fill={yellow} stroke={ink} />
          <path d="M8 9v3" stroke={red} stroke-width="2" />
        </svg>
      );
    case "addendum":
      return (
        <svg {...common}>
          <path d="M2 1.5h9v13H2z" fill={paper} stroke={ink} />
          <path d="M4 4h5M4 6h5M4 8h4" stroke={blue} />
          <path d="m7 13 5-5 2 2-5 5-2 .5z" fill={yellow} stroke={ink} />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <path d="M4 1.5h8v11H4z" fill={blueLight} stroke={ink} />
          <path d="M1.5 4h8v10.5h-8z" fill={paper} stroke={ink} />
          <path d="M3 7h5M3 9h5M3 11h4" stroke={blue} />
        </svg>
      );
    case "patient":
      return (
        <svg {...common}>
          <path d="M1.5 2h13v12h-13z" fill={blueLight} stroke={ink} />
          <circle cx="5" cy="6" r="2" fill={paper} stroke={ink} />
          <path d="M2.5 12c.5-2 1.5-3 2.5-3s2 1 2.5 3" fill={blue} stroke={ink} />
          <path d="M9 5h4M9 7h4M9 10h3" stroke={blue} />
        </svg>
      );
    case "staff":
      return (
        <svg {...common}>
          <path d="M2 3h12v11H2z" fill={paper} stroke={ink} />
          <path d="M6 1h4v3H6z" fill={blue} stroke={ink} />
          <path d="M4 6h3v4H4z" fill={blueLight} stroke={ink} />
          <path d="M9 6h3M9 8h3M4 12h8" stroke={blue} />
        </svg>
      );
    case "location":
      return (
        <svg {...common}>
          <path d="M2 3h12v12H2z" fill={paper} stroke={ink} />
          <path d="M1 2h14v3H1z" fill={blue} stroke={ink} />
          <path d="M7 6h2v6H7zM5 8h6v2H5z" fill={red} />
          <path d="M4 12h3v3M9 12h3v3" stroke={ink} />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M8 1 15 14H1z" fill={yellow} stroke={red} stroke-width="1.5" />
          <path d="M8 5v5M8 12v1" stroke={ink} stroke-width="2" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M1.5 8.5 5.5 13 14.5 3" stroke={green} stroke-width="3" />
          <path d="M1.5 8.5 5.5 13 14.5 3" stroke={white} />
        </svg>
      );
    case "site-deltoid":
      return (
        <svg {...common}>
          <path d="M4 14V9a4 4 0 0 1 8 0v5" fill={blueLight} stroke={ink} />
          <circle cx="8" cy="8" r="1.4" fill={red} stroke={ink} />
        </svg>
      );
    case "site-gluteal":
      return (
        <svg {...common}>
          <path d="M2 14c0-5 2-8 6-8s6 3 6 8" fill={blueLight} stroke={ink} />
          <path d="M8 6v2" stroke={ink} />
          <circle cx="6.5" cy="10.5" r="1.2" fill={red} stroke={ink} />
        </svg>
      );
    case "site-abdomen":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="10" height="10" rx="2" fill={paper} stroke={ink} />
          <path d="M8 3v10M3 8h10" stroke={blue} />
          <circle cx="10.5" cy="5.5" r="1.1" fill={red} stroke={ink} />
        </svg>
      );
    case "site-arm":
      return (
        <svg {...common}>
          <path d="M6 1.5h4v7a2 2 0 0 1-4 0z" fill={blueLight} stroke={ink} />
          <circle cx="8" cy="5" r="1.1" fill={red} stroke={ink} />
        </svg>
      );
    default:
      return null;
  }
}
