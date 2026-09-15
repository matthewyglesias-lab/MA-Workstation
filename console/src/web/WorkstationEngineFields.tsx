import type { InjectionCase } from "../shared/injections.js";
import type { WorkstationState } from "../shared/workstation-contracts.js";
import type { ClinicalEvaluation } from "../shared/workstation/domain/contracts.js";
import {
  INJECTION_REASON_OPTIONS,
  INJECTION_RESPONSE_OPTIONS,
  INJECTION_DEPARTURE_STATUS_OPTIONS,
  INJECTION_SAFETY_TRIGGERS,
  injectionInitiationOptions,
  injectionInitiationConfig,
  emptyInjectionInitiation,
  medicationVerificationLabel,
  medicationPreparationGuidance,
  isMedicationPreparationVerification,
  injectionResponseNote,
  findInjectionResponseOption,
  injectionTimingReviewFingerprint,
  hasCurrentLateDoseReview,
  type InjectionEncounter,
  type InjectionEvaluationOutput,
} from "../shared/workstation/domain/injection.js";
import {
  INJECTION_INTERVAL_OPTIONS,
  compatibleIntervalsForDose,
} from "../shared/workstation/domain/injection-catalog.js";
import {
  resolveNdcOptions,
  selectionForNdcInput,
  formatNdcPackageOption,
} from "../shared/workstation/domain/injection-ndc.js";
import {
  workstationPolicyReviewFingerprint,
  hasCurrentWorkstationPolicyReview,
  workstationSchedule,
} from "../shared/workstation-clinical-policy.js";
import {
  clinicInputToIso,
  clinicLocalInput,
  clinicDay,
} from "./injection-time.js";
import { Field } from "./components.js";
import "./workstation-engine.css";

type Stage = "order" | "review" | "administer";
type Props = {
  stage: Stage;
  value: WorkstationState;
  encounter: InjectionEncounter;
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput>;
  onChange: (value: WorkstationState) => void;
  cases?: InjectionCase[];
  record?: InjectionCase;
  onReturnDate?: (value: string) => void;
  timezone?: string;
};

export function WorkstationEngineFields({
  stage,
  value,
  encounter,
  evaluation,
  onChange,
  cases = [],
  record,
  onReturnDate,
  timezone = "America/Los_Angeles",
}: Props) {
  const patch = (change: Partial<WorkstationState>) =>
    onChange({ ...value, ...change });
  const oral = (change: Partial<NonNullable<WorkstationState["oral"]>>) =>
    patch({
      oral: {
        product: "",
        dose: "",
        source: "",
        ...value.oral,
        status:
          value.initiation.oralStatus === "administered"
            ? "administered"
            : "verified",
        ...change,
      },
    });
  const detail = (change: Partial<WorkstationState["details"]>) =>
    patch({ details: { ...value.details, ...change } });
  const initiation = (change: Partial<WorkstationState["initiation"]>) =>
    patch({
      initiation: { ...value.initiation, ...change },
      ...(change.oralStatus !== undefined &&
      change.oralStatus !== value.initiation.oralStatus
        ? { oral: undefined }
        : {}),
    });
  const medication = evaluation.output.medication;
  const intervalOptions =
    medication && encounter.dose
      ? compatibleIntervalsForDose(medication, encounter.dose)
      : [];
  const protocols = injectionInitiationOptions(encounter.medicationKey);
  const protocol = injectionInitiationConfig(
    value.initiation.protocol,
    encounter.medicationKey,
  );
  const initiationVisible =
    protocols.length > 0 &&
    ["initiation", "loading", "reinit"].includes(encounter.reason);
  const responseOptions =
    findInjectionResponseOption(value.response.kind)?.details || [];
  const pair = cases.find((candidate) => candidate.id === value.pairedCaseId);
  const expected = evaluation.output.expectedNextDoseDate;
  const reviewContext = {
    indication: record?.clinicalContext?.indication || undefined,
    priorMaintenanceDoses: value.priorMaintenanceDoses,
    priorDose: record?.clinicalContext?.priorDose,
    priorProduct: record?.clinicalContext?.priorProduct,
  };
  const ndcOptions = resolveNdcOptions({
    medicationKey: encounter.medicationKey,
    dose: encounter.dose,
  });
  const singleOralDose = ["maintena-1day", "asimtufii-1day"].includes(
    value.initiation.protocol,
  )
    ? "20 mg"
    : value.initiation.protocol === "aristada-initio-sameday"
      ? "30 mg"
      : "";
  const retrospective = value.recordingMode === "retrospective";
  const providerReviewNeeded =
    evaluation.output.lateDoseWarning ||
    evaluation.stops.some((issue) => issue.field === "details.lateDoseReview");
  function confirmProviderReview(confirmed: boolean) {
    const plan = !initiationVisible
      ? {
          ...value.initiation,
          planVerified: confirmed,
          providerNote: confirmed
            ? value.details.lateDoseReviewNote || ""
            : value.initiation.providerNote,
        }
      : value.initiation;
    const reviewedEncounter = {
      ...encounter,
      initiation: {
        ...encounter.initiation!,
        ...plan,
        second: encounter.initiation!.second,
      },
    };
    patch({
      initiation: plan,
      details: {
        ...value.details,
        lateDoseReview: confirmed ? "provider-authorized" : "",
        lateDoseReviewFingerprint: confirmed
          ? workstationPolicyReviewFingerprint(reviewedEncounter, reviewContext)
          : "",
      },
    });
  }
  const applicableTriggers = INJECTION_SAFETY_TRIGGERS.filter(
    (trigger) =>
      !trigger.medications ||
      (encounter.medicationKey &&
        trigger.medications.includes(encounter.medicationKey)),
  );
  const setReturnSource = (source: "active-order" | "provider-direction") =>
    detail({
      nextDose: {
        ...value.details.nextDose,
        value: encounter.nextDoseDate,
        source: "manual",
        overrideKind: source,
        recordedAt: new Date().toISOString(),
      },
    });
  return (
    <section class="form-section engine-fields">
      {stage === "order" && (
        <>
          <h3>Clinical pathway</h3>
          <div class="form-grid">
            <Field label="Injection visit purpose">
              <select
                required
                value={value.reason || encounter.reason}
                onChange={(e) =>
                  patch({
                    reason: e.currentTarget.value as WorkstationState["reason"],
                  })
                }
              >
                <option value="">Choose the ordered pathway</option>
                {INJECTION_REASON_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            {encounter.medicationKey !== "other" && (
              <Field label="Product cadence">
                <select
                  required
                  value={value.intervalKey || encounter.intervalKey}
                  onChange={(e) =>
                    patch({
                      intervalKey: e.currentTarget
                        .value as WorkstationState["intervalKey"],
                    })
                  }
                >
                  <option value="">Select cadence from order</option>
                  {INJECTION_INTERVAL_OPTIONS.filter(
                    (option) =>
                      !intervalOptions.length ||
                      intervalOptions.includes(option.key) ||
                      option.key === value.intervalKey,
                  ).map((option) => (
                    <option key={option.key} value={option.key}>
                      {(() => {
                        const schedule = workstationSchedule({
                          ...encounter,
                          reason: "scheduled",
                          initiation: undefined,
                          intervalKey: option.key,
                        });
                        return schedule
                          ? `Every ${schedule.every} ${schedule.unit === "months" ? "calendar months" : schedule.unit}`
                          : option.label;
                      })()}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {encounter.medicationKey === "maintena" && (
            <Field label="Verified previous maintenance injections">
              <input
                type="number"
                min="0"
                max="10000"
                step="1"
                value={value.priorMaintenanceDoses ?? ""}
                placeholder="Leave blank when not established"
                onInput={(e) =>
                  patch({
                    priorMaintenanceDoses:
                      e.currentTarget.value === ""
                        ? undefined
                        : Number(e.currentTarget.value),
                  })
                }
              />
            </Field>
          )}
          <Field label="Previous injection site">
            <input
              value={value.priorSite}
              list="workstation-prior-sites"
              maxLength={100}
              placeholder="Verified prior site and laterality, if known"
              onInput={(e) => patch({ priorSite: e.currentTarget.value })}
            />
          </Field>
          <datalist id="workstation-prior-sites">
            {evaluation.output.allowedSites.map((site) => (
              <option value={site} key={site} />
            ))}
          </datalist>
        </>
      )}
      {initiationVisible && stage !== "administer" && (
        <div class="engine-protocol">
          <h4>Initiation / restart protocol</h4>
          <Field label="Ordered initiation protocol">
            <select
              required
              value={value.initiation.protocol}
              disabled={
                stage === "review" && !!record?.workstation?.initiation.protocol
              }
              onChange={(e) => {
                const blank = emptyInjectionInitiation();
                patch({
                  pairedCaseId: undefined,
                  initiation: {
                    ...blank,
                    protocol: e.currentTarget
                      .value as WorkstationState["initiation"]["protocol"],
                    second: { ...blank.second, given: false },
                  },
                });
              }}
            >
              <option value="">Select the verified order pathway</option>
              {protocols.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.title}
                </option>
              ))}
            </select>
          </Field>
          {protocol && (
            <>
              <p>{protocol.summary}</p>
              {(protocol.kind === "sustenna-day1" ||
                protocol.kind === "sustenna-day8") && (
                <>
                  <Field label="Sustenna ordered regimen">
                    <select
                      required
                      value={value.initiation.sustennaOrder}
                      onChange={(e) =>
                        initiation({
                          sustennaOrder: e.currentTarget
                            .value as WorkstationState["initiation"]["sustennaOrder"],
                        })
                      }
                    >
                      <option value="">Select provider-verified regimen</option>
                      <option value="standard">Standard labeled regimen</option>
                      <option value="mild">
                        Mild renal impairment regimen, ordered
                      </option>
                      <option value="other">
                        Other provider-directed regimen
                      </option>
                    </select>
                  </Field>
                  {protocol.kind === "sustenna-day8" && (
                    <Field label="Confirmed Sustenna Day 1 date">
                      <input
                        required
                        type="date"
                        value={value.initiation.day1Date}
                        onInput={(e) =>
                          initiation({ day1Date: e.currentTarget.value })
                        }
                      />
                    </Field>
                  )}
                </>
              )}
              {protocol.kind === "dual" && (
                <>
                  <Field label="Separate injection component">
                    <select
                      value={value.pairedCaseId || ""}
                      onChange={(e) =>
                        patch({
                          pairedCaseId: e.currentTarget.value || undefined,
                        })
                      }
                    >
                      <option value="">
                        Select its separate injection record
                      </option>
                      {cases
                        .filter(
                          (candidate) =>
                            candidate.patientId === record?.patientId &&
                            candidate.id !== record?.id &&
                            !["held", "cancelled"].includes(candidate.status),
                        )
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.administration?.reviewSnapshot
                              .productSnapshot.name ||
                            candidate.review?.productSnapshot.name
                              ? `${candidate.administration?.reviewSnapshot.productSnapshot.name || candidate.review?.productSnapshot.name} · `
                              : ""}
                            Sequence {candidate.doseSequence} · {candidate.dose}{" "}
                            {candidate.doseUnit} · {candidate.site} ·{" "}
                            {candidate.status}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <div class="engine-pair-status">
                    <strong>{protocol.secondaryProduct}</strong>
                    {pair?.administration
                      ? `Separate administration recorded: ${pair.administration.administeredAt}.`
                      : pair
                        ? `Separate order linked (${pair.status}); administration remains pending.`
                        : `Create and review a separate ${protocol.secondaryProduct?.replace(/^Injection 2 — /, "") || "component"} order, then link it here.`}
                  </div>
                  <p>{protocol.secondaryGuide}</p>
                  <p class="field-help">
                    Each physical injection has its own stock reservation and
                    administration. Linking the order does not mark that
                    component given.
                  </p>
                </>
              )}
              {(protocol.kind === "oral" || protocol.kind === "dual") &&
                stage === "review" && (
                  <Field label={protocol.oralLabel}>
                    <select
                      required
                      value={value.initiation.oralStatus}
                      onChange={(e) =>
                        initiation({
                          oralStatus: e.currentTarget
                            .value as WorkstationState["initiation"]["oralStatus"],
                        })
                      }
                    >
                      <option value="">Record the oral component status</option>
                      <option value="verified">
                        Oral plan verified in the clinical record
                      </option>
                      <option value="administered">
                        Dose actually administered and documented in the
                        clinical record
                      </option>
                    </select>
                  </Field>
                )}
              {(protocol.kind === "oral" || protocol.kind === "dual") &&
                stage === "review" &&
                value.initiation.oralStatus && (
                  <div class="engine-protocol">
                    {singleOralDose && (
                      <p class="field-help">
                        This selected initiation protocol includes one oral
                        aripiprazole {singleOralDose} dose. Record the
                        medication and dose separately, with the source and
                        actual status. If the order specifies a different plan,
                        use the provider-directed pathway.
                      </p>
                    )}
                    <div class="form-grid">
                      <Field label="Oral medication">
                        <input
                          required
                          maxLength={160}
                          value={value.oral?.product || ""}
                          placeholder={
                            singleOralDose
                              ? "aripiprazole"
                              : "Exact oral medication in the order"
                          }
                          onInput={(e) =>
                            oral({ product: e.currentTarget.value })
                          }
                        />
                      </Field>
                      <Field label="Oral dose and units">
                        <input
                          required
                          maxLength={100}
                          value={value.oral?.dose || ""}
                          placeholder={
                            singleOralDose || "Dose and units as ordered"
                          }
                          onInput={(e) => oral({ dose: e.currentTarget.value })}
                        />
                      </Field>
                    </div>
                    <Field label="Oral component clinical record reference">
                      <input
                        required
                        maxLength={2000}
                        value={value.oral?.source || ""}
                        onInput={(e) => oral({ source: e.currentTarget.value })}
                      />
                    </Field>
                    {value.initiation.oralStatus === "administered" && (
                      <Field label="Actual oral administration time">
                        <input
                          required
                          type="datetime-local"
                          value={
                            value.oral?.administeredAt
                              ? clinicLocalInput(
                                  value.oral.administeredAt,
                                  timezone,
                                ).slice(0, 16)
                              : ""
                          }
                          onInput={(e) =>
                            oral({
                              administeredAt: e.currentTarget.value
                                ? clinicInputToIso(
                                    e.currentTarget.value,
                                    timezone,
                                  )
                                : undefined,
                            })
                          }
                        />
                      </Field>
                    )}
                    <div class="form-grid">
                      <Field label="Oral continuation start">
                        <input
                          type="date"
                          value={value.oral?.startOn || ""}
                          onInput={(e) =>
                            oral({
                              startOn: e.currentTarget.value || undefined,
                            })
                          }
                        />
                      </Field>
                      <Field label="Oral continuation end">
                        <input
                          type="date"
                          value={value.oral?.endOn || ""}
                          onInput={(e) =>
                            oral({ endOn: e.currentTarget.value || undefined })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                )}
              <Field label="Protocol instructions / oral component source">
                <textarea
                  required={
                    protocol.kind === "provider" ||
                    value.initiation.oralStatus === "administered"
                  }
                  rows={2}
                  maxLength={2000}
                  value={value.initiation.providerNote}
                  placeholder="Exact provider instructions and clinical record reference for oral or paired components"
                  onInput={(e) =>
                    initiation({ providerNote: e.currentTarget.value })
                  }
                />
              </Field>
              {stage === "review" && (
                <label class="engine-verification">
                  <input
                    type="checkbox"
                    required
                    checked={value.initiation.planVerified}
                    onChange={(e) =>
                      initiation({ planVerified: e.currentTarget.checked })
                    }
                  />
                  <span>
                    Exact protocol and each ordered component verified against
                    the active provider order.
                  </span>
                </label>
              )}
            </>
          )}
        </div>
      )}
      {stage !== "administer" &&
        protocols.length === 0 &&
        ["initiation", "reinit", "loading"].includes(encounter.reason) && (
          <div class="engine-protocol">
            <h4>Provider-directed regimen</h4>
            <Field label="Initiation / restart instructions">
              <textarea
                rows={3}
                required
                maxLength={2000}
                value={value.initiation.providerNote}
                onInput={(e) =>
                  initiation({ providerNote: e.currentTarget.value })
                }
              />
            </Field>
            {stage === "review" && (
              <label class="engine-verification">
                <input
                  type="checkbox"
                  required
                  checked={value.initiation.planVerified}
                  onChange={(e) =>
                    initiation({ planVerified: e.currentTarget.checked })
                  }
                />
                <span>
                  Provider instructions and regimen verified in the clinical
                  record.
                </span>
              </label>
            )}
          </div>
        )}
      {stage === "order" && (encounter.nextDoseDate || expected) && (
        <details
          class="engine-secondary-detail"
          open={!!value.details.nextDose?.overrideKind}
        >
          <summary>Return date source</summary>
          {expected && (
            <div class="engine-reference-options">
              <button
                type="button"
                onClick={() => {
                  onReturnDate?.(expected);
                  detail({
                    nextDose: {
                      value: expected,
                      source: "calculated",
                      calculatedFrom:
                        injectionTimingReviewFingerprint(encounter),
                      recordedAt: new Date().toISOString(),
                    },
                  });
                }}
              >
                Use calculated target: {expected}
              </button>
            </div>
          )}
          <Field label="Return date authority">
            <select
              value={value.details.nextDose?.overrideKind || ""}
              onChange={(e) => {
                if (e.currentTarget.value)
                  setReturnSource(
                    e.currentTarget.value as
                      "active-order" | "provider-direction",
                  );
              }}
            >
              <option value="">Record a source for an entered date</option>
              <option value="active-order">Active provider order</option>
              <option value="provider-direction">
                Separate provider direction
              </option>
            </select>
          </Field>
          {value.details.nextDose?.overrideKind && (
            <Field label="Return date order reference / reason">
              <input
                required
                maxLength={2000}
                value={value.details.nextDose.overrideReason || ""}
                onInput={(e) =>
                  detail({
                    nextDose: {
                      ...value.details.nextDose,
                      value: encounter.nextDoseDate,
                      overrideReason: e.currentTarget.value,
                    },
                  })
                }
              />
            </Field>
          )}
          {value.details.nextDose?.overrideKind === "provider-direction" && (
            <Field label="Return date authorizing provider">
              <input
                required
                maxLength={160}
                value={value.details.nextDose.overrideProvider || ""}
                onInput={(e) =>
                  detail({
                    nextDose: {
                      ...value.details.nextDose,
                      overrideProvider: e.currentTarget.value,
                    },
                  })
                }
              />
            </Field>
          )}
        </details>
      )}
      {stage === "order" &&
        encounter.administrationDate < clinicDay(timezone) && (
          <div class="engine-protocol">
            <label class="engine-verification">
              <input
                type="checkbox"
                checked={value.recordingMode === "retrospective"}
                onChange={(e) =>
                  patch({
                    recordingMode: e.currentTarget.checked
                      ? "retrospective"
                      : "prospective",
                    stockNotPreviouslyRecorded: false,
                  })
                }
              />
              <span>Document an injection that already happened.</span>
            </label>
            {value.recordingMode === "retrospective" && (
              <Field label="Reason for retrospective entry">
                <textarea
                  required
                  rows={2}
                  maxLength={2000}
                  value={value.retrospectiveReason || ""}
                  onInput={(e) =>
                    patch({ retrospectiveReason: e.currentTarget.value })
                  }
                />
              </Field>
            )}
            <p class="field-help">
              The actual administration time and today’s entry time remain
              distinct. The review records historical information and does not
              imply prospective clearance.
            </p>
          </div>
        )}
      {stage === "review" && value.recordingMode === "retrospective" && (
        <div class="engine-protocol">
          <h4>Retrospective documentation review</h4>
          <p>{value.retrospectiveReason}</p>
          <label class="engine-verification">
            <input
              type="checkbox"
              required
              checked={!!value.stockNotPreviouslyRecorded}
              onChange={(e) =>
                patch({ stockNotPreviouslyRecorded: e.currentTarget.checked })
              }
            />
            <span>
              This package has not already been recorded as used in this
              inventory.
            </span>
          </label>
        </div>
      )}
      {stage === "review" && (
        <>
          <h3>Product-specific clinical checks</h3>
          {evaluation.output.requiredVerifications.map((key) => (
            <label class="engine-verification" key={key}>
              <input
                type="checkbox"
                required={!retrospective}
                checked={!!value.verifications[key]}
                onChange={(e) =>
                  patch({
                    verifications: {
                      ...value.verifications,
                      [key]: e.currentTarget.checked,
                    },
                  })
                }
              />
              <span>
                {retrospective ? "Documented in the source record: " : ""}
                {medicationVerificationLabel(medication, key)}
                {isMedicationPreparationVerification(key) && (
                  <small>
                    {medicationPreparationGuidance(
                      medication,
                      encounter.dose,
                      encounter.site,
                    )}
                  </small>
                )}
              </span>
            </label>
          ))}
          <label class="engine-verification">
            <input
              type="checkbox"
              required={!retrospective}
              checked={!!value.attestations.hygiene}
              onChange={(e) =>
                patch({
                  attestations: {
                    ...value.attestations,
                    hygiene: e.currentTarget.checked,
                  },
                })
              }
            />
            <span>
              {retrospective
                ? "Aseptic preparation and technique documented in the source record."
                : "Aseptic preparation and administration technique confirmed."}
            </span>
          </label>
          <details
            class="engine-secondary-detail"
            open={value.activeSafetyConcerns.length > 0}
          >
            <summary>Acute concerns requiring escalation</summary>
            {applicableTriggers.map((trigger) => (
              <label class="engine-verification" key={trigger.key}>
                <input
                  type="checkbox"
                  checked={value.activeSafetyConcerns.includes(trigger.key)}
                  onChange={(e) =>
                    patch({
                      activeSafetyConcerns: e.currentTarget.checked
                        ? [...value.activeSafetyConcerns, trigger.key]
                        : value.activeSafetyConcerns.filter(
                            (key) => key !== trigger.key,
                          ),
                      acuteSafetyScreenConfirmed: false,
                    })
                  }
                />
                <span>
                  {trigger.label}
                  <small>{trigger.description}</small>
                </span>
              </label>
            ))}
          </details>
          <label class="engine-verification">
            <input
              type="checkbox"
              required={!retrospective}
              checked={value.acuteSafetyScreenConfirmed}
              disabled={value.activeSafetyConcerns.length > 0}
              onChange={(e) =>
                patch({ acuteSafetyScreenConfirmed: e.currentTarget.checked })
              }
            />
            <span>
              {retrospective
                ? "Absence of acute safety concerns documented at the time of the event."
                : "No unresolved acute safety concern after today’s screening."}
            </span>
          </label>
          <Field label="Assessed body habitus">
            <select
              value={value.habitus || ""}
              onChange={(e) =>
                patch({
                  habitus: (e.currentTarget.value ||
                    undefined) as WorkstationState["habitus"],
                })
              }
            >
              <option value="">Not separately assessed</option>
              <option value="lean">Lean / less overlying tissue</option>
              <option value="average">Average overlying tissue</option>
              <option value="larger">Larger amount of overlying tissue</option>
            </select>
          </Field>
          {providerReviewNeeded && !retrospective && (
            <div class="engine-protocol">
              <h4>Provider review of clinical timing</h4>
              <p>{evaluation.output.timing.message}</p>
              <label class="engine-verification">
                <input
                  type="checkbox"
                  checked={hasCurrentWorkstationPolicyReview(
                    encounter,
                    reviewContext,
                  )}
                  disabled={
                    !value.details.lateDoseReviewProvider?.trim() ||
                    !value.details.lateDoseReviewTime?.trim() ||
                    !value.details.lateDoseReviewNote?.trim()
                  }
                  onChange={(e) =>
                    confirmProviderReview(e.currentTarget.checked)
                  }
                />
                <span>
                  The provider communication documented above specifically
                  authorizes this medication, dose, clinical pathway, and
                  timing. Its instructions are the reviewed regimen plan.
                </span>
              </label>
              <p class="field-help">
                Authorization is bound to the medication, dose, cadence, prior
                date, visit date, and protocol. Changing those facts requires a
                new review.
              </p>
            </div>
          )}
          <details class="engine-secondary-detail">
            <summary>Package NDC reference</summary>
            <p>
              Inventory NDC:{" "}
              <strong>
                {encounter.traceability.ndc ||
                  "Not recorded — update the product in Inventory"}
              </strong>
            </p>
            {ndcOptions.length ? (
              ndcOptions.map((option) => (
                <p key={option.id} class="field-help">
                  {formatNdcPackageOption(option)}
                </p>
              ))
            ) : (
              <p class="field-help">
                No bundled package match. Verify the physical package and
                product record.
              </p>
            )}
            <label class="engine-verification">
              <input
                type="checkbox"
                checked={!!value.details.ndcSelection?.primary}
                disabled={!encounter.traceability.ndc}
                onChange={(e) =>
                  detail({
                    ndcSelection: e.currentTarget.checked
                      ? {
                          primary: selectionForNdcInput(
                            encounter.traceability.ndc,
                            {
                              medicationKey: encounter.medicationKey,
                              dose: encounter.dose,
                            },
                          ),
                        }
                      : undefined,
                  })
                }
              />
              <span>
                I matched the physical package to the inventory NDC and
                documented its reference source.
              </span>
            </label>
          </details>
        </>
      )}
      {stage === "administer" && (
        <>
          <h3>Patient response</h3>
          <Field label="Response observed">
            <select
              required
              value={value.response.kind}
              onChange={(e) =>
                patch({
                  response: {
                    kind: e.currentTarget
                      .value as WorkstationState["response"]["kind"],
                    detail: "",
                    custom: "",
                  },
                })
              }
            >
              <option value="">Choose the response actually observed</option>
              {INJECTION_RESPONSE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {responseOptions.length > 0 && (
            <Field label="Response detail">
              <select
                value={value.response.detail || ""}
                onChange={(e) =>
                  patch({
                    response: {
                      ...value.response,
                      detail: e.currentTarget.value,
                    },
                  })
                }
              >
                <option value="">Use the response above</option>
                {responseOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {value.response.kind === "custom" && (
            <Field label="Tolerance / patient response">
              <textarea
                required
                rows={2}
                maxLength={1000}
                value={value.response.custom || ""}
                onInput={(e) =>
                  patch({
                    response: {
                      ...value.response,
                      custom: e.currentTarget.value,
                    },
                  })
                }
              />
            </Field>
          )}
          {injectionResponseNote(value.response) && (
            <div class="engine-response-preview">
              <strong>Will document</strong>
              <p>{injectionResponseNote(value.response)}</p>
              <label
                class="engine-verification"
                key={injectionResponseNote(value.response)}
              >
                <input type="checkbox" required />
                <span>
                  Every finding and action in this response wording occurred.
                </span>
              </label>
            </div>
          )}
          <details
            class="engine-secondary-detail"
            open={value.details.waste || value.details.productIssue}
          >
            <summary>Administration details & exceptions</summary>
            <div class="form-grid">
              <Field label="Actual volume">
                <input
                  value={value.details.volume || ""}
                  maxLength={100}
                  onInput={(e) =>
                    detail({ volume: e.currentTarget.value, volumeUnit: "mL" })
                  }
                  placeholder="mL, if separately documented"
                />
              </Field>
              <Field label="Delivery device">
                <select
                  value={value.details.device || ""}
                  onChange={(e) => detail({ device: e.currentTarget.value })}
                >
                  <option value="">Not separately documented</option>
                  {[
                    "Prefilled syringe",
                    "Needle and syringe",
                    "Manufacturer-supplied kit",
                    "Other",
                  ].map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </Field>
            </div>
            {value.details.device === "Other" && (
              <Field label="Other device">
                <input
                  required
                  value={value.details.deviceOther || ""}
                  maxLength={500}
                  onInput={(e) =>
                    detail({ deviceOther: e.currentTarget.value })
                  }
                />
              </Field>
            )}
            <label class="engine-verification">
              <input
                type="checkbox"
                checked={!!value.details.waste}
                onChange={(e) => detail({ waste: e.currentTarget.checked })}
              />
              <span>Record medication waste from the used package.</span>
            </label>
            {value.details.waste && (
              <div class="form-grid">
                <Field label="Waste amount and unit">
                  <input
                    required
                    value={value.details.wasteAmount || ""}
                    maxLength={300}
                    onInput={(e) =>
                      detail({ wasteAmount: e.currentTarget.value })
                    }
                  />
                </Field>
                <Field label="Waste witness">
                  <input
                    value={value.details.wasteWitness || ""}
                    maxLength={160}
                    onInput={(e) =>
                      detail({ wasteWitness: e.currentTarget.value })
                    }
                  />
                </Field>
              </div>
            )}
            <label class="engine-verification">
              <input
                type="checkbox"
                checked={!!value.details.productIssue}
                onChange={(e) =>
                  detail({ productIssue: e.currentTarget.checked })
                }
              />
              <span>Product or device issue occurred.</span>
            </label>
            {value.details.productIssue && (
              <>
                <Field label="Product / device issue">
                  <textarea
                    required
                    rows={2}
                    maxLength={2000}
                    value={value.details.productIssueDetail || ""}
                    onInput={(e) =>
                      detail({ productIssueDetail: e.currentTarget.value })
                    }
                  />
                </Field>
                <Field label="Immediate action / product disposition">
                  <textarea
                    required
                    rows={2}
                    maxLength={2000}
                    value={value.details.productIssueAction || ""}
                    onInput={(e) =>
                      detail({ productIssueAction: e.currentTarget.value })
                    }
                  />
                </Field>
                <div class="form-grid">
                  <Field label="Issue recipient notified">
                    <input
                      required
                      maxLength={160}
                      value={value.details.productIssueRecipient || ""}
                      onInput={(e) =>
                        detail({ productIssueRecipient: e.currentTarget.value })
                      }
                    />
                  </Field>
                  <Field label="Issue notification time">
                    <input
                      required
                      type="datetime-local"
                      value={value.details.productIssueNotificationTime || ""}
                      onInput={(e) =>
                        detail({
                          productIssueNotificationTime: e.currentTarget.value,
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="Direction received">
                  <textarea
                    required
                    rows={2}
                    maxLength={2000}
                    value={value.details.productIssueDirection || ""}
                    onInput={(e) =>
                      detail({ productIssueDirection: e.currentTarget.value })
                    }
                  />
                </Field>
                <Field label="Next step / responsible person / timing">
                  <input
                    required
                    maxLength={2000}
                    value={value.details.productIssueNextStep || ""}
                    onInput={(e) =>
                      detail({ productIssueNextStep: e.currentTarget.value })
                    }
                  />
                </Field>
              </>
            )}
          </details>
          <div class="form-grid">
            <Field label="Departure status">
              <select
                value={value.details.departureStatus || ""}
                onChange={(e) =>
                  detail({
                    departureStatus: e.currentTarget
                      .value as WorkstationState["details"]["departureStatus"],
                  })
                }
              >
                <option value="">Not separately documented</option>
                {INJECTION_DEPARTURE_STATUS_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
                <option value="custom">Other — describe</option>
              </select>
            </Field>
            <Field label="Departure note">
              <input
                required={value.details.departureStatus === "custom"}
                maxLength={2000}
                value={value.details.departureStatusNote || ""}
                onInput={(e) =>
                  detail({ departureStatusNote: e.currentTarget.value })
                }
              />
            </Field>
          </div>
        </>
      )}
    </section>
  );
}
