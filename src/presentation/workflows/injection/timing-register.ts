import type { InjectionTimingEvaluation } from "../../../domain/injection";
import type { ScheduleRegisterTone } from "../ScheduleRegister";

/**
 * How the timing engine's evaluation is worded and coloured in the schedule
 * register. Kept out of the panel so the wording is testable on its own: these
 * strings are the first thing staff read about a dose interval, and a wrong
 * one is a clinical miscommunication, not a cosmetic bug.
 */

/**
 * The verdict word for the schedule register's spine and chip.
 *
 * Deliberately terse and deliberately scoped to timing: this engine evaluates
 * cadence, not whether the encounter is safe to administer. A word like "SAFE"
 * here would be read as clearance the timing evaluation never gave.
 */
export function injectionTimingVerdict(timing: InjectionTimingEvaluation): string {
  switch (timing.state) {
    case "ok":
      return "ON SCHEDULE";
    case "stop":
      return "CHECK DATES";
    case "warning":
      if (timing.late) return "OVERDUE";
      if (
        timing.daysSincePrior !== null &&
        timing.earliestDay !== null &&
        timing.daysSincePrior < timing.earliestDay
      ) {
        return "EARLY";
      }
      return "REVIEW";
    case "idle":
    default:
      return "NOT EVALUATED";
  }
}

/**
 * Tone follows the engine's own severity rather than re-deciding it here. In
 * particular an overdue dose is amber, not red: the engine classifies it as a
 * provider-review warning and reserves `stop` for a date that cannot be true.
 * Escalating it in the presentation layer would invent a clinical gate the
 * domain never asserted.
 */
export function injectionTimingTone(timing: InjectionTimingEvaluation): ScheduleRegisterTone {
  if (timing.state === "ok") return "ok";
  if (timing.state === "warning") return "warning";
  if (timing.state === "stop") return "stop";
  return "neutral";
}

/**
 * The flag on the day count - how far outside the window, in days, rather than
 * only that it is outside. "6 DAYS EARLY" is actionable where "EARLY" is not.
 */
export function injectionTimingDayFlag(
  timing: InjectionTimingEvaluation,
): string | undefined {
  const { daysSincePrior, earliestDay, latestDay } = timing;
  if (daysSincePrior === null || earliestDay === null || latestDay === null) return undefined;
  if (daysSincePrior < earliestDay) return `${dayCount(earliestDay - daysSincePrior)} EARLY`;
  if (daysSincePrior > latestDay) return `${dayCount(daysSincePrior - latestDay)} LATE`;
  return "IN WINDOW";
}

/** "1 DAY", not "1 DAYS". A clinical flag that reads as a typo gets trusted less. */
function dayCount(days: number): string {
  return `${days} DAY${days === 1 ? "" : "S"}`;
}
