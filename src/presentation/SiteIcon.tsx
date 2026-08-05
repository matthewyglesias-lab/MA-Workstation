import type { JSX } from "preact";

const ink = "var(--mt-icon-ink, #20356f)";
const blueLight = "var(--mt-icon-blue-light, #b9d0ef)";
const red = "var(--mt-icon-red, #b52c2c)";

/**
 * One dot position per canonical site string (from injection-catalog.ts),
 * placed against the shared humanoid outline below. The figure faces the
 * viewer, so a patient's right side sits on the image's left - consistent
 * with how the paired L/R coordinates mirror across x=8. Y bands roughly
 * follow real anatomy top-to-bottom: shoulder (deltoid), upper arm, mid
 * abdomen, then hip (ventrogluteal sits higher/more lateral than the lower,
 * more central dorsogluteal). Any site string not in this table - e.g. a
 * medication's own free-text site - gets a plain centered dot rather than
 * no icon at all.
 */
const SITE_DOTS: Record<string, { x: number; y: number }> = {
  "R deltoid": { x: 4.5, y: 4.4 },
  "L deltoid": { x: 11.5, y: 4.4 },
  "R upper arm (SubQ)": { x: 2.6, y: 8.9 },
  "L upper arm (SubQ)": { x: 13.4, y: 8.9 },
  "Abdomen RUQ (SubQ)": { x: 6.3, y: 7.2 },
  "Abdomen LUQ (SubQ)": { x: 9.7, y: 7.2 },
  "Abdomen RLQ (SubQ)": { x: 6.3, y: 9.6 },
  "Abdomen LLQ (SubQ)": { x: 9.7, y: 9.6 },
  "R ventrogluteal": { x: 4.9, y: 11.4 },
  "L ventrogluteal": { x: 11.1, y: 11.4 },
  "R dorsogluteal": { x: 6.3, y: 13.1 },
  "L dorsogluteal": { x: 9.7, y: 13.1 },
};

interface SiteIconProps extends JSX.SVGAttributes<SVGSVGElement> {
  site: string;
}

/**
 * A shared body-outline pictogram with a marker dot over the specific
 * injection site, so tiles for e.g. "R deltoid" and "L deltoid" - or the
 * four abdomen quadrants - are actually distinguishable at a glance instead
 * of sharing one generic region icon. Reads the site off the label text
 * rather than a catalog field, matching the rest of the site-tile UI.
 */
export function SiteIcon({ site, ...props }: SiteIconProps) {
  const dot = SITE_DOTS[site] ?? { x: 8, y: 8.7 };
  return (
    <svg
      {...props}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke={ink} stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="2.6" r="1.3" fill={blueLight} />
        <path
          d="M4.7 4.4 L11.3 4.4 L10.6 9.1 L11.1 13.4 L4.9 13.4 L5.4 9.1 Z"
          fill={blueLight}
        />
        <path d="M4.7 4.6 2.7 9.0M11.3 4.6 13.3 9.0" />
        <path d="M6.4 13.4 5.9 15.6M9.6 13.4 10.1 15.6" />
      </g>
      <circle cx={dot.x} cy={dot.y} r="2.1" fill={red} opacity="0.22" />
      <circle cx={dot.x} cy={dot.y} r="1.15" fill={red} stroke={ink} stroke-width="0.9" />
    </svg>
  );
}
