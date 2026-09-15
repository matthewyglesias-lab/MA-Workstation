import type { Product } from "../shared/contracts.js";
import type { InjectionCase, InjectionReview } from "../shared/injections.js";
import { getInjectionGuidance } from "../shared/injection-guidance.js";
import {
  addInjectionInterval,
  clinicDateAt,
  elapsedCalendarDays,
  injectionIntervalLabel,
} from "../shared/injection-schedule.js";
import { Badge, dateLabel } from "./components.js";
import { momentLabel } from "./injection-time.js";

const phaseLabels = {
  maintenance: "Maintenance",
  initiation: "Initiation",
  day_1: "Day 1",
  day_8: "Day 8",
  restart: "Restart",
  switching: "Switching treatment",
};

export function InjectionClinicalSummary({
  record,
  timezone,
}: {
  record: InjectionCase;
  timezone: string;
}) {
  const order =
    record.administration?.orderSnapshot ||
    record.disposition?.orderSnapshot ||
    record;
  const context = order.clinicalContext;
  const priorOn = order.lastAdministrationAt
    ? clinicDateAt(order.lastAdministrationAt, timezone)
    : order.lastAdministrationOn;
  const encounterOn = record.administration
    ? clinicDateAt(record.administration.administeredAt, timezone)
    : order.plannedOn;
  const elapsed =
    priorOn && encounterOn ? elapsedCalendarDays(priorOn, encounterOn) : null;
  const candidate =
    priorOn && context?.schedule
      ? addInjectionInterval(priorOn, context.schedule)
      : null;
  const encounterLabel = record.administration
    ? "recorded encounter"
    : "planned encounter";
  return (
    <section class="panel clinical-summary">
      <div class="section-heading">
        <h2>Treatment context</h2>
        {context && <Badge>{phaseLabels[context.phase]}</Badge>}
      </div>
      <dl class="clinical-facts">
        <div>
          <dt>Indication per order</dt>
          <dd>{context?.indication || "Not recorded"}</dd>
        </div>
        <div>
          <dt>Ordered interval</dt>
          <dd>
            {context?.schedule
              ? injectionIntervalLabel(context.schedule)
              : "See provider timing plan"}
          </dd>
        </div>
        <div>
          <dt>Previous medication / dose</dt>
          <dd>
            {[context?.priorProduct, context?.priorDose]
              .filter(Boolean)
              .join(" · ") || "Not recorded"}
          </dd>
        </div>
        <div>
          <dt>History verified from</dt>
          <dd>{context?.historySource || "Source not recorded"}</dd>
        </div>
        <div>
          <dt>Elapsed to {encounterLabel}</dt>
          <dd>
            {elapsed === null
              ? "Previous date not confirmed"
              : elapsed < 0
                ? "History date follows this encounter — clarify chronology"
                : `${elapsed} calendar ${elapsed === 1 ? "day" : "days"}`}
          </dd>
        </div>
        <div>
          <dt>Linked treatment plan</dt>
          <dd>{context?.linkedPlan || "No linked plan recorded"}</dd>
        </div>
      </dl>
      {candidate && (
        <div class="detail-note clinical-summary-comparison">
          <span>Interval comparison</span>
          <p>
            {dateLabel(priorOn!)} + {context!.schedule!.every}{" "}
            {context!.schedule!.every === 1
              ? context!.schedule!.unit.slice(0, -1)
              : context!.schedule!.unit}{" "}
            = <strong>{dateLabel(candidate)}</strong>.
          </p>
          <small>
            Calculated from the recorded previous date for order review. The
            provider’s confirmed plan determines dosing and return dates.
          </small>
        </div>
      )}
    </section>
  );
}

export function InjectionAssessmentSummary({
  review,
  timezone,
}: {
  review: InjectionReview;
  timezone: string;
}) {
  const assessment = review.assessment;
  if (!assessment)
    return (
      <p class="clinical-summary-legacy muted">
        This earlier review used narrative screening; see the recorded details
        below.
      </p>
    );
  const communication = assessment.providerCommunication;
  const concerns = assessment.screening.filter(
    (check) => check.result === "concern",
  );
  const decisionLabels = {
    proceed_as_ordered: "Proceed as ordered",
    hold: "Hold",
    clarify: "Clarification requested",
  };
  return (
    <div class="clinical-summary-assessment">
      <div class="clinical-summary-subheading">
        <h3>Recorded screening</h3>
        <Badge tone={concerns.length ? "butter" : "sage"}>
          {concerns.length
            ? `${concerns.length} ${concerns.length === 1 ? "concern" : "concerns"}`
            : "No concerns recorded"}
        </Badge>
      </div>
      <ul class="clinical-summary-screening">
        {assessment.screening.map((check) => (
          <li
            key={check.id}
            class={check.result === "concern" ? "has-concern" : ""}
          >
            <div>
              <strong>{check.label}</strong>
              <span>
                {check.result === "no_concern"
                  ? "No concern reported"
                  : check.result === "concern"
                    ? "Concern recorded"
                    : "Not applicable"}
              </span>
            </div>
            {check.detail && <p>{check.detail}</p>}
          </li>
        ))}
      </ul>
      {(assessment.weightKg !== null || assessment.needle) && (
        <dl class="clinical-facts">
          {assessment.weightKg !== null && (
            <div>
              <dt>Weight for review</dt>
              <dd>{assessment.weightKg} kg</dd>
            </div>
          )}
          {assessment.needle && (
            <div>
              <dt>Selected needle</dt>
              <dd>{assessment.needle}</dd>
            </div>
          )}
        </dl>
      )}
      {communication && (
        <div class="detail-note clinical-summary-communication">
          <span>
            Provider communication · {decisionLabels[communication.decision]}
          </span>
          <p>
            <strong>{communication.provider}</strong> ·{" "}
            {momentLabel(communication.contactedAt, timezone)}
          </p>
          <p>{communication.instructions}</p>
          <small>Tebra reference: {communication.reference}</small>
        </div>
      )}
      {!!assessment.education.length && (
        <div class="detail-note">
          <span>Education recorded during review</span>
          <ul>
            {assessment.education.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {review.guidanceVersion && (
        <p class="clinical-summary-version muted">
          Review reference: {review.guidanceVersion}
        </p>
      )}
    </div>
  );
}

/** Components share a plan only when the patient and exact plan reference match. */
export function relatedInjectionCases(
  record: InjectionCase,
  records: InjectionCase[],
): InjectionCase[] {
  const linkedPlan = (
    record.administration?.orderSnapshot ||
    record.disposition?.orderSnapshot ||
    record
  ).clinicalContext?.linkedPlan;
  if (!linkedPlan) return [];
  return records
    .filter(
      (other) =>
        other.patientId === record.patientId &&
        (
          other.administration?.orderSnapshot ||
          other.disposition?.orderSnapshot ||
          other
        ).clinicalContext?.linkedPlan === linkedPlan,
    )
    .sort(
      (a, b) =>
        a.plannedOn.localeCompare(b.plannedOn) ||
        a.doseSequence - b.doseSequence ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

export function InjectionPatientTimeline({
  record,
  records,
  products,
  timezone,
  statusLabel,
  onSelect,
}: {
  record: InjectionCase;
  records: InjectionCase[];
  products: Product[];
  timezone: string;
  statusLabel: (record: InjectionCase) => string;
  onSelect: (id: string) => void;
}) {
  const linked = relatedInjectionCases(record, records);
  const patientRecords = records
    .filter(
      (other) => other.patientId === record.patientId && other.id !== record.id,
    )
    .sort((a, b) =>
      (
        b.administration?.administeredAt ||
        b.disposition?.at ||
        b.plannedOn
      ).localeCompare(
        a.administration?.administeredAt || a.disposition?.at || a.plannedOn,
      ),
    );
  const recent = patientRecords.slice(0, 8);
  const title = (item: InjectionCase) =>
    item.administration?.reviewSnapshot.productSnapshot.name ||
    item.review?.productSnapshot.name ||
    item.disposition?.reviewSnapshot?.productSnapshot.name ||
    products.find((product) => product.id === item.productId)?.name ||
    "Linked medication";
  const row = (item: InjectionCase) => (
    <li key={item.id} class={item.id === record.id ? "is-current" : ""}>
      <div>
        {item.id === record.id ? (
          <strong>{title(item)}</strong>
        ) : (
          <button class="text-button" onClick={() => onSelect(item.id)}>
            {title(item)}
          </button>
        )}
        <span>{statusLabel(item)}</span>
      </div>
      <p>
        {item.dose} {item.doseUnit} ordered · #{item.doseSequence}
        {item.id === record.id ? " · This encounter" : ""}
      </p>
      <small>
        {item.administration
          ? `Recorded ${momentLabel(item.administration.administeredAt, timezone)}`
          : item.disposition
            ? `${item.disposition.status === "held" ? "Held" : "Cancelled"} ${momentLabel(item.disposition.at, timezone)}`
            : `Planned ${dateLabel(item.plannedOn)}`}
      </small>
      {item.administration && (
        <small>
          {item.administration.delivery === "not_delivered"
            ? "No dose delivered"
            : `Delivered dose: ${item.administration.actualDose === null ? "Unknown" : `${item.administration.actualDose} ${item.doseUnit}`}`}
        </small>
      )}
    </li>
  );
  return (
    <>
      {!!linked.length && (
        <section class="panel clinical-timeline">
          <div class="section-heading">
            <h2>Linked plan components</h2>
          </div>
          <p class="clinical-timeline-note">
            Each component retains its own administration status. Confirm oral
            components and other treatment in Tebra.
          </p>
          <ol>{linked.map(row)}</ol>
        </section>
      )}
      <section class="panel clinical-timeline">
        <div class="section-heading">
          <h2>Patient injection history</h2>
        </div>
        <p class="clinical-timeline-note">
          {recent.length
            ? `${recent.length} of ${patientRecords.length} other loaded ${patientRecords.length === 1 ? "encounter" : "encounters"}.`
            : "No other encounters in the loaded records."}{" "}
          Confirm earlier administrations in Tebra.
        </p>
        {!!recent.length && <ol>{recent.map(row)}</ol>}
      </section>
    </>
  );
}

export function InjectionGuidancePanel({
  productName,
}: {
  productName: string;
}) {
  const guide = getInjectionGuidance(productName);
  if (!guide)
    return (
      <section class="panel guidance-panel">
        <div class="section-heading">
          <h2>Medication reference</h2>
        </div>
        <p class="clinical-timeline-note">
          No exact product reference is available here. Use the current product
          instructions and documented provider order.
        </p>
      </section>
    );
  const list = (items: string[]) => (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
  return (
    <section class="panel guidance-panel">
      <div class="section-heading">
        <h2>Medication reference</h2>
      </div>
      <div class="guidance-panel-intro">
        <strong>{guide.productName}</strong>
        <p>{guide.routeAndSite}</p>
        {guide.requiresSpecialistSetting && (
          <p class="danger-text">
            A specialist setting and monitoring requirements apply.
          </p>
        )}
      </div>
      <details>
        <summary>Clinical review prompts</summary>
        <ul>
          {guide.clinicalChecks.map((check) => (
            <li key={check.id}>
              <strong>{check.label}</strong>
              <p>{check.prompt}</p>
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Preparation & needle selection</summary>
        {list([...guide.preparation, ...guide.needleGuidance])}
      </details>
      <details>
        <summary>Incomplete delivery</summary>
        <p>{guide.incompleteDelivery}</p>
      </details>
      <details>
        <summary>Counseling & aftercare reference</summary>
        {list([...guide.counseling, ...guide.aftercare.en])}
      </details>
      <div class="guidance-panel-source">
        <a href={guide.source.url} target="_blank" rel="noopener noreferrer">
          {guide.source.title} ↗
        </a>
        <small>{guide.source.sections}</small>
        <small>
          Reference reviewed {dateLabel(guide.reviewedOn)} · {guide.version}
        </small>
        <p>
          Reference prompts support the recorded order and individual
          assessment.
        </p>
      </div>
    </section>
  );
}
