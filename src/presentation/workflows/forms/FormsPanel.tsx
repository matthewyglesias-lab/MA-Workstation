import type { ComponentChildren, Ref } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
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
import { DesktopIcon } from "../../DesktopIcon";
import { clickLegacyControl } from "../legacy-mirror";
import { StatusFlag } from "../StatusFlag";
import { WorkstationDateField } from "../WorkstationDateField";
import { mirrorFormsEncounterToLegacyDom } from "./forms-legacy-mirror";
import type { PatientContext } from "../../types";
import { formatDobAsTyped } from "../../format-dob";

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
  // Native <select> rather than a custom radio-row list: the OS draws the
  // popup, keyboard type-ahead comes for free, and a closed control costs one
  // line instead of one per option. The selected option's description stays
  // visible beneath it - clinical guidance should not hide inside a tooltip.
  const selected = options.find((option) => option.key === value);
  return (
    <div class={`wfp-select-group ${inline ? "wfp-select-group-inline" : ""}`}>
      <select
        name={name}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as T)}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key} title={option.description}>
            {option.label}
          </option>
        ))}
      </select>
      {selected?.description && (
        <small class="wfp-select-desc">{selected.description}</small>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  width,
  children,
}: {
  label: string;
  hint?: string;
  /** Sizes the control to its content. Free-text fields that hold a fixed
   * shape - a date typed as MM/DD/YYYY, a short code - should not stretch to
   * a full grid column just because the grid offers one. */
  width?: "date" | "short";
  children: ComponentChildren;
}) {
  // Requirement is marked on the field itself - a red asterisk on the caption
  // and a filled control - rather than as a word of helper text underneath.
  // Only the bare "required"/"optional" markers are replaced; a hint carrying
  // real content ("required for Other") keeps its explanatory line.
  const required = hint?.startsWith("required") ?? false;
  const optional = hint?.startsWith("optional") ?? false;
  // A hint that only says "required"/"optional" is fully replaced by the
  // marker. One that qualifies it keeps the qualifier, minus the leading word
  // the marker already carries, so it does not read "optional ... optional".
  const detail =
    hint && hint !== "required" && hint !== "optional"
      ? hint.replace(/^(required|optional)[;:,]?\s*/i, "")
      : "";
  return (
    <div
      class={`wfp-field ${required ? "is-required" : ""} ${width ? `is-w-${width}` : ""}`}
    >
      <label>
        <span class="wfp-field-caption">{label}</span>
        {required && (
          <abbr class="wfp-req" title="Required">
            *
          </abbr>
        )}
        {optional && <span class="wfp-opt">optional</span>}
      </label>
      {children}
      {detail && <span class="wfp-field-hint">{detail}</span>}
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
  const formsLogCompleted = evaluation?.output.activityStatus === "completed";

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
          title={
            formsLogCompleted
              ? "Add the completed forms task to today's local activity log."
              : "Add this forms task to today's local activity log as needs review; this does not release a letter."
          }
          onClick={() => clickLegacyControl("formsAddLog")}
        >
          {formsLogCompleted ? "Log completed task" : "Log as needs review"}
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
          {!LETTER_BUILDER_ENABLED && <span class="wfp-tab-badge wfp-tab-badge-muted">N/A</span>}
          {LETTER_BUILDER_ENABLED && letterTabIssues > 0 && (
            <span class="wfp-tab-badge">{letterTabIssues}</span>
          )}
        </button>
      </div>

      {tab === "request" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section" role="group" aria-label="Patient & request">
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
                <Field label="DOB" width="date">
                  <input
                    value={encounter.patient.dob}
                    placeholder="MM/DD/YYYY"
                    inputMode="numeric"
                    onInput={(event) =>
                      patchPatient({ dob: formatDobAsTyped(event.currentTarget.value) })
                    }
                  />
                </Field>
                <Field label="Requested date">
                  <WorkstationDateField
                    value={encounter.requestDate}
                    onCommit={(next) => patch({ requestDate: next })}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div class="wfp-section" role="group" aria-label="Type of request">
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
                  <WorkstationDateField
                    value={encounter.targetDate}
                    onCommit={(next) => patch({ targetDate: next })}
                  />
                </Field>
              </div>
              <div class="wfp-row">
                {/* Request status sits with the other request-tracking states
                    rather than in a group box of its own. A bordered section
                    wrapping a single dropdown is chrome without content, and
                    it separated status from the three fields staff read it
                    alongside. */}
                <Field label="Status">
                  <OptionList<FormRequestStatus>
                    name="forms-status"
                    value={encounter.status}
                    onChange={(value) => patch({ status: value })}
                    options={FORM_STATUS_OPTIONS}
                    inline
                  />
                </Field>
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

          <div class="wfp-section" role="group" aria-label="Document output">
            <div class="wfp-section-head">Document output</div>
            <div class="wfp-section-body">
              <p class="wfp-field-hint wfp-document-output-hint">
                Printing and handoff use the same local encounter snapshot as Clinical Documentation, in the sidebar.
              </p>
              <div class="wfp-actions">
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => navigator.clipboard?.writeText(noteText)}
                  disabled={!noteText}
                >
                  <DesktopIcon name="copy" />
                  Copy note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "letter" && !LETTER_BUILDER_ENABLED && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-wall">
            <div class="wfp-wall-title">Letter Builder — Module Not Installed</div>
            <p>
              Provider letter drafting is not available in this build.
            </p>
          </div>
        </div>
      )}

      {tab === "letter" && LETTER_BUILDER_ENABLED && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section" role="group" aria-label="Letter purpose">
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

          <div class="wfp-section" role="group" aria-label="Letter details">
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
                  <WorkstationDateField
                    value={encounter.letterDate ?? ""}
                    onCommit={(next) => patch({ letterDate: next })}
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
                  <WorkstationDateField
                    value={encounter.offWorkStart ?? ""}
                    onCommit={(next) => patch({ offWorkStart: next })}
                  />
                </Field>
                <Field label="Through">
                  <WorkstationDateField
                    value={encounter.offWorkEnd ?? ""}
                    onCommit={(next) => patch({ offWorkEnd: next })}
                  />
                </Field>
                <Field label="Return date">
                  <WorkstationDateField
                    value={encounter.returnDate ?? ""}
                    onCommit={(next) => patch({ returnDate: next })}
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

          <div class="wfp-section" role="group" aria-label="Letter draft">
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
