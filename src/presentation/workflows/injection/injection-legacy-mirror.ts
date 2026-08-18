import {
  INJECTION_SAFETY_TRIGGERS,
  InjectionEngine,
  legacyInjectionResponseMirror,
  type InjectionEncounter,
} from "../../../domain/injection";
import type { MedicationVerificationKey } from "../../../domain/injection-catalog";
import type { InjectionDocumentationMetadata } from "../../../domain/injection-ndc";
import { injectionEncounterToDocumentationInput } from "../../../documentation/adapters/injection-from-encounter";
import type { InjectionNoteFacts } from "../../../documentation/types";
import { setLegacyCheckboxValue, setLegacyFieldValue } from "../legacy-mirror";
import { resolveProviderDisplay } from "../../../domain/provider-register";

declare global {
  interface Window {
    ipmgSetInjectionChipState?: (patch: {
      medicationKey?: string;
      customMedication?: string;
      dose?: string;
      site?: string;
      route?: string;
      intervalKey?: string;
      reason?: string;
      response?: string;
      attestations?: Record<string, boolean>;
      verifications?: Record<string, boolean>;
      /**
       * The typed evaluator owns phase-aware medication checks.  Passing the
       * applicable keys into the compatibility layer prevents legacy blanket
       * flags from turning an initiation-only item into a routine stop.
       */
      requiredVerifications?: MedicationVerificationKey[];
      safetyConcerns?: Record<string, boolean>;
      acuteSafetyScreenConfirmed?: boolean;
      initiation?: {
        protocol?: string;
        planVerified?: boolean;
        oralStatus?: string;
        providerNote?: string;
        sustennaOrder?: string;
        day1Date?: string;
        second?: {
          dose?: string;
          site?: string;
          ndc?: string;
          lot?: string;
          exp?: string;
          given?: boolean;
          orderVerified?: boolean;
          note?: string;
        };
      };
      disposition?: {
        kind?: string;
        provider?: string;
        time?: string;
        outcome?: string;
        reviewedBy?: string;
        reviewedAt?: string;
        reviewFingerprint?: string;
      };
      documentation?: InjectionDocumentationMetadata;
    }) => void;
    /**
     * Pull accessor for the typed RC6.1 note-fact set, read by
     * readLegacyInjectionDocumentation() so the legacy-DOM-driven note
     * preview (the right-rail inspector, fed via window._note) renders the
     * same compact note as the typed panel's own "Document output" preview
     * instead of falling back to the pre-RC6.1 verbose format. Always
     * reflects the most recently mirrored encounter; undefined when that
     * encounter isn't in the administered state.
     */
    ipmgInjectionNoteFacts?: () => InjectionNoteFacts | undefined;
  }
}

/**
 * Mirrors an InjectionEncounter into the hidden legacy #panel-administer
 * fields (and the legacy S-chip/initiation-protocol/disposition state,
 * which isn't backed by plain DOM values) so renderAVS(),
 * renderInjectionWorksheet(), the readiness/note computation, and "Add to
 * today's log" keep working unchanged, driven by this panel instead of the
 * legacy interactive markup.
 */
export function mirrorInjectionEncounterToLegacyDom(encounter: InjectionEncounter): void {
  // Keep the legacy compatibility gate aligned with the typed clinical
  // evaluator.  In particular, some legacy products expose every possible
  // product flag, whereas the current reference bundle makes a subset apply
  // only to initiation or re-initiation phases.
  const evaluation = InjectionEngine.evaluate(encounter, {});
  const requiredVerifications = evaluation.output.requiredVerifications;
  window.ipmgInjectionNoteFacts = () =>
    injectionEncounterToDocumentationInput(encounter, evaluation)?.noteFacts;

  setLegacyFieldValue("ptName", encounter.patient.name);
  setLegacyFieldValue("ptDOB", encounter.patient.dob);
  // Mirror the resolved display name, not the register id: legacy code
  // reads this DOM value directly for the printed AVS handout and the
  // compact note/summary lines, all of which are read by staff or the
  // patient rather than matched against anything.
  setLegacyFieldValue("orderingProvider", resolveProviderDisplay(encounter.orderingProvider));
  setLegacyFieldValue("injOrderPurpose", encounter.details?.purpose ?? "");
  setLegacyFieldValue("priorDose", encounter.priorDoseDate);
  setLegacyFieldValue("priorSite", encounter.priorSite ?? "");
  setLegacyFieldValue("adminDate", encounter.administrationDate);
  setLegacyFieldValue("injAdminTime", encounter.administrationTime);
  setLegacyFieldValue("injSecondAdminTime", encounter.secondAdministrationTime ?? "");
  setLegacyFieldValue("nextDate", encounter.nextDoseDate);
  setLegacyFieldValue("admin", encounter.administeredBy);
  setLegacyFieldValue("allergies", encounter.allergies);
  setLegacyFieldValue("tech", encounter.technique ?? "");
  setLegacyFieldValue("ndc", encounter.traceability.ndc);
  setLegacyFieldValue("lot", encounter.traceability.lot);
  setLegacyFieldValue("exp", encounter.traceability.expiration);
  setLegacyFieldValue("bp", encounter.vitals?.bp ?? "");
  setLegacyFieldValue("hr", encounter.vitals?.hr ?? "");
  setLegacyFieldValue("temp", encounter.vitals?.temperature ?? "");
  setLegacyFieldValue("rr", encounter.vitals?.rr ?? "");
  setLegacyFieldValue("spo2", encounter.vitals?.spo2 ?? "");
  // The compatibility runtime's responseSnapshot() ends in a bare
  // `return "tolerated well"`, so a kind it does not recognize - or a kind
  // whose sub-choice it cannot see - would be copied into the chart as a
  // well-tolerated injection. The mirror resolves those through the runtime's
  // own `custom` path, which carries the composed wording verbatim.
  const responseMirror = legacyInjectionResponseMirror(encounter.response);
  setLegacyFieldValue("respCustom", responseMirror.custom);

  const details = encounter.details ?? {};
  setLegacyFieldValue("injProductSource", details.productSource ?? "");
  setLegacyFieldValue("injPreparation", details.preparation ?? "");
  setLegacyFieldValue("injPreparationDetail", details.preparationOther ?? "");
  setLegacyFieldValue("injVolume", details.volume ?? "");
  setLegacyFieldValue("injVolumeUnit", details.volumeUnit ?? "");
  setLegacyFieldValue("injDevice", details.device ?? "");
  setLegacyFieldValue("injDeviceOther", details.deviceOther ?? "");
  setLegacyFieldValue("injSiteCondition", details.siteCondition ?? "");
  setLegacyFieldValue("injSiteConditionDetail", details.siteConditionOther ?? "");
  setLegacyCheckboxValue("injWasteToggle", Boolean(details.waste));
  setLegacyFieldValue("injWasteAmount", details.wasteAmount ?? "");
  setLegacyFieldValue("injWasteWitness", details.wasteWitness ?? "");
  setLegacyCheckboxValue("injProductIssueToggle", Boolean(details.productIssue));
  setLegacyFieldValue("injProductIssueDetail", details.productIssueDetail ?? "");
  setLegacyFieldValue("injProductIssueAction", details.productIssueAction ?? "");
  setLegacyFieldValue("injProductIssueRecipient", details.productIssueRecipient ?? "");
  setLegacyFieldValue(
    "injProductIssueNotificationTime",
    details.productIssueNotificationTime ?? "",
  );
  setLegacyFieldValue("injProductIssueDirection", details.productIssueDirection ?? "");
  setLegacyFieldValue("injProductIssueNextStep", details.productIssueNextStep ?? "");
  setLegacyCheckboxValue("injExceptionToggle", Boolean(details.administrationException));
  setLegacyFieldValue("injExceptionSummary", details.exceptionSummary ?? "");
  setLegacyFieldValue("injExceptionRecipient", details.exceptionRecipient ?? "");
  setLegacyFieldValue("injExceptionTime", details.exceptionTime ?? "");
  setLegacyFieldValue("injExceptionOutcome", details.exceptionOutcome ?? "");

  const activeSafetyConcerns = new Set(encounter.activeSafetyConcerns ?? []);
  const safetyConcerns = Object.fromEntries(
    INJECTION_SAFETY_TRIGGERS.map((trigger) => [trigger.key, activeSafetyConcerns.has(trigger.key)]),
  );

  const initiation = encounter.initiation;
  const disposition = encounter.disposition;
  // Habitus and weight have no legacy DOM field and the compatibility markup
  // is frozen, so they ride the documentation-metadata channel into the saved
  // snapshot. clinical-source restores them onto the typed encounter.
  const administration = {
    ...(encounter.habitus ? { habitus: encounter.habitus } : {}),
    ...(encounter.vitals?.weight ? { weight: encounter.vitals.weight } : {}),
    ...(encounter.vitals?.weightUnit ? { weightUnit: encounter.vitals.weightUnit } : {}),
  };
  const documentation: InjectionDocumentationMetadata = {
    ...(details.clinicalReferenceVersion
      ? { clinicalReferenceVersion: details.clinicalReferenceVersion }
      : {}),
    ...(details.ndcSelection ? { ndcSelection: details.ndcSelection } : {}),
    ...(details.nextDose ? { nextDose: details.nextDose } : {}),
    ...(Object.keys(administration).length ? { administration } : {}),
    ...(details.lateDoseReview
      ? {
          lateDoseReview: details.lateDoseReview,
          lateDoseReviewNote: details.lateDoseReviewNote,
          lateDoseReviewProvider: details.lateDoseReviewProvider,
          lateDoseReviewTime: details.lateDoseReviewTime,
          lateDoseReviewFingerprint: details.lateDoseReviewFingerprint,
        }
      : {}),
  };

  window.ipmgSetInjectionChipState?.({
    medicationKey: encounter.medicationKey,
    customMedication: encounter.customMedication,
    dose: encounter.dose,
    site: encounter.site,
    route: encounter.route,
    intervalKey: encounter.intervalKey,
    reason: encounter.reason,
    response: responseMirror.kind,
    attestations: encounter.attestations as Record<string, boolean>,
    verifications: encounter.verifications as Record<string, boolean>,
    requiredVerifications,
    safetyConcerns,
    acuteSafetyScreenConfirmed: encounter.acuteSafetyScreenConfirmed,
    initiation: initiation
      ? {
          protocol: initiation.protocol,
          planVerified: initiation.planVerified,
          oralStatus: initiation.oralStatus,
          providerNote: initiation.providerNote,
          sustennaOrder: initiation.sustennaOrder,
          day1Date: initiation.day1Date,
          second: {
            dose: initiation.second.dose,
            site: initiation.second.site,
            ndc: initiation.second.ndc,
            lot: initiation.second.lot,
            exp: initiation.second.expiration,
            given: initiation.second.given,
            orderVerified: initiation.second.orderVerified,
            note: initiation.second.note,
          },
        }
      : undefined,
    disposition: {
      kind: disposition.kind,
      provider: disposition.provider,
      time: disposition.time,
      outcome: disposition.outcome,
      reviewedBy: disposition.reviewedBy,
      reviewedAt: disposition.reviewedAt,
      reviewFingerprint: disposition.reviewFingerprint,
    },
    documentation,
  });
}
