import { addCalendarDays } from "../../domain/dates";
import type {
  InjectionComponent,
  InjectionInitiationProtocol,
} from "../types";

interface InitiationSecondSnapshot {
  dose?: string;
  site?: string;
  ndc?: string;
  lot?: string;
  exp?: string;
  given?: boolean;
  orderVerified?: boolean;
  note?: string;
}

export interface LegacyInitiationSnapshot {
  protocol?: string;
  planVerified?: boolean;
  oralStatus?: string;
  providerNote?: string;
  sustennaOrder?: string;
  day1Date?: string;
  second?: InitiationSecondSnapshot;
}

export interface MappedLegacyInitiation {
  protocol?: InjectionInitiationProtocol;
  secondComponent?: InjectionComponent;
}

const explicit = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (
    !normalized ||
    /^(?:—|-|select(?:\s+.+)?|not documented|not separately documented|patient name)$/i.test(
      normalized,
    )
  ) {
    return "";
  }
  return normalized;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const formatIsoDate = (raw: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return raw;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}, ${match[1]}` : raw;
};

const formatTime = (raw: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return raw.trim();
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
};

const formatMonth = (raw: string): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  return match ? `${match[2]}/${match[1]}` : raw;
};

const protocolTitle = (protocol: string): string => {
  const titles: Record<string, string> = {
    "maintena-1day": "Abilify Maintena 1-day initiation",
    "asimtufii-1day": "Abilify Asimtufii 1-day initiation",
    "aristada-initio-sameday":
      "Aristada INITIO + first ARISTADA, same encounter",
    "maintena-14day": "Abilify Maintena 14-day oral initiation",
    "asimtufii-14day": "Abilify Asimtufii 14-day oral initiation",
    "aristada-21day": "Aristada 21-day oral initiation",
    "maintena-provider": "Abilify Maintena restart / provider plan",
    "asimtufii-provider": "Abilify Asimtufii restart / transition plan",
    "aristada-provider": "Aristada staged / re-initiation plan",
    "sustenna-day1": "Invega Sustenna Day 1 initiation",
    "sustenna-day8": "Invega Sustenna Day 8 initiation",
    "sustenna-provider": "Invega Sustenna re-initiation / provider plan",
  };
  return titles[protocol] ?? protocol;
};

const secondProductName = (
  protocol: string,
  primaryMedication: string,
): string => {
  if (protocol === "maintena-1day") return "Abilify Maintena";
  if (protocol === "asimtufii-1day") return "Abilify Maintena";
  if (protocol === "aristada-initio-sameday") {
    return /initio/i.test(primaryMedication) ? "Aristada" : "Aristada Initio";
  }
  return "";
};

const oralDoseForProtocol = (protocol: string): string => {
  if (protocol === "maintena-1day" || protocol === "asimtufii-1day") {
    return "Aripiprazole 20 mg PO once";
  }
  if (protocol === "aristada-initio-sameday") {
    return "Aripiprazole 30 mg PO once";
  }
  return "";
};

const sustennaOrderLabel = (order: string): string => {
  const labels: Record<string, string> = {
    standard: "Standard order",
    mild: "Mild renal order",
    other: "Other provider order",
  };
  return labels[order] ?? "";
};

/**
 * DOM-free compatibility mapping shared by the browser workstation and the
 * Power Apps/Azure Function connector.
 */
export const mapLegacyInitiationProtocol = (
  snapshot: LegacyInitiationSnapshot | undefined,
  primaryMedication: string,
  administrationDate: string,
  secondAdministrationTime: string,
  title = "",
): MappedLegacyInitiation => {
  const protocolKey = explicit(snapshot?.protocol);
  if (!protocolKey) return {};

  const dual = [
    "maintena-1day",
    "asimtufii-1day",
    "aristada-initio-sameday",
  ].includes(protocolKey);
  const oral = [
    "maintena-14day",
    "asimtufii-14day",
    "aristada-21day",
  ].includes(protocolKey);
  const day8 = protocolKey === "sustenna-day8";
  const day1 = protocolKey === "sustenna-day1";
  const provider = /-provider$/.test(protocolKey);
  const notes: string[] = [];
  const orderCategory = sustennaOrderLabel(explicit(snapshot?.sustennaOrder));
  if (orderCategory) notes.push(`Ordered initiation category: ${orderCategory}.`);
  if (snapshot?.second?.orderVerified) {
    notes.push("Component 2 product and exact dose verified against the active order.");
  }
  if (explicit(snapshot?.second?.note)) {
    notes.push(`Component 2 note: ${explicit(snapshot?.second?.note)}`);
  }

  let kind: InjectionInitiationProtocol["kind"] = "provider-directed";
  if (dual) kind = "aripiprazole-two-injection";
  else if (day8) kind = "sustenna-day-8";
  else if (oral) kind = "oral-overlap";

  const oralStatus = explicit(snapshot?.oralStatus);
  const baseOralDose = oralDoseForProtocol(protocolKey);
  const oralDose =
    baseOralDose && oralStatus
      ? `${baseOralDose} — ${
          oralStatus === "administered"
            ? "documented as administered today"
            : "verified in active record / eMAR"
        }`
      : "";
  const oralPlan = oral
    ? `${protocolKey === "aristada-21day" ? "21-day" : "14-day"} oral continuation ${
        oralStatus === "administered"
          ? "documented as administered today"
          : oralStatus === "verified"
            ? "verified in active record / eMAR"
            : ""
      }`.trim()
    : provider
      ? explicit(snapshot?.providerNote)
      : "";

  const day1Raw = day8
    ? explicit(snapshot?.day1Date)
    : day1
      ? administrationDate
      : "";
  const targetRaw =
    (day1 || day8) && day1Raw ? addCalendarDays(day1Raw, 7) : "";
  const earlyRaw = day8 && targetRaw ? addCalendarDays(targetRaw, -4) : "";
  const lateRaw = day8 && targetRaw ? addCalendarDays(targetRaw, 4) : "";
  let timingReview = "";
  if (day8 && administrationDate && earlyRaw && lateRaw) {
    timingReview =
      administrationDate >= earlyRaw && administrationDate <= lateRaw
        ? "Administration date is within the displayed ±4-day window."
        : "Administration date is outside the displayed ±4-day window; use the active provider/current missed-dose plan.";
  }

  const protocol: InjectionInitiationProtocol = {
    kind,
    label: title || protocolTitle(protocolKey),
    orderVerification: snapshot?.planVerified
      ? "Active provider initiation / re-initiation order and current product information verified"
      : undefined,
    oralDose: oralDose || undefined,
    oralPlan: oralPlan || undefined,
    day1Date: day1Raw ? formatIsoDate(day1Raw) : undefined,
    day8TargetDate: targetRaw ? formatIsoDate(targetRaw) : undefined,
    windowStart: earlyRaw ? formatIsoDate(earlyRaw) : undefined,
    windowEnd: lateRaw ? formatIsoDate(lateRaw) : undefined,
    scheduledOrAdministeredDate:
      day8 && administrationDate ? formatIsoDate(administrationDate) : undefined,
    timingReview: timingReview || undefined,
    notes: notes.length ? notes : undefined,
  };

  const second = snapshot?.second;
  const secondMedication = secondProductName(protocolKey, primaryMedication);
  const secondComponent =
    dual && second?.given
      ? {
          label: "Injection component 2",
          medication: secondMedication || undefined,
          dose: explicit(second.dose) || undefined,
          route: "IM",
          site: explicit(second.site) || undefined,
          administrationTime: formatTime(secondAdministrationTime) || undefined,
          ndc: explicit(second.ndc) || undefined,
          lot: explicit(second.lot) || undefined,
          expiration: formatMonth(explicit(second.exp)) || undefined,
        }
      : undefined;

  return {
    protocol,
    ...(secondComponent ? { secondComponent } : {}),
  };
};
