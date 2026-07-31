import { INJECTION_SAFETY_TRIGGERS, type InjectionEncounter } from "../../../domain/injection";
import { setLegacyCheckboxValue, setLegacyFieldValue } from "../legacy-mirror";

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
      };
    }) => void;
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
  setLegacyFieldValue("ptName", encounter.patient.name);
  setLegacyFieldValue("ptDOB", encounter.patient.dob);
  setLegacyFieldValue("orderingProvider", encounter.orderingProvider);
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
  setLegacyFieldValue("respCustom", encounter.response.custom ?? "");

  const details = encounter.details ?? {};
  setLegacyFieldValue("injProductSource", details.productSource ?? "");
  setLegacyFieldValue("injProductSourceOther", details.productSourceOther ?? "");
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

  window.ipmgSetInjectionChipState?.({
    medicationKey: encounter.medicationKey,
    customMedication: encounter.customMedication,
    dose: encounter.dose,
    site: encounter.site,
    route: encounter.route,
    intervalKey: encounter.intervalKey,
    reason: encounter.reason,
    response: encounter.response.kind,
    attestations: encounter.attestations as Record<string, boolean>,
    verifications: encounter.verifications as Record<string, boolean>,
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
    },
  });
}
