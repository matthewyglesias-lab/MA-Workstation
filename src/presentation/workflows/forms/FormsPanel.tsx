import type { ComponentChildren, Ref } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "../workflow-panels.css";
import {
  emptyFormsEncounter,
  FORM_REQUEST_TYPE_OPTIONS,
  FORM_STATUS_OPTIONS,
  LETTER_TYPE_OPTIONS,
  type FormRequestStatus,
  type FormRequestType,
  type FormsEncounter,
  type FormsEvaluationOutput,
  type LetterSignatureMode,
  type LetterType,
} from "../../../domain/forms";
import type { ClinicalEvaluation } from "../../../domain/contracts";
import { DocumentationEngine } from "../../../documentation";
import { formatProviderLetterDraft } from "../../../documentation/forms";
import { formsEncounterToDocumentationInput } from "../../../documentation/adapters/forms-from-encounter";
import { clickLegacyControl } from "../legacy-mirror";
import { mirrorFormsEncounterToLegacyDom } from "./forms-legacy-mirror";
import type { PatientContext } from "../../types";

type FormsTab = "request" | "letter";

// The letter builder is being rebuilt and isn't ready for use yet — the tab
// stays visible so staff know it's coming, but shows a placeholder instead
// of the live form. Flip to true to restore it; the domain model,
// documentation formatter, and print mirror underneath are already wired
// and tested, only the interactive UI is gated.
const LETTER_BUILDER_ENABLED = false;

interface FormsPanelProps {
  initialEncounter: FormsEncounter;
  activePatient: PatientContext;
  evaluation?: ClinicalEvaluation<FormsEvaluationOutput>;
  staffSignInValue: string;
  previewRef?: Ref<HTMLDivElement>;
}

const patientIsEmpty = (patient: FormsEncounter["patient"]): boolean =>
  !patient.name.trim() && !patient.dob.trim();

function StatusFlag({
  idle,
  stopCount,
  warningCount,
}: {
  idle: boolean;
  stopCount: number;
  warningCount: number;
}) {
  const variant = idle
    ? "is-idle"
    : stopCount > 0
      ? "is-stop"
      : warningCount > 0
        ? "is-warning"
        : "is-ready";
  const label = idle
    ? "Not started"
    : stopCount > 0
      ? `${stopCount} stop${stopCount === 1 ? "" : "s"}`
      : warningCount > 0
        ? `${warningCount} to review`
        : "Ready";
  return <span class={`wfp-status-flag ${variant}`}>{label}</span>;
}

interface OptionListProps<T extends string> {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ key: T; label: string; description?: string }>;
  inline?: boolean;
}

function OptionList<T extends string>({
  name,
  value,
  onChange,
  options,
  inline,
}: OptionListProps<T>) {
  return (
    <div class={`wfp-option-list ${inline ? "wfp-option-list-inline" : ""}`} role="radiogroup">
      {options.map((option) => (
        <label
          key={option.key}
          class={`wfp-option-row ${value === option.key ? "is-selected" : ""}`}
        >
          <input
            type="radio"
            name={name}
            checked={value === option.key}
            onChange={() => onChange(option.key)}
          />
          <span>
            <span class="wfp-option-title">{option.label}</span>
            {option.description && <div class="wfp-option-desc">{option.description}</div>}
          </span>
        </label>
      ))}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ComponentChildren;
}) {
  return (
    <div class="wfp-field">
      <label>{label}</label>
      {children}
      {hint && <span class="wfp-field-hint">{hint}</span>}
    </div>
  );
}

export function FormsPanel({
  initialEncounter,
  activePatient,
  evaluation,
  staffSignInValue,
  previewRef,
}: FormsPanelProps) {
  const [encounter, setEncounter] = useState<FormsEncounter>(initialEncounter);
  const [tab, setTab] = useState<FormsTab>("request");
  const mirroredOnMount = useRef(false);

  useEffect(() => {
    if (mirroredOnMount.current) return;
    mirroredOnMount.current = true;
    mirrorFormsEncounterToLegacyDom(encounter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!patientIsEmpty(encounter.patient)) return;
    if (!activePatient.name?.trim() && !activePatient.dob?.trim()) return;
    patch({ patient: { name: activePatient.name ?? "", dob: activePatient.dob ?? "" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatient.name, activePatient.dob]);

  const patch = (partial: Partial<FormsEncounter>) => {
    setEncounter((previous) => {
      const next = { ...previous, ...partial };
      mirrorFormsEncounterToLegacyDom(next);
      return next;
    });
  };

  const patchPatient = (partial: Partial<FormsEncounter["patient"]>) => {
    patch({ patient: { ...encounter.patient, ...partial } });
  };

  const noteText = DocumentationEngine.format(
    "forms",
    formsEncounterToDocumentationInput(encounter),
  ).text;
  const letterDraft = formatProviderLetterDraft(encounter);

  // While the letter builder is walled off, its section-scoped stops/
  // warnings aren't actionable from this UI — exclude them from the visible
  // summary so staff aren't shown issues they have no way to resolve here.
  const isLetterIssue = (issue: { section?: string }) => issue.section === "letter";
  const requestStops =
    evaluation?.stops.filter((issue) => LETTER_BUILDER_ENABLED || !isLetterIssue(issue)) ?? [];
  const requestWarnings =
    evaluation?.warnings.filter((issue) => LETTER_BUILDER_ENABLED || !isLetterIssue(issue)) ?? [];
  const requestTabIssues = requestStops.length + requestWarnings.length;
  const letterTabIssues = LETTER_BUILDER_ENABLED
    ? (evaluation?.stops.filter(isLetterIssue).length ?? 0) +
      (evaluation?.warnings.filter(isLetterIssue).length ?? 0)
    : 0;

  return (
    <div class="wfp-panel cd2004-print-exclude" ref={previewRef} tabIndex={-1}>
      <div class="wfp-summary-bar">
        <strong>Forms &amp; letters</strong>
        <StatusFlag
          idle={(evaluation?.readiness ?? "idle") === "idle"}
          stopCount={requestStops.length}
          warningCount={requestWarnings.length}
        />
        <span class="wfp-summary-spacer" />
        <button
          type="button"
          class="cd2004-link-button"
          onClick={() => {
            patch({
              patient: { name: activePatient.name ?? "", dob: activePatient.dob ?? "" },
            });
          }}
          disabled={!activePatient.name?.trim() && !activePatient.dob?.trim()}
        >
          Use current patient
        </button>
        <button
          type="button"
          class="cd2004-link-button"
          onClick={() => {
            if (staffSignInValue) patch({ staff: staffSignInValue });
          }}
          disabled={!staffSignInValue}
        >
          Use signed-in staff
        </button>
        <button
          type="button"
          class="cd2004-command-button"
          onClick={() => clickLegacyControl("formsAddLog")}
        >
          Add to log
        </button>
      </div>

      <div class="wfp-tabbar" role="tablist">
        <button
          type="button"
          role="tab"
          class="wfp-tab"
          aria-selected={tab === "request"}
          onClick={() => setTab("request")}
        >
          Request
          {requestTabIssues > 0 && <span class="wfp-tab-badge">{requestTabIssues}</span>}
        </button>
        <button
          type="button"
          role="tab"
          class="wfp-tab"
          aria-selected={tab === "letter"}
          onClick={() => setTab("letter")}
        >
          Letter builder
          {!LETTER_BUILDER_ENABLED && <span class="wfp-tab-badge wfp-tab-badge-muted">Soon</span>}
          {LETTER_BUILDER_ENABLED && letterTabIssues > 0 && (
            <span class="wfp-tab-badge">{letterTabIssues}</span>
          )}
        </button>
      </div>

      {tab === "request" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section">
            <div class="wfp-section-head">Patient &amp; request</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Patient name">
                  <input
                    value={encounter.patient.name}
                    placeholder="Last, First"
                    onInput={(event) => patchPatient({ name: event.currentTarget.value })}
                  />
                </Field>
                <Field label="DOB">
                  <input
                    value={encounter.patient.dob}
                    placeholder="MM/DD/YYYY"
                    onInput={(event) => patchPatient({ dob: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Requested date">
                  <input
                    type="date"
                    value={encounter.requestDate}
                    onInput={(event) => patch({ requestDate: event.currentTarget.value })}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">Type of request</div>
            <div class="wfp-section-body">
              <OptionList<FormRequestType>
                name="forms-request-type"
                value={encounter.requestType}
                onChange={(value) => patch({ requestType: value })}
                options={FORM_REQUEST_TYPE_OPTIONS}
              />
              <div class="wfp-row">
                <Field label="Assigned provider">
                  <input
                    value={encounter.provider}
                    onInput={(event) => patch({ provider: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Assigned staff">
                  <input
                    value={encounter.staff}
                    onInput={(event) => patch({ staff: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Due / target date">
                  <input
                    type="date"
                    value={encounter.targetDate}
                    onInput={(event) => patch({ targetDate: event.currentTarget.value })}
                  />
                </Field>
              </div>
              <div class="wfp-row">
                <Field label="Fee status">
                  <select
                    value={encounter.feeStatus}
                    onChange={(event) => patch({ feeStatus: event.currentTarget.value })}
                  >
                    <option>No fee / not applicable</option>
                    <option>Fee quoted</option>
                    <option>Fee collected</option>
                    <option>Fee pending</option>
                    <option>Waived by provider/manager</option>
                  </select>
                </Field>
                <Field label="Delivery / pickup">
                  <select
                    value={encounter.deliveryMethod}
                    onChange={(event) => patch({ deliveryMethod: event.currentTarget.value })}
                  >
                    <option>Patient pickup</option>
                    <option>Portal / electronic copy</option>
                    <option>Fax to third party</option>
                    <option>Mail</option>
                    <option>Provider to advise</option>
                  </select>
                </Field>
                <Field label="Patient notified">
                  <select
                    value={encounter.notificationStatus}
                    onChange={(event) =>
                      patch({ notificationStatus: event.currentTarget.value })
                    }
                  >
                    <option>Not yet notified</option>
                    <option>Left voicemail</option>
                    <option>Spoke with patient</option>
                    <option>SMS sent</option>
                    <option>Portal message sent</option>
                    <option>Not applicable</option>
                  </select>
                </Field>
              </div>
              <Field label="Request notes / special instructions">
                <textarea
                  value={encounter.notes ?? ""}
                  placeholder="Example: patient requesting work accommodation letter; provider to review wording before release."
                  onInput={(event) => patch({ notes: event.currentTarget.value })}
                />
              </Field>
              <div class="wfp-row">
                <Field label="Approval / release status" hint="optional">
                  <select
                    value={encounter.providerApprovalConfirmed ? "confirmed" : ""}
                    onChange={(event) =>
                      patch({
                        providerApprovalConfirmed:
                          event.currentTarget.value === "confirmed",
                      })
                    }
                  >
                    <option value="">Not separately documented</option>
                    <option value="confirmed">Provider approved for release</option>
                  </select>
                </Field>
                <Field label="Action completed / current task" hint="optional">
                  <textarea
                    value={encounter.actionNotes ?? ""}
                    placeholder="Prepared draft, requested records, routed to provider, collected fee, etc."
                    onInput={(event) => patch({ actionNotes: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Follow-up / next owner" hint="optional">
                  <textarea
                    value={encounter.followUpNotes ?? ""}
                    placeholder="Next step, responsible person, and timing"
                    onInput={(event) => patch({ followUpNotes: event.currentTarget.value })}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">Status</div>
            <div class="wfp-section-body">
              <OptionList<FormRequestStatus>
                name="forms-status"
                value={encounter.status}
                onChange={(value) => patch({ status: value })}
                options={FORM_STATUS_OPTIONS}
                inline
              />
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">Forms handoff note</div>
            <div class="wfp-section-body">
              <div class="wfp-preview">{noteText || "Document the request to build the note."}</div>
              <div class="wfp-actions">
                <button
                  type="button"
                  class="cd2004-command-button"
                  onClick={() => navigator.clipboard?.writeText(noteText)}
                  disabled={!noteText}
                >
                  Copy forms note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "letter" && !LETTER_BUILDER_ENABLED && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-wall">
            <div class="wfp-wall-title">Letter builder — in progress</div>
            <p>
              This module is being rebuilt and isn't available in this workspace yet.
              Provider letter drafting will return here once it's ready.
            </p>
          </div>
        </div>
      )}

      {tab === "letter" && LETTER_BUILDER_ENABLED && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section">
            <div class="wfp-section-head">Letter purpose</div>
            <div class="wfp-section-body">
              <OptionList<LetterType>
                name="forms-letter-type"
                value={encounter.letterType}
                onChange={(value) => patch({ letterType: value })}
                options={LETTER_TYPE_OPTIONS}
                inline
              />
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">Letter details</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Recipient">
                  <input
                    value={encounter.letterRecipient ?? ""}
                    onInput={(event) => patch({ letterRecipient: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Provider name / signature">
                  <input
                    value={encounter.letterProviderName ?? ""}
                    placeholder={encounter.provider || "Provider"}
                    onInput={(event) =>
                      patch({ letterProviderName: event.currentTarget.value })
                    }
                  />
                </Field>
                <Field label="Letter date">
                  <input
                    type="date"
                    value={encounter.letterDate ?? ""}
                    onInput={(event) => patch({ letterDate: event.currentTarget.value })}
                  />
                </Field>
              </div>
              <div class="wfp-row">
                <Field label="Provider credentials">
                  <input
                    value={encounter.letterCredentials ?? ""}
                    placeholder="MD, PMHNP-BC, PA-C, etc."
                    onInput={(event) =>
                      patch({ letterCredentials: event.currentTarget.value })
                    }
                  />
                </Field>
                <Field label="Subject line">
                  <input
                    value={encounter.letterSubject ?? ""}
                    placeholder="Auto-generated if blank"
                    onInput={(event) => patch({ letterSubject: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Signature mode">
                  <select
                    value={encounter.letterSignatureMode ?? "wet"}
                    onChange={(event) =>
                      patch({
                        letterSignatureMode: event.currentTarget
                          .value as LetterSignatureMode,
                      })
                    }
                  >
                    <option value="wet">Signature line</option>
                    <option value="electronic">Electronic approval text</option>
                    <option value="none">No signature field</option>
                  </select>
                </Field>
              </div>
              <div class="wfp-row">
                <Field label="Recipient address / fax / organization" hint="optional">
                  <textarea
                    value={encounter.letterRecipientAddress ?? ""}
                    placeholder="Employer, school, agency, fax number, or address if needed."
                    onInput={(event) =>
                      patch({ letterRecipientAddress: event.currentTarget.value })
                    }
                  />
                </Field>
                <Field label="Prepared by / internal note" hint="optional">
                  <textarea
                    value={encounter.letterPreparedBy ?? ""}
                    placeholder="Prepared by staff, release instructions, or internal reference."
                    onInput={(event) =>
                      patch({ letterPreparedBy: event.currentTarget.value })
                    }
                  />
                </Field>
              </div>
              <div class="wfp-row">
                <Field label="Off work from">
                  <input
                    type="date"
                    value={encounter.offWorkStart ?? ""}
                    onInput={(event) => patch({ offWorkStart: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Through">
                  <input
                    type="date"
                    value={encounter.offWorkEnd ?? ""}
                    onInput={(event) => patch({ offWorkEnd: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Return date">
                  <input
                    type="date"
                    value={encounter.returnDate ?? ""}
                    onInput={(event) => patch({ returnDate: event.currentTarget.value })}
                  />
                </Field>
              </div>
              <div class="wfp-row">
                <Field label="Diagnosis / clinical wording" hint="provider-approved">
                  <textarea
                    value={encounter.diagnosisWording ?? ""}
                    placeholder="Example: patient is under care for a psychiatric condition. Use exact diagnosis only if provider approved release."
                    onInput={(event) =>
                      patch({ diagnosisWording: event.currentTarget.value })
                    }
                  />
                </Field>
                <Field label="Restrictions / accommodations / notes">
                  <textarea
                    value={encounter.restrictions ?? ""}
                    placeholder="Example: may return without restrictions; or provider-approved restrictions/accommodations."
                    onInput={(event) => patch({ restrictions: event.currentTarget.value })}
                  />
                </Field>
              </div>
              <p class="wfp-field-hint">
                <strong>Safety note:</strong> Staff should treat this as a draft. Diagnosis
                details, work status, restrictions, and release wording require provider
                approval before giving the letter to the patient or third party.
              </p>
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">Letter draft</div>
            <div class="wfp-section-body">
              <div class="wfp-preview">{letterDraft.bodyText}</div>
              <div class="wfp-actions">
                <button
                  type="button"
                  class="cd2004-command-button"
                  onClick={() => clickLegacyControl("letterPrint")}
                >
                  Print / save PDF
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => navigator.clipboard?.writeText(letterDraft.bodyText)}
                >
                  Copy letter text
                </button>
              </div>
              <span class="wfp-field-hint">
                Use Print / save PDF, then choose "Save as PDF" in the browser print dialog.
              </span>
            </div>
          </div>
        </div>
      )}

      <p class="wfp-field-hint">
        This module tracks operational status only. Provider determines wording, completion,
        and release of clinical/legal letters or forms.
      </p>
    </div>
  );
}

export { emptyFormsEncounter };
