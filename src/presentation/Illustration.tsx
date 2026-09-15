import type { JSX } from "preact";

/**
 * Which spot illustration to draw. Internal keys, never derived from the copy
 * beside them, so rewording an empty state cannot silently change the artwork.
 */
export type IllustrationName = "worklist-clear" | "notes-empty" | "note-waiting";

interface IllustrationProps extends JSX.SVGAttributes<SVGSVGElement> {
  name: IllustrationName;
}

/*
 * Brand colour, not inherited colour — the opposite rule from DesktopIcon.
 *
 * Icons sit inside controls and have to take the colour of whatever they land
 * on. These are pictures: they occupy an empty region on their own, and the
 * warmth is the entire point. Every value is a token with its literal as the
 * fallback, because the tokens are `@media screen` scoped: if one of these ever
 * ends up inside a print rule, it renders in the right colour rather than
 * collapsing to black or to nothing.
 */
const TEAL = "var(--tw-teal-800, #004952)";
const TEAL_SOFT = "var(--tw-teal-200, #c5d6d7)";
const MINT = "var(--tw-mint-150, #ebf0ef)";
const MINT_DEEP = "var(--tw-mint-200, #d2dcda)";
const SAND = "var(--tw-sand-150, #f8f3eb)";
const SAND_DEEP = "var(--tw-sand-300, #e0d3c8)";
const CORAL = "var(--tw-coral-500, #ff8d6e)";
const PAPER = "var(--tw-white, #ffffff)";

/**
 * Warm spot illustrations for the places the workstation has nothing to show.
 *
 * An empty state is the one screen a medical assistant reaches when they have
 * *finished* something, and a bare line of grey text reads as a failure rather
 * than as an all-clear. Tebra's own product pages answer this with friendly,
 * rounded, human artwork; this is that voice, drawn in the workstation's own
 * palette rather than borrowed stock art.
 *
 * These are decorative. The `<strong>` and `<small>` beside them carry the
 * meaning, so every one of them is `aria-hidden`.
 */
export function Illustration({ name, ...props }: IllustrationProps) {
  const common = {
    ...props,
    viewBox: "0 0 200 148",
    fill: "none",
    "aria-hidden": true,
    focusable: "false",
    class: `tebra-illustration ${props.class ?? ""}`.trim(),
  } satisfies JSX.SVGAttributes<SVGSVGElement>;

  switch (name) {
    /*
     * Worklist clear: the clipboard closed out, resting. The coral tick is the
     * only saturated mark on the page — this is the good outcome, and it is
     * allowed to look like one.
     */
    case "worklist-clear":
      return (
        <svg {...common}>
          <circle cx="100" cy="66" r="52" fill={MINT} />
          <ellipse cx="100" cy="128" rx="58" ry="8" fill={SAND_DEEP} opacity=".55" />
          <g transform="rotate(-5 100 70)">
            <rect
              x="66"
              y="26"
              width="68"
              height="86"
              rx="12"
              fill={PAPER}
              stroke={MINT_DEEP}
              stroke-width="2"
            />
            <rect x="86" y="19" width="28" height="14" rx="7" fill={TEAL_SOFT} />
            <path d="M80 60h26M80 74h34M80 88h20" stroke={MINT_DEEP} stroke-width="4" stroke-linecap="round" />
            <path
              d="m80 46 6.5 6.5L100 39"
              stroke={CORAL}
              stroke-width="5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </g>
          <circle cx="42" cy="36" r="5" fill={SAND_DEEP} />
          <circle cx="163" cy="52" r="7" fill={TEAL_SOFT} />
          <circle cx="152" cy="106" r="4" fill={CORAL} opacity=".5" />
        </svg>
      );

    /*
     * Notes empty: a filed set with nothing in it yet. Sheets, not a folder —
     * what this patient has none of is documents.
     */
    case "notes-empty":
      return (
        <svg {...common}>
          <circle cx="100" cy="68" r="50" fill={SAND} />
          <ellipse cx="100" cy="128" rx="56" ry="8" fill={SAND_DEEP} opacity=".55" />
          <g transform="rotate(-9 96 74)">
            <rect
              x="56"
              y="34"
              width="60"
              height="76"
              rx="10"
              fill={PAPER}
              stroke={MINT_DEEP}
              stroke-width="2"
            />
          </g>
          <g transform="rotate(6 108 72)">
            <rect
              x="84"
              y="30"
              width="60"
              height="76"
              rx="10"
              fill={PAPER}
              stroke={TEAL_SOFT}
              stroke-width="2"
            />
            <path
              d="M97 50h34M97 64h34M97 78h20"
              stroke={MINT_DEEP}
              stroke-width="4"
              stroke-linecap="round"
            />
          </g>
          <circle cx="149" cy="97" r="11" fill={CORAL} />
          <path
            d="M149 92.5v9M144.5 97h9"
            stroke={PAPER}
            stroke-width="3"
            stroke-linecap="round"
          />
          <circle cx="44" cy="44" r="6" fill={TEAL_SOFT} />
        </svg>
      );

    /*
     * Note waiting: the document builds itself as the encounter is documented,
     * so this one shows a sheet mid-composition rather than an empty one.
     */
    case "note-waiting":
      return (
        <svg {...common}>
          <circle cx="100" cy="66" r="48" fill={MINT} />
          <ellipse cx="100" cy="126" rx="52" ry="7" fill={SAND_DEEP} opacity=".5" />
          <rect
            x="64"
            y="24"
            width="72"
            height="88"
            rx="11"
            fill={PAPER}
            stroke={MINT_DEEP}
            stroke-width="2"
          />
          <path
            d="M78 44h44M78 58h44M78 72h30"
            stroke={MINT_DEEP}
            stroke-width="4"
            stroke-linecap="round"
          />
          <path d="M78 86h16" stroke={TEAL_SOFT} stroke-width="4" stroke-linecap="round" />
          <g transform="rotate(38 128 84)">
            <rect x="122" y="52" width="13" height="44" rx="5" fill={TEAL} />
            <path d="M122 88h13l-6.5 12z" fill={CORAL} />
          </g>
          <circle cx="46" cy="94" r="5" fill={SAND_DEEP} />
          <circle cx="158" cy="38" r="7" fill={TEAL_SOFT} />
        </svg>
      );

    default:
      return null;
  }
}
