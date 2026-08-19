import { injectionSiteGroup } from "./injection-catalog";
import type { InjectionMedication } from "./injection-catalog";
import type {
  InjectionAdministrationReference,
  InjectionHabitusBand,
  InjectionSiteGroup,
  InjectionTechniqueNote,
  NeedleRecommendationRule,
  NeedleSpec,
} from "./injection-clinical-reference";

/**
 * Needle selection and technique guidance for the documented encounter.
 *
 * This module only reads the sourced administration reference and reports what
 * the label directs. It never invents a needle: when a rule depends on body
 * habitus or weight that has not been documented, the result is `unresolved`
 * with the product's own explanatory text, because silently defaulting to
 * either side of a 90 kg threshold would be a clinical assertion this app is
 * not entitled to make.
 */

export interface NeedleContext {
  habitus?: InjectionHabitusBand | "";
  /** Canonical kilograms. Use `normalizeWeightKg` to derive it from staff entry. */
  weightKg?: number | null;
}

export interface NeedleResolution {
  needle?: NeedleSpec;
  /** Present only where the label offers a documented choice of two needles. */
  alternate?: NeedleSpec;
  rationale?: string;
  /** The anatomical family the recommendation was resolved against, whether
   * taken from the documented site or implied by the product's allowed sites. */
  siteGroup?: InjectionSiteGroup;
  /** True when a rule exists but the habitus/weight it depends on is missing. */
  unresolved: boolean;
  /** The product's own wording for what is still needed. */
  unresolvedReason?: string;
  /** What the resolver still needs, for a targeted prompt in the UI. */
  needs?: Array<"habitus" | "weight">;
}

const POUNDS_PER_KILOGRAM = 2.2046226218;

/**
 * Staff enter weight in whichever unit the scale reports. Everything
 * downstream compares against labeled kilogram thresholds, so entry is
 * normalized once here rather than at each comparison.
 */
export const normalizeWeightKg = (
  value: string | number | undefined,
  unit: "kg" | "lb" | undefined,
): number | null => {
  const raw = typeof value === "number" ? value : Number.parseFloat((value ?? "").trim());
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return unit === "lb" ? raw / POUNDS_PER_KILOGRAM : raw;
};

const administrationFor = (
  medication: InjectionMedication | null,
): InjectionAdministrationReference | null =>
  medication?.clinicalReference?.administration ?? null;

/** A rule's static selectors - the ones that do not depend on staff-entered
 * habitus or weight. A rule failing any of these is simply not this
 * encounter's rule; it never counts as "unresolved". */
const matchesStaticSelectors = (
  rule: NeedleRecommendationRule,
  siteGroup: ReturnType<typeof injectionSiteGroup>,
  dose: string,
): boolean => {
  if (rule.siteGroups?.length) {
    if (!siteGroup || !rule.siteGroups.includes(siteGroup)) return false;
  }
  if (rule.doses?.length && !rule.doses.includes(dose.trim())) return false;
  return true;
};

/**
 * The site group a product implies before a specific side is chosen.
 *
 * A gluteal-only product's needle is knowable as soon as the drug and dose
 * are set - which is when the MA actually draws it up, before deciding left
 * versus right. Returns "" where the product permits more than one group and
 * the needle genuinely depends on which is used.
 */
const impliedSiteGroup = (
  medication: InjectionMedication | null,
  dose: string,
): InjectionSiteGroup | "" => {
  const sites = medication?.administrationRule(dose).sites ?? [];
  if (!sites.length) return "";
  const groups = new Set(sites.map((entry) => injectionSiteGroup(entry)).filter(Boolean));
  return groups.size === 1 ? ([...groups][0] as InjectionSiteGroup) : "";
};

export const resolveNeedle = (
  medication: InjectionMedication | null,
  dose: string,
  site: string,
  context: NeedleContext = {},
): NeedleResolution => {
  const administration = administrationFor(medication);
  if (!administration?.needleRules.length) return { unresolved: false };

  const siteGroup = injectionSiteGroup(site) || impliedSiteGroup(medication, dose);
  const habitus = context.habitus || "";
  const weightKg = context.weightKg ?? null;
  const candidates = administration.needleRules.filter((rule) =>
    matchesStaticSelectors(rule, siteGroup, dose),
  );
  if (!candidates.length) return { unresolved: false };

  const needs = new Set<"habitus" | "weight">();
  for (const rule of candidates) {
    if (rule.weightKg) {
      if (weightKg === null) {
        needs.add("weight");
        continue;
      }
      const satisfied =
        rule.weightKg.kind === "below"
          ? weightKg < rule.weightKg.kg
          : weightKg >= rule.weightKg.kg;
      if (!satisfied) continue;
    }
    if (rule.habitus?.length) {
      if (!habitus) {
        needs.add("habitus");
        continue;
      }
      if (!rule.habitus.includes(habitus)) continue;
    }
    return {
      needle: rule.needle,
      ...(rule.alternate ? { alternate: rule.alternate } : {}),
      rationale: rule.rationale,
      ...(siteGroup ? { siteGroup } : {}),
      unresolved: false,
    };
  }

  // Every candidate was blocked. If any was blocked purely by missing input,
  // say what is missing; otherwise the product simply has no rule for this
  // site/dose combination and there is nothing to recommend.
  if (!needs.size) return { unresolved: false };
  return {
    unresolved: true,
    unresolvedReason: administration.needleUnresolved || undefined,
    needs: [...needs],
  };
};

export const techniqueNotesFor = (
  medication: InjectionMedication | null,
  dose: string,
  site: string,
): InjectionTechniqueNote[] => {
  const administration = administrationFor(medication);
  if (!administration) return [];
  const siteGroup = injectionSiteGroup(site);
  const normalizedDose = dose.trim();
  return administration.notes.filter((note) => {
    if (note.doses?.length && !note.doses.includes(normalizedDose)) return false;
    // A site-scoped note stays visible until a site is actually chosen, so
    // guidance is not hidden during the part of the workflow where it would
    // still change what the MA does.
    if (note.siteGroups?.length && siteGroup && !note.siteGroups.includes(siteGroup)) {
      return false;
    }
    return true;
  });
};

export const formatNeedleSpec = (needle: NeedleSpec): string => {
  const measurement = [needle.gauge, needle.length].filter(Boolean).join(" ");
  if (!needle.descriptor) return measurement;
  return measurement ? `${measurement} (${needle.descriptor})` : needle.descriptor;
};

const routeLabel = (siteGroup: InjectionSiteGroup | undefined, route: string): string => {
  if (siteGroup === "subq") return "SubQ";
  if (siteGroup === "deltoid") return "deltoid IM";
  if (siteGroup === "gluteal") return "gluteal IM";
  return route.trim();
};

/**
 * The string prefilled into the editable Needle / technique field. Kept to
 * what an MA would actually type - needle, route, angle - because the
 * technique verifications carry their own note wording and would otherwise be
 * duplicated in the chart.
 */
export const formatTechniquePrefill = (
  medication: InjectionMedication | null,
  resolution: NeedleResolution,
  route: string,
): string => {
  if (!resolution.needle) return "";
  const administration = administrationFor(medication);
  const parts = [formatNeedleSpec(resolution.needle)];
  const placement = routeLabel(resolution.siteGroup, route);
  // Prolixin may be administered SubQ. Its catalog angle is an IM reference;
  // never carry it into SubQ prose or the staff technique field.
  const isSubcutaneous =
    medication?.key === "prolixin" &&
    (route.trim().toLowerCase() === "subq" ||
      route.trim().toLowerCase().includes("subcut") ||
      resolution.siteGroup === "subq");
  const angle = isSubcutaneous ? undefined : administration?.angle?.degrees;
  if (placement && angle) parts.push(`${placement} at ${angle}°`);
  else if (placement) parts.push(placement);
  return `${parts.join(", ")}.`;
};
