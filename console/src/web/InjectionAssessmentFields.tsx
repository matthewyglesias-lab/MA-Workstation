import { useState } from "preact/hooks";
import type { InjectionCase } from "../shared/injections.js";
import { getInjectionReviewChecks } from "../shared/injection-readiness.js";
import { getInjectionGuidance } from "../shared/injection-guidance.js";
import { Field, Badge } from "./components.js";

export function InjectionAssessmentFields({
  record,
  productName,
  timezone,
}: {
  record: InjectionCase;
  productName: string;
  timezone: string;
}) {
  const checks = getInjectionReviewChecks(productName);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [contact, setContact] = useState(false);
  const phase = record.clinicalContext?.phase;
  const requiredContact =
    record.timingCategory !== "scheduled" ||
    (!!phase && phase !== "maintenance") ||
    Object.values(answers).includes("concern");
  const showContact = requiredContact || contact;
  const answered = Object.values(answers).filter(Boolean).length;
  return (
    <>
      <section class="form-section structured-screening">
        <div class="section-heading">
          <h3>Focused clinical review</h3>
          <Badge>
            {answered} / {checks.length} reviewed
          </Badge>
        </div>
        <p class="field-help">
          Record today’s findings. A concern stays visible after the provider
          gives a plan.
        </p>
        <div class="screening-questions">
          {checks.map((check) => (
            <div
              class={`screening-question ${answers[check.id] === "concern" ? "has-concern" : ""}`}
              key={check.id}
            >
              <div class="screening-prompt">
                <strong>{check.label}</strong>
                <p>{check.prompt}</p>
              </div>
              <Field label={`${check.label} — finding`}>
                <select
                  name={`screen-${check.id}`}
                  required
                  value={answers[check.id] || ""}
                  onChange={(e) =>
                    setAnswers({
                      ...answers,
                      [check.id]: e.currentTarget.value,
                    })
                  }
                >
                  <option value="">Select finding</option>
                  <option value="no_concern">
                    Reviewed — no concern identified
                  </option>
                  <option value="concern">
                    Concern identified — provider review
                  </option>
                  <option value="not_applicable">
                    Not applicable — document why
                  </option>
                </select>
              </Field>
              <Field label={`${check.label} — details`}>
                <input
                  name={`screen-detail-${check.id}`}
                  maxLength={1000}
                  required={
                    answers[check.id] === "concern" ||
                    answers[check.id] === "not_applicable"
                  }
                  placeholder={
                    answers[check.id] === "concern"
                      ? "Finding, source, and concern raised"
                      : answers[check.id] === "not_applicable"
                        ? "Reason this check does not apply"
                        : "Relevant details, if any"
                  }
                />
              </Field>
            </div>
          ))}
        </div>
      </section>
      <section class="form-section provider-review">
        <h3>Provider communication</h3>
        {requiredContact ? (
          <div class="clinical-callout">
            Document the provider’s instructions for this timing pathway or
            clinical concern before completing review.
          </div>
        ) : (
          <label class="checkbox">
            <input
              type="checkbox"
              name="providerContact"
              checked={contact}
              onChange={(e) => setContact(e.currentTarget.checked)}
            />
            A provider was contacted or their specific plan was verified.
          </label>
        )}
        {showContact && (
          <>
            <input
              type="hidden"
              name="includeProviderCommunication"
              value="yes"
            />
            <div class="form-grid">
              <Field label="Provider consulted">
                <input
                  name="consultProvider"
                  required
                  maxLength={160}
                  autoComplete="off"
                />
              </Field>
              <Field label={`Provider confirmation time (${timezone})`}>
                <input
                  name="consultAt"
                  type="datetime-local"
                  step="1"
                  required
                />
              </Field>
              <Field label="Provider decision">
                <select name="consultDecision" required defaultValue="">
                  <option value="">Select decision</option>
                  <option value="proceed_as_ordered">
                    Proceed under the verified order
                  </option>
                  <option value="hold">Hold medication</option>
                  <option value="clarify">Await clarification</option>
                </select>
              </Field>
              <Field label="Communication / order reference">
                <input
                  name="consultReference"
                  required
                  maxLength={200}
                  placeholder="Tebra note, order, or direct communication"
                />
              </Field>
            </div>
            <Field label="Instructions received">
              <textarea
                name="consultInstructions"
                required
                rows={3}
                maxLength={2000}
                placeholder="Specific instructions, required components, and follow-up"
              />
            </Field>
            <p class="field-help">
              If the decision is to hold or clarify, close this review and use
              Hold to record the concern and release stock.
            </p>
          </>
        )}
      </section>
    </>
  );
}

export function InjectionPreparationGuide({
  productName,
}: {
  productName: string;
}) {
  const guide = getInjectionGuidance(productName);
  if (!guide)
    return (
      <p class="field-help">
        Verify preparation and equipment against the exact package instructions
        and provider order.
      </p>
    );
  return (
    <details class="preparation-guide" open>
      <summary>{guide.productName} · preparation & equipment</summary>
      {guide.requiresSpecialistSetting && (
        <div class="clinical-callout">
          Specialist setting, eligibility, and monitoring requirements apply.
          This console does not verify them.
        </div>
      )}
      <p class="route-reference">{guide.routeAndSite}</p>
      <div class="guide-columns">
        <div>
          <h4>Prepare the product</h4>
          <ul>
            {guide.preparation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Needle & technique</h4>
          <ul>
            {guide.needleGuidance.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <p class="delivery-reference">
        <strong>If delivery is incomplete: </strong>
        {guide.incompleteDelivery}
      </p>
      <a href={guide.source.url} target="_blank" rel="noopener noreferrer">
        Prescribing information ↗
      </a>
      <small class="field-help">
        Reference reviewed {guide.reviewedOn}. Guidance does not document a
        performed check.
      </small>
    </details>
  );
}

export function InjectionFollowUpFields({
  productName,
}: {
  productName: string;
}) {
  const guide = getInjectionGuidance(productName);
  const [observation, setObservation] = useState("");
  return (
    <section class="form-section">
      <h3>Observation, education & next steps</h3>
      <div class="form-grid">
        <Field label="Observation outcome">
          <select
            name="observationOutcome"
            value={observation}
            onChange={(e) => setObservation(e.currentTarget.value)}
          >
            <option value="">Not separately recorded</option>
            <option value="completed">Completed as planned</option>
            <option value="declined">Patient declined / left early</option>
            <option value="not_required">
              Not required under the verified plan
            </option>
            <option value="transferred">
              Transferred for further evaluation
            </option>
          </select>
        </Field>
        <Field label="Actual observation (minutes)">
          <input
            name="observationMinutes"
            type="number"
            min="0"
            max="1440"
            step="1"
          />
        </Field>
      </div>
      <Field label="Observation details">
        <input
          name="observationNote"
          maxLength={1000}
          placeholder="Actual monitoring or reason for the recorded outcome"
        />
      </Field>
      {guide && (
        <fieldset class="education-checklist">
          <legend>Education actually provided</legend>
          <p class="field-help">
            Select only topics discussed with the patient or caregiver today.
          </p>
          {guide.counseling.map((topic, i) => (
            <label class="checkbox" key={topic}>
              <input
                type="checkbox"
                name="educationProvided"
                value={String(i)}
              />
              <span>{topic}</span>
            </label>
          ))}
        </fieldset>
      )}
      <Field label="Other education provided">
        <textarea
          name="otherEducation"
          rows={2}
          maxLength={500}
          placeholder="Additional topics actually discussed; leave blank if none recorded"
        />
      </Field>
      <Field label="Patient-specific follow-up instructions">
        <textarea
          name="followUpInstructions"
          rows={3}
          maxLength={2000}
          placeholder="Provider-directed next steps, coordination, and when to contact the clinic"
        />
      </Field>
    </section>
  );
}
