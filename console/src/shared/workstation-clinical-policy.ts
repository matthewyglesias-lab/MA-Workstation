import {
  InjectionEngine,
  hasCurrentInjectionAdministrationReview,
  injectionAdministrationReviewFingerprint,
  injectionTimingReviewFingerprint,
  type InjectionEncounter,
  type InjectionEvaluationOutput,
  type InjectionTimingEvaluation,
} from "./workstation/domain/injection.js";
import {
  issue,
  readinessFrom,
  uniqueIssues,
  type ClinicalEvaluation,
} from "./workstation/domain/contracts.js";
import { INJECTION_INTERVAL_DAYS } from "./workstation/domain/injection-catalog.js";
import { getInjectionReference } from "./injection-catalog.js";
import { addCalendarDays, isValidIsoDate } from "./workstation/domain/dates.js";
import {
  addInjectionInterval,
  elapsedCalendarDays,
  type InjectionInterval,
} from "./injection-schedule.js";

/** Console policy overlays the preserved workstation engine; it never changes a dose. */
export const WORKSTATION_CLINICAL_POLICY_VERSION = "2026-09-15.1";
export interface WorkstationClinicalContext {
  today?: string;
  indication?: string | null;
  /** Earlier treatment injections, explicitly verified; never a component index. */
  priorMaintenanceDoses?: number;
  priorDose?: string | null;
  priorProduct?: string | null;
  /** Kept for caller compatibility. This ambiguous component field is NOT used. */
  doseSequence?: number;
}

const months = (anchor: string, count: number) =>
  addInjectionInterval(anchor, { every: count, unit: "months" }) || "";
const isInitiation = (e: InjectionEncounter) =>
  ["initiation", "reinit", "loading"].includes(e.reason);
const isProviderPath = (e: InjectionEncounter) =>
  Boolean(isInitiation(e) && e.initiation?.protocol.endsWith("-provider"));
const standardIntervals: Partial<
  Record<InjectionEncounter["medicationKey"], string[]>
> = {
  aristada: ["q4wk", "q6wk", "q8wk"],
  sustenna: ["q4wk"],
  erzofri: ["q4wk"],
  trinza: ["q12wk"],
  hafyera: ["q26wk"],
  uzedy: ["q4wk", "q8wk"],
  maintena: ["q4wk"],
  asimtufii: ["q8wk"],
  vivitrol: ["q4wk"],
};
const unsupportedInterval = (e: InjectionEncounter) =>
  Boolean(
    e.intervalKey &&
    standardIntervals[e.medicationKey] &&
    !standardIntervals[e.medicationKey]!.includes(e.intervalKey),
  );
const verifiedPlan = (e: InjectionEncounter) =>
  Boolean(e.initiation?.planVerified && e.initiation.providerNote.trim());
const indicationKind = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase().replace(/[_-]/g, " ") || "";
  if (normalized === "schizophrenia") return "schizophrenia";
  if (
    [
      "bipolar i",
      "bipolar 1",
      "bipolar i disorder",
      "bipolar i maintenance",
    ].includes(normalized)
  )
    return "bipolar_i";
  if (["provider directed", "other"].includes(normalized))
    return "provider_directed";
  return "unknown";
};

export function workstationSchedule(
  e: InjectionEncounter,
): InjectionInterval | null {
  if (
    !e.medicationKey ||
    e.medicationKey === "other" ||
    e.medicationKey === "initio" ||
    !e.intervalKey ||
    e.intervalKey === "once" ||
    isProviderPath(e) ||
    unsupportedInterval(e)
  )
    return null;
  if (isInitiation(e) && e.initiation?.protocol === "sustenna-day1")
    return { every: 1, unit: "weeks" };
  if (e.medicationKey === "trinza" && e.intervalKey === "q12wk")
    return { every: 3, unit: "months" };
  if (e.medicationKey === "hafyera" && e.intervalKey === "q26wk")
    return { every: 6, unit: "months" };
  if (e.medicationKey === "uzedy" && ["q4wk", "q8wk"].includes(e.intervalKey))
    return { every: e.intervalKey === "q4wk" ? 1 : 2, unit: "months" };
  if (e.medicationKey === "aristada" && e.intervalKey === "q8wk")
    return { every: 2, unit: "months" };
  // ASIMTUFII PI 2.2 explicitly defines its two-month interval as 56 days.
  if (e.medicationKey === "asimtufii" && e.intervalKey === "q8wk")
    return { every: 56, unit: "days" };
  return { every: INJECTION_INTERVAL_DAYS[e.intervalKey] / 7, unit: "weeks" };
}

export function workstationNextDate(e: InjectionEncounter): string {
  if (isProviderPath(e) || !isValidIsoDate(e.administrationDate)) return "";
  if (isInitiation(e) && e.initiation?.protocol === "sustenna-day1")
    return addCalendarDays(e.administrationDate, 7);
  if (isInitiation(e) && e.initiation?.protocol === "sustenna-day8")
    return isValidIsoDate(e.initiation.day1Date)
      ? addCalendarDays(e.initiation.day1Date, 35)
      : "";
  const schedule = workstationSchedule(e);
  return schedule
    ? addInjectionInterval(e.administrationDate, schedule) || ""
    : "";
}

/** Binds provider review to all policy selectors, separately from final review. */
export function workstationPolicyReviewFingerprint(
  e: InjectionEncounter,
  c: WorkstationClinicalContext = {},
): string {
  return JSON.stringify([
    WORKSTATION_CLINICAL_POLICY_VERSION,
    injectionTimingReviewFingerprint(e),
    c.indication?.trim() || "",
    c.priorDose?.trim() || "",
    c.priorProduct?.trim() || "",
    Number.isSafeInteger(c.priorMaintenanceDoses) &&
    (c.priorMaintenanceDoses ?? -1) >= 0
      ? c.priorMaintenanceDoses
      : null,
    e.initiation?.planVerified || false,
    e.initiation?.providerNote.trim() || "",
  ]);
}

export function hasCurrentWorkstationPolicyReview(
  e: InjectionEncounter,
  c: WorkstationClinicalContext = {},
): boolean {
  const d = e.details;
  return Boolean(
    d?.lateDoseReview === "provider-authorized" &&
    d.lateDoseReviewProvider?.trim() &&
    d.lateDoseReviewTime?.trim() &&
    d.lateDoseReviewNote?.trim() &&
    d.lateDoseReviewFingerprint === workstationPolicyReviewFingerprint(e, c),
  );
}

/** Translate a verified policy review only on a local copy for legacy prose.
 * A stale whole-encounter review is never repaired by this translation. */
export function workstationDocumentationEncounter(
  e: InjectionEncounter,
  c: WorkstationClinicalContext = {},
): InjectionEncounter {
  const copy = structuredClone(e);
  if (hasCurrentWorkstationPolicyReview(e, c)) {
    copy.details = {
      ...copy.details,
      lateDoseReviewFingerprint: injectionTimingReviewFingerprint(copy),
    };
    if (
      e.disposition.reviewFingerprint &&
      hasCurrentInjectionAdministrationReview(e)
    )
      copy.disposition.reviewFingerprint =
        injectionAdministrationReviewFingerprint(copy);
  }
  return copy;
}

interface ReviewFinding {
  code: string;
  message: string;
  planRequired?: boolean;
  restartRequired?: boolean;
  hard?: boolean;
  field?: string;
}

/** Explain which label table needs review; deliberately returns no regimen/dose. */
function missedFindings(
  e: InjectionEncounter,
  c: WorkstationClinicalContext,
  days: number,
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const add = (
    code: string,
    message: string,
    planRequired = false,
    hard = false,
  ) =>
    findings.push({
      code,
      message,
      planRequired,
      restartRequired: planRequired,
      hard,
    });
  const actual = e.administrationDate;
  const prior = e.priorDoseDate;
  if (e.medicationKey === "maintena") {
    if (days < 26)
      add(
        "maintena.early",
        "MAINTENA labeling does not permit routine dosing sooner than 26 days after the previous injection. Verify the dates and order before administration.",
        false,
        true,
      );
    else if (days > 28) {
      const count = c.priorMaintenanceDoses;
      if (!Number.isSafeInteger(count) || (count ?? 0) < 1)
        add(
          "maintena.history",
          "MAINTENA missed-dose review depends on whether this is the second/third injection or the fourth/later injection. Verify and record the prior treatment injection count; a component number cannot establish this.",
        );
      else {
        const threshold = count! < 3 ? 35 : 42;
        const stage = count! < 3 ? "second/third" : "fourth/later";
        if (days > threshold)
          add(
            "maintena.restart",
            `${days} days since the prior MAINTENA dose for a ${stage} injection exceeds the ${threshold / 7}-week threshold. The label requires a verified one-day or fourteen-day restart pathway.`,
            true,
          );
        else if (days === threshold)
          add(
            "maintena.boundary",
            `This ${stage} MAINTENA injection is exactly at the ${threshold / 7}-week boundary; the label's adjoining rows use strict inequalities. Obtain explicit provider/pharmacist direction rather than assuming a row applies.`,
          );
        else
          add(
            "maintena.missed",
            `${days} days since prior MAINTENA; review the ${stage} missed-dose row and confirm the previously ordered regimen.`,
          );
      }
    }
  }
  if (e.medicationKey === "aristada") {
    if (days < 14)
      add(
        "aristada.early",
        "ARISTADA must not be given earlier than 14 days after the previous injection. Its prescribed routine interval should be maintained.",
        false,
        true,
      );
    const dose = c.priorDose?.trim() || "";
    const bounds: Record<string, [number, number]> = {
      "441 mg": [42, 49],
      "662 mg": [56, 84],
      "882 mg": [56, 84],
      "1064 mg": [70, 84],
    };
    const tier = bounds[dose];
    if (!tier && days > 42)
      add(
        "aristada.history",
        "Verify the exact strength of the last ARISTADA injection before choosing its missed-dose table row. The current ordered strength is not evidence of the previous dose.",
      );
    if (tier && days > tier[1])
      add(
        "aristada.restart",
        `${days} days since ARISTADA ${dose} exceeds the ${tier[1] / 7}-week boundary in the missed-dose table. Verify the complete re-initiation/supplementation plan; do not substitute a generic grace window.`,
        true,
      );
    else if (tier && days > tier[0])
      add(
        "aristada.supplement",
        `${days} days since ARISTADA ${dose} falls in the >${tier[0] / 7} through ${tier[1] / 7}-week supplementation tier. Verify the ordered supplemental component against the current table.`,
        true,
      );
  }
  if (e.medicationKey === "asimtufii") {
    if (days > 98)
      add(
        "asimtufii.restart",
        "More than 14 weeks have elapsed since ASIMTUFII. Verify the ordered one-day or fourteen-day restart pathway.",
        true,
      );
    else if (days === 98)
      add(
        "asimtufii.boundary",
        "ASIMTUFII is exactly at 14 weeks; the missed-dose rows use strict inequalities. Obtain explicit provider/pharmacist direction.",
      );
    else if (days > 70)
      add(
        "asimtufii.missed",
        "ASIMTUFII is beyond its 56-day target plus two weeks. Review the missed-dose instructions and ordered continuation.",
      );
  }
  if (e.medicationKey === "trinza") {
    if (actual > months(prior, 9))
      add(
        "trinza.restart",
        "More than nine calendar months have elapsed since TRINZA. The label calls for re-initiation with the one-month formulation and adequate treatment before TRINZA is resumed.",
        true,
      );
    else if (actual >= months(prior, 4))
      add(
        "trinza.reinitiation",
        "Four through nine calendar months have elapsed since TRINZA. Do not give a routine TRINZA dose; verify the current dose-specific re-initiation plan using the one-month formulation.",
        true,
      );
  }
  if (e.medicationKey === "hafyera") {
    if (actual > months(prior, 11))
      add(
        "hafyera.restart",
        "More than eleven calendar months have elapsed since HAFYERA. Verify re-initiation and stabilization with a one-month paliperidone product before HAFYERA is resumed.",
        true,
      );
    else if (actual >= months(prior, 8))
      add(
        "hafyera.reinitiation-two",
        "Eight through eleven calendar months have elapsed since HAFYERA. Do not give a routine HAFYERA dose; verify the two-dose one-month-product re-initiation table.",
        true,
      );
    else if (actual > addCalendarDays(months(prior, 6), 21))
      add(
        "hafyera.reinitiation-one",
        "More than six calendar months plus three weeks, but less than eight months, have elapsed since HAFYERA. Do not give a routine HAFYERA dose; verify the one-month-product re-initiation table.",
        true,
      );
  }
  if (["sustenna", "erzofri"].includes(e.medicationKey) && !isInitiation(e)) {
    const name = e.medicationKey === "sustenna" ? "SUSTENNA" : "ERZOFRI";
    if (actual > months(prior, 6))
      add(
        `${e.medicationKey}.restart`,
        `More than six calendar months have elapsed since ${name}. Verify its own initiation regimen; the two formulations have different starting pathways.`,
        true,
      );
    else if (days > 42)
      add(
        `${e.medicationKey}.reinitiation`,
        `More than six weeks but no more than six calendar months since ${name}: verify the previously stabilized dose and the product-specific two-dose restart table, including its high-dose exception.`,
        true,
      );
  }
  return findings;
}

function correctedTiming(
  e: InjectionEncounter,
  previous: InjectionTimingEvaluation,
): InjectionTimingEvaluation {
  const schedule = workstationSchedule(e);
  const days = elapsedCalendarDays(e.priorDoseDate, e.administrationDate);
  if (!schedule || days === null || days < 0 || isInitiation(e))
    return previous;
  const expectedDate = addInjectionInterval(e.priorDoseDate, schedule) || "";
  if (!expectedDate) return previous;
  const label = `${schedule.every} ${schedule.unit}`;
  const windows: Partial<
    Record<InjectionEncounter["medicationKey"], [number, number]>
  > = {
    sustenna: [7, 7],
    erzofri: [7, 7],
    trinza: [14, 14],
    hafyera: [14, 21],
    asimtufii: [14, 14],
  };
  const window = windows[e.medicationKey];
  // UZEDY / ARISTADA / MAINTENA and custom intervals have no generic label grace.
  const earliestDate = window
    ? addCalendarDays(expectedDate, -window[0])
    : expectedDate;
  const latestDate = window
    ? addCalendarDays(expectedDate, window[1])
    : expectedDate;
  const outside =
    e.administrationDate < earliestDate || e.administrationDate > latestDate;
  const relativeToExpected =
    e.administrationDate < expectedDate
      ? "before"
      : e.administrationDate > expectedDate
        ? "after"
        : "on";
  return {
    state: outside ? "warning" : "ok",
    daysSincePrior: days,
    earliestDay: window
      ? elapsedCalendarDays(e.priorDoseDate, earliestDate)
      : null,
    latestDay: window ? elapsedCalendarDays(e.priorDoseDate, latestDate) : null,
    expectedDate,
    earliestDate: window ? earliestDate : "",
    latestDate: window ? latestDate : "",
    cadenceLabel: label,
    late: e.administrationDate > latestDate,
    relativeToExpected,
    message: `${days} days since the prior injection; ordered cadence target ${expectedDate} (${label}). ${window ? `Displayed timing range ${earliestDate} to ${latestDate}.` : "No generic grace window is applied."} ${outside ? "Review product-specific early/missed-dose instructions and provider direction." : "Timing alone does not establish eligibility; complete the active-order and product checks."}`,
  };
}

export function evaluateWorkstationClinical(
  e: InjectionEncounter,
  c: WorkstationClinicalContext = {},
): ClinicalEvaluation<InjectionEvaluationOutput> {
  const evaluation = InjectionEngine.evaluate(
    workstationDocumentationEncounter(e, c),
    { today: c.today },
  );
  const output = evaluation.output;
  const findings: ReviewFinding[] = [];
  const active = !e.disposition.kind || e.disposition.kind === "administered";
  const originalTiming = output.timing;
  const previousReference = c.priorProduct?.trim()
    ? getInjectionReference(c.priorProduct)
    : undefined;
  const currentReference = getInjectionReference(
    output.medication?.label || "",
  );
  const changedProduct = Boolean(
    c.priorProduct?.trim() &&
    (!previousReference || previousReference.name !== currentReference?.name),
  );
  output.timing =
    changedProduct || unsupportedInterval(e) || isProviderPath(e)
      ? {
          ...originalTiming,
          state: "idle",
          late: false,
          expectedDate: "",
          earliestDate: "",
          latestDate: "",
          earliestDay: null,
          latestDay: null,
          message:
            "A changed/uncertain formulation or provider-directed interval needs the documented transition plan. No routine same-product timing window is calculated.",
        }
      : correctedTiming(e, originalTiming);
  if (changedProduct)
    findings.push({
      code: "transition.history",
      message:
        "The previous product differs from, or cannot be matched to, the current formulation. Verify the transition history and active provider plan; do not apply a same-product missed-dose table.",
      planRequired: true,
    });
  if (unsupportedInterval(e))
    findings.push({
      code: "interval.provider-plan",
      field: "intervalKey",
      message:
        "This interval is outside the product's referenced routine cadence. Record an explicit provider-directed plan; the app does not calculate a routine next date for this interval.",
      planRequired: true,
    });
  output.expectedNextDoseDate = workstationNextDate(e);
  if (output.expectedNextDoseDate)
    evaluation.calculatedDates.expectedNextDoseDate =
      output.expectedNextDoseDate;
  else delete evaluation.calculatedDates.expectedNextDoseDate;
  if (output.timing !== originalTiming) {
    evaluation.warnings = evaluation.warnings.filter(
      (x) => x.code !== "timing.review",
    );
    if (output.timing.state === "warning")
      findings.push({ code: "timing.review", message: output.timing.message });
  }
  const days = elapsedCalendarDays(e.priorDoseDate, e.administrationDate);
  if (
    days !== null &&
    days >= 0 &&
    !changedProduct &&
    !(
      isInitiation(e) &&
      ["sustenna-day1", "sustenna-day8"].includes(e.initiation?.protocol || "")
    )
  )
    findings.push(...missedFindings(e, c, days));
  if (
    e.medicationKey === "sustenna" &&
    isInitiation(e) &&
    e.initiation?.protocol === "sustenna-day8" &&
    isValidIsoDate(e.initiation.day1Date)
  ) {
    const day1 = e.initiation.day1Date;
    const target = addCalendarDays(day1, 7);
    const earliestDate = addCalendarDays(day1, 3);
    const latestDate = addCalendarDays(day1, 11);
    const elapsed = elapsedCalendarDays(day1, e.administrationDate);
    evaluation.calculatedDates.sustennaDay8Target = target;
    evaluation.calculatedDates.sustennaDay8Early = earliestDate;
    evaluation.calculatedDates.sustennaDay8Late = latestDate;
    evaluation.calculatedDates.sustennaMonthlyTarget = addCalendarDays(
      day1,
      35,
    );
    if (elapsed !== null) {
      const outside = elapsed < 3 || elapsed > 11;
      output.timing = {
        state: outside ? "warning" : "ok",
        daysSincePrior: elapsed,
        earliestDay: 3,
        latestDay: 11,
        expectedDate: target,
        earliestDate,
        latestDate,
        cadenceLabel: "Day 8 initiation",
        late: elapsed > 11,
        message: `SUSTENNA Day 8 target ${target}; permitted date range ${earliestDate} to ${latestDate}. First maintenance target is ${addCalendarDays(day1, 35)}, five weeks after Day 1.`,
      };
      if (outside)
        findings.push({
          code: "sustenna.day8",
          message:
            elapsed < 3
              ? "This date is before the Day 8 initiation window. Verify the dates and provider plan."
              : `The Day 8 window was missed (${elapsed} days since Day 1). Review the ${elapsed < 28 ? "less-than-four-week" : elapsed <= 49 ? "four-through-seven-week" : "greater-than-seven-week"} re-initiation row with the prescriber; do not infer the regimen from a return date.`,
          planRequired: true,
        });
    }
  }
  if (e.medicationKey === "uzedy") {
    const kind = indicationKind(c.indication);
    if (kind === "unknown")
      findings.push({
        code: "uzedy.indication",
        field: "indication",
        hard: true,
        message:
          "Select the verified UZEDY indication: schizophrenia, bipolar I maintenance, or an explicit provider-directed indication. Interval compatibility cannot be established from an unspecified indication.",
      });
    else if (
      kind === "provider_directed" ||
      (kind === "bipolar_i" &&
        (e.intervalKey !== "q4wk" ||
          !["50 mg", "75 mg", "100 mg"].includes(e.dose.trim())))
    )
      findings.push({
        code: "uzedy.provider-plan",
        message:
          "This UZEDY indication/dose/interval is outside the labeled bipolar-I monthly 50/75/100 mg pathway. Record explicit provider direction and review; do not label it a supported routine regimen.",
        planRequired: true,
      });
  }
  if (e.medicationKey === "erzofri" && isInitiation(e)) {
    output.allowedSites = ["R deltoid", "L deltoid"];
    output.recommendedSite = "";
    if (!/deltoid/i.test(e.site))
      findings.push({
        code: "erzofri.initiation-site",
        field: "site",
        hard: true,
        message:
          "ERZOFRI initiation requires a deltoid site, including the renal-adjusted 234 mg initiation dose. Verify the ordered initiation category; do not substitute SUSTENNA's Day 8 pathway.",
      });
  }
  if (
    output.needle.resolution.unresolved &&
    ["sustenna", "trinza", "erzofri", "maintena", "asimtufii"].includes(
      e.medicationKey,
    )
  )
    findings.push({
      code: "needle.inputs",
      field: output.needle.resolution.needs?.includes("weight")
        ? "vitals.weight"
        : "habitus",
      hard: true,
      message:
        output.needle.resolution.unresolvedReason ||
        "Document the measured weight or assessed body habitus needed to choose the product's supplied needle.",
    });

  const reviewed = hasCurrentWorkstationPolicyReview(e, c);
  for (const finding of findings) {
    const message = `${finding.message}${finding.hard ? "" : " Document the provider, decision time, instructions, and review of these exact facts."}`;
    const blocking =
      active &&
      (finding.hard ||
        !reviewed ||
        (finding.planRequired && !verifiedPlan(e)) ||
        (finding.restartRequired && !isInitiation(e)));
    (blocking ? evaluation.stops : evaluation.warnings).push(
      issue(
        blocking ? "stop" : "warning",
        `policy.${finding.code}`,
        message,
        finding.field || "details.lateDoseReview",
        "timing",
      ),
    );
  }
  // Replace only timing projections whose source facts were corrected. Other
  // product, safety, vitals, preparation and whole-state review gates survive.
  output.guidance = output.guidance.filter(
    (card) =>
      !card.key.endsWith("-schedule") &&
      !card.key.endsWith("-timing") &&
      !card.key.includes("week-cadence"),
  );
  output.guidance.push({
    key: "console-policy-schedule",
    title: "Schedule and label review",
    section: "timing",
    classification: "order-dependent review",
    message: output.timing.message,
  });
  if (output.expectedNextDoseDate)
    output.guidance.push({
      key: "console-policy-next",
      title: "Next date for order comparison",
      section: "timing",
      classification: "order-dependent review",
      message: `${output.expectedNextDoseDate}. Confirm the active order; this calculation does not select a dose or authorize the next injection.`,
    });
  findings.forEach((finding) =>
    output.guidance.push({
      key: `console-policy-${finding.code}`,
      title: "Product-specific review",
      section: "timing",
      classification: "order-dependent review",
      message: finding.message,
    }),
  );
  output.lateDoseWarning =
    output.timing.late ||
    findings.some(
      (finding) => !finding.hard && finding.code !== "needle.inputs",
    );
  evaluation.stops = uniqueIssues(evaluation.stops);
  evaluation.warnings = uniqueIssues(evaluation.warnings);
  evaluation.readiness = readinessFrom(
    evaluation.readiness !== "idle",
    evaluation.stops,
    evaluation.warnings,
  );
  output.administrationDocumented =
    e.disposition.kind === "administered" && !evaluation.stops.length;
  output.canFinalize = Boolean(e.disposition.kind) && !evaluation.stops.length;
  output.recordStatus = output.administrationDocumented
    ? "ready-to-lock"
    : output.canFinalize
      ? "handoff-ready"
      : "draft";
  return evaluation;
}
