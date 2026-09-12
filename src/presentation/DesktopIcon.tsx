import type { JSX } from "preact";
import type { DesktopIconName } from "./types";

interface DesktopIconProps extends JSX.SVGAttributes<SVGSVGElement> {
  name: DesktopIconName;
}

/**
 * The duotone body: the icon's mass, drawn in the inherited colour at low
 * alpha so a glyph reads as an object rather than a wire outline. It is the
 * whole reason this set looks friendly rather than technical, and because it
 * is `currentColor` it stays correct on the teal header, in the rail, and
 * inside the coral primary action without a single per-surface override.
 */
const soft = { fill: "currentColor", opacity: 0.14, stroke: "none" } as const;

/**
 * Workstation pictograms.
 *
 * These replace a set of 16px skeuomorphic icons drawn in a fixed palette of
 * saturated yellow, mid blue and brick red, rendered with `shapeRendering:
 * crispEdges`. That set was faithful to the desktop application this app grew
 * out of, and it was the single loudest thing on screen saying the product was
 * built in another decade: no amount of refinement elsewhere survives clip art
 * in the navigation rail.
 *
 * The replacement follows the conventions every contemporary product icon set
 * shares, Tebra's own included: a 24-unit grid, uniform 1.5 stroke, round caps
 * and joins, geometry on the half-pixel so nothing renders blurred, and
 * `currentColor` throughout. Nothing here names a colour, so the icons cannot
 * drift out of step with the tokens the way a hard-coded palette did.
 *
 * Adjacent text remains the accessible name; these are decorative.
 */
export function DesktopIcon({ name, ...props }: DesktopIconProps) {
  const common = {
    ...props,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.5,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": true,
    focusable: "false",
  } satisfies JSX.SVGAttributes<SVGSVGElement>;

  switch (name) {
    /* Dashboard: panels of work, not a folder of files. */
    case "home":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="3" {...soft} />
          <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
          <path d="M10 3.5v17M10 12h10.5" />
        </svg>
      );

    /* Injection: a syringe on the diagonal it is actually held at. */
    case "administer":
      return (
        <svg {...common}>
          <g transform="rotate(-45 12 12)">
            <rect x="7" y="9" width="9" height="6" rx="1.2" {...soft} />
            <path d="M3 12h4M7 8.5v7" />
            <rect x="7" y="9" width="9" height="6" rx="1.2" />
            <path d="M16 12h5M10 10.5v3M12.5 10.5v3" />
          </g>
        </svg>
      );

    /* UDS: the lidded specimen cup, tapered the way the real one is. */
    case "uds":
      return (
        <svg {...common}>
          <path
            d="M6.4 8.5h11.2l-1.1 10.4a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8z"
            {...soft}
          />
          <path d="M6.4 8.5h11.2l-1.1 10.4a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8z" />
          <rect x="4.5" y="4" width="15" height="4.5" rx="1.6" />
          <path d="M7.7 14h8.6" />
        </svg>
      );

    /* Samples: a capped collection tube, filled to the line. */
    case "samples":
      return (
        <svg {...common}>
          <path d="M9.5 12.5h5V17a2.5 2.5 0 0 1-5 0z" {...soft} />
          <rect x="8.2" y="2.5" width="7.6" height="3.6" rx="1.4" />
          <path d="M9.5 6.1V17a2.5 2.5 0 0 0 5 0V6.1" />
          <path d="M9.5 12.5h5" />
        </svg>
      );

    /* Forms: a document whose content is boxes to tick. */
    case "forms":
      return (
        <svg {...common}>
          <path
            d="M5.5 5a2 2 0 0 1 2-2h5.6L18.5 8.4V19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z"
            {...soft}
          />
          <path d="M5.5 5a2 2 0 0 1 2-2h5.6L18.5 8.4V19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z" />
          <path d="M13 3v4a1.5 1.5 0 0 0 1.5 1.5h4" />
          <rect x="8.5" y="11.5" width="2.6" height="2.6" rx=".7" />
          <rect x="8.5" y="15.8" width="2.6" height="2.6" rx=".7" />
          <path d="M12.8 12.8h3M12.8 17.1h3" />
        </svg>
      );

    /* Reference: an open book, both leaves weighted. */
    case "reference":
      return (
        <svg {...common}>
          <path
            d="M12 7.2S10 5.3 6.6 5.3H3.5v12.4h3.1c3.4 0 5.4 1.9 5.4 1.9z"
            {...soft}
          />
          <path d="M12 7.2S10 5.3 6.6 5.3H3.5v12.4h3.1c3.4 0 5.4 1.9 5.4 1.9z" />
          <path d="M12 7.2s2-1.9 5.4-1.9h3.1v12.4h-3.1c-3.4 0-5.4 1.9-5.4 1.9z" />
          <path d="M12 7.2v12.4" />
        </svg>
      );

    /* Daily Closeout: the clipboard, and the tick that closes it. */
    case "log":
      return (
        <svg {...common}>
          <rect x="4.5" y="4.8" width="15" height="16" rx="2.5" {...soft} />
          <rect x="4.5" y="4.8" width="15" height="16" rx="2.5" />
          <rect x="8.6" y="2.6" width="6.8" height="4" rx="1.7" />
          <path d="m8.7 13.4 2.4 2.4 4.6-4.8" />
        </svg>
      );

    /* Future / TMS: scheduled work, marked on a date. */
    case "tms":
      return (
        <svg {...common}>
          <path d="M3.5 8h17v-.2a2 2 0 0 0-2-2h-13a2 2 0 0 0-2 2z" {...soft} />
          <rect x="3.5" y="5.8" width="17" height="15" rx="2.5" />
          <path d="M3.5 10h17M8.2 3.2v4M15.8 3.2v4" />
          <circle cx="12" cy="15" r="1.7" fill="currentColor" stroke="none" />
        </svg>
      );

    /* Save: into the tray, not onto a floppy disk. */
    case "save":
      return (
        <svg {...common}>
          <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3z" {...soft} />
          <path d="M12 3.5v11M8 10.8l4 3.9 4-3.9" />
          <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
        </svg>
      );

    /* Records: the drawer everything filed lives in. */
    case "records":
      return (
        <svg {...common}>
          <path
            d="M3.5 6.6a2 2 0 0 1 2-2h3.3a2 2 0 0 1 1.55.74l1.05 1.26h8.1a2 2 0 0 1 2 2v9.6a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2z"
            {...soft}
          />
          <path d="M3.5 6.6a2 2 0 0 1 2-2h3.3a2 2 0 0 1 1.55.74l1.05 1.26h8.1a2 2 0 0 1 2 2v9.6a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2z" />
          <path d="M3.5 10.4h17" />
        </svg>
      );

    /* Note: written content, and nothing else. */
    case "note":
      return (
        <svg {...common}>
          <rect x="5" y="3.5" width="14" height="17" rx="2.4" {...soft} />
          <rect x="5" y="3.5" width="14" height="17" rx="2.4" />
          <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
        </svg>
      );

    case "print":
      return (
        <svg {...common}>
          <rect x="3.5" y="8.2" width="17" height="8.3" rx="2.2" {...soft} />
          <path d="M7 8.2V4.6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v3.6" />
          <path d="M7 16.5H5.5a2 2 0 0 1-2-2v-4.3a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v4.3a2 2 0 0 1-2 2H17" />
          <rect x="7" y="13.8" width="10" height="6.6" rx="1.4" />
          <circle cx="17.2" cy="11.4" r=".95" fill="currentColor" stroke="none" />
        </svg>
      );

    case "reset":
      return (
        <svg {...common}>
          <path d="M20.2 12a8.2 8.2 0 1 1-2.7-6.05" />
          <path d="M20.6 4.2v4.6H16" />
        </svg>
      );

    /* New: the plus, at the size a primary action wants it. */
    case "new":
      return (
        <svg {...common} stroke-width={1.8}>
          <path d="M12 5.2v13.6M5.2 12h13.6" />
        </svg>
      );

    case "discard":
      return (
        <svg {...common}>
          <path
            d="M6.4 6.8h11.2l-.85 12.1a2 2 0 0 1-2 1.85h-4.65a2 2 0 0 1-2-1.85z"
            {...soft}
          />
          <path d="M4.2 6.8h15.6" />
          <path d="M9.6 6.8V5.4a1.7 1.7 0 0 1 1.7-1.7h1.4a1.7 1.7 0 0 1 1.7 1.7v1.4" />
          <path d="M6.4 6.8l.85 12.1a2 2 0 0 0 2 1.85h4.65a2 2 0 0 0 2-1.85l.85-12.1" />
          <path d="M10.4 10.6v6M13.6 10.6v6" />
        </svg>
      );

    case "lock":
      return (
        <svg {...common}>
          <rect x="4.6" y="10" width="14.8" height="10.6" rx="2.6" {...soft} />
          <path d="M8 10V7.6a4 4 0 0 1 8 0V10" />
          <rect x="4.6" y="10" width="14.8" height="10.6" rx="2.6" />
          <path d="M12 14.1v2.6" />
        </svg>
      );

    /* Addendum: what you add to a note that is already signed. */
    case "addendum":
      return (
        <svg {...common}>
          <path d="m4.3 19.7.95-3.9 2.95 2.95z" {...soft} />
          <path d="m4.3 19.7.95-3.9L16.5 4.55a2 2 0 0 1 2.83 0l.12.12a2 2 0 0 1 0 2.83L8.2 18.75z" />
          <path d="m14.9 6.15 2.95 2.95" />
        </svg>
      );

    case "copy":
      return (
        <svg {...common}>
          <rect x="4.5" y="8.5" width="11" height="11.5" rx="2.2" {...soft} />
          <path d="M8.5 4.5h8a2.5 2.5 0 0 1 2.5 2.5v8" />
          <rect x="4.5" y="8.5" width="11" height="11.5" rx="2.2" />
        </svg>
      );

    /* Patient: a person. The chart is about someone. */
    case "patient":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.4" r="3.7" {...soft} />
          <circle cx="12" cy="8.4" r="3.7" />
          <path d="M5.2 20.4a6.8 6.8 0 0 1 13.6 0" />
        </svg>
      );

    /* Staff: the person plus the badge that says which one. */
    case "staff":
      return (
        <svg {...common}>
          <rect x="3.5" y="4.8" width="17" height="14.4" rx="2.5" {...soft} />
          <rect x="3.5" y="4.8" width="17" height="14.4" rx="2.5" />
          <circle cx="9" cy="10.4" r="2.1" />
          <path d="M5.9 16.2a3.3 3.3 0 0 1 6.2 0" />
          <path d="M14.6 10h3.7M14.6 13.4h3.7" />
        </svg>
      );

    case "location":
      return (
        <svg {...common}>
          <path d="M12 20.9s6.9-5.6 6.9-11a6.9 6.9 0 1 0-13.8 0c0 5.4 6.9 11 6.9 11z" {...soft} />
          <path d="M12 20.9s6.9-5.6 6.9-11a6.9 6.9 0 1 0-13.8 0c0 5.4 6.9 11 6.9 11z" />
          <circle cx="12" cy="9.7" r="2.6" />
        </svg>
      );

    case "alert":
      return (
        <svg {...common}>
          <path
            d="M10.44 4.6a1.8 1.8 0 0 1 3.12 0l7.1 12.3a1.8 1.8 0 0 1-1.56 2.7H4.9a1.8 1.8 0 0 1-1.56-2.7z"
            {...soft}
          />
          <path d="M10.44 4.6a1.8 1.8 0 0 1 3.12 0l7.1 12.3a1.8 1.8 0 0 1-1.56 2.7H4.9a1.8 1.8 0 0 1-1.56-2.7z" />
          <path d="M12 9.4v4.1" />
          <circle cx="12" cy="16.4" r=".95" fill="currentColor" stroke="none" />
        </svg>
      );

    case "check":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.6" {...soft} />
          <circle cx="12" cy="12" r="8.6" />
          <path d="m8.2 12.2 2.7 2.7 4.9-5.4" />
        </svg>
      );

    default:
      return null;
  }
}
