import type { ClinicalEvaluation } from "../shared/workstation/domain/contracts.js";
import type {
  InjectionEncounter,
  InjectionEvaluationOutput,
} from "../shared/workstation/domain/injection.js";
import { allowedDosesForInterval } from "../shared/workstation/domain/injection-catalog.js";
import { formatNeedleSpec } from "../shared/workstation/domain/injection-needle.js";
import { Badge } from "./components.js";
import "./workstation-engine.css";

export function WorkstationEngineSummary({
  encounter,
  evaluation,
  stage = "review",
}: {
  encounter: InjectionEncounter;
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput>;
  stage?: "order" | "review" | "administer";
}) {
  const output = evaluation.output;
  const orderFields =
    /^(medication|dose|route|site|interval|reason|priorDose|administrationDate|nextDose|initiation|timing)/;
  const laterStageStops = new Set([
    "disposition.required",
    "administration.staff",
    "administration.time",
    "response.required",
    "initiation.second.given",
    "administration.second-time",
  ]);
  const stops = evaluation.stops.filter(
    (item) =>
      !laterStageStops.has(item.code) &&
      (stage !== "order" ||
        orderFields.test(item.field || item.code) ||
        item.code.startsWith("policy.")),
  );
  const warningItems = evaluation.warnings;
  const medication = output.medication;
  const doses =
    medication && encounter.intervalKey
      ? allowedDosesForInterval(medication, encounter.intervalKey)
      : medication?.doses || [];
  return (
    <section
      class="workstation-engine-summary"
      aria-label="Clinical engine assessment"
    >
      <div class="section-heading">
        <div>
          <p class="eyebrow">CLINICAL ENGINE</p>
          <h3>{medication?.label || "Order-directed injection"}</h3>
        </div>
        <Badge tone={stops.length ? "amber" : "teal"}>
          {stops.length
            ? `${stops.length} ${stage === "order" ? "order" : "review"} items`
            : "Checks satisfied"}
        </Badge>
      </div>
      {stops[0] && (
        <div class="engine-next-item">
          <strong>Next required item</strong>
          <p>{stops[0].message}</p>
        </div>
      )}
      <div class="engine-readouts">
        <div>
          <span>Timing</span>
          <strong>
            {output.timing.message ||
              "Add the ordered pathway and administration history."}
          </strong>
        </div>
        {output.allowedSites.length > 0 && (
          <div>
            <span>Permitted sites</span>
            <strong>{output.allowedSites.join(" · ")}</strong>
          </div>
        )}
        {doses.length > 0 && (
          <div>
            <span>Reference doses</span>
            <strong>{doses.join(" · ")}</strong>
          </div>
        )}
        {output.recommendedSite && (
          <div>
            <span>Rotation suggestion</span>
            <strong>
              {output.recommendedSite}
              {output.repeatsPreviousSite
                ? " · planned site repeats previous site"
                : ""}
            </strong>
          </div>
        )}
        {output.expectedNextDoseDate && (
          <div>
            <span>Calculated return target</span>
            <strong>{output.expectedNextDoseDate}</strong>
          </div>
        )}
      </div>
      {stage !== "order" && (
        <div class="engine-needle-readout">
          <strong>Needle & technique reference</strong>
          <p>
            {output.needle.resolution.needle
              ? formatNeedleSpec(output.needle.resolution.needle)
              : output.needle.resolution.unresolvedReason ||
                "Use the exact product and ordered site instructions."}
            {output.needle.resolution.alternate
              ? `; alternative: ${formatNeedleSpec(output.needle.resolution.alternate)}`
              : ""}
          </p>
          {output.needle.resolution.rationale && (
            <p>{output.needle.resolution.rationale}</p>
          )}
          {output.needle.angle && (
            <p>
              {output.needle.angle.degrees}° · {output.needle.angle.note}
            </p>
          )}
          {output.needle.maxVolumePerSite && (
            <p>Maximum volume per site: {output.needle.maxVolumePerSite} mL.</p>
          )}
          {output.needle.siteRestriction && (
            <p>
              {output.needle.siteRestriction.headline}:{" "}
              {output.needle.siteRestriction.detail}
            </p>
          )}
          {output.needle.notes
            .filter((note) => note.severity === "caution")
            .map((note) => (
              <p key={note.id} class="engine-caution">
                {note.statement}
              </p>
            ))}
        </div>
      )}
      {(stops.length > 1 || warningItems.length > 0) && (
        <details class="engine-issues">
          <summary>
            {Math.max(0, stops.length - 1)} more required items ·{" "}
            {warningItems.length} warnings
          </summary>
          {stops.slice(1).map((item) => (
            <p key={item.code} class="engine-stop">
              {item.message}
            </p>
          ))}
          {warningItems.map((item) => (
            <p key={item.code} class="engine-caution">
              {item.message}
            </p>
          ))}
        </details>
      )}
      {output.guidance.length > 0 && (
        <details class="engine-issues">
          <summary>Product guidance & clinical rationale</summary>
          {output.guidance.map((card) => (
            <div key={card.key}>
              <strong>{card.title}</strong>
              <p>{card.message}</p>
              {card.action && <p>{card.action}</p>}
            </div>
          ))}
        </details>
      )}
      <p class="field-help">
        Reference suggestions support the verified provider order. Saving an
        order does not complete its clinical review.
      </p>
    </section>
  );
}
