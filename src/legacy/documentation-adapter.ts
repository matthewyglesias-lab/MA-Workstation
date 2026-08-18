import {
  DocumentationEngine,
  type FormsDocumentationInput,
  type InjectionComponent,
  type InjectionDisposition,
  type InjectionDocumentationInput,
  type InjectionInitiationProtocol,
  type SamplesDocumentationInput,
  type UdsDocumentationInput,
  type UdsResultGroup,
} from "../documentation";

type LegacyFunction = ((...args: unknown[]) => unknown) & {
  __clinicalDocumentationAdapter?: boolean;
};

interface LegacyInitiationSecond {
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
  second?: LegacyInitiationSecond;
}

interface LegacySampleTraceEntry {
  id?: string;
  label?: string;
  strength?: string;
  quantity?: string;
  lot?: string;
  exp?: string;
}

interface LegacySampleDoseEntry {
  strength?: string;
  qty?: string;
  sig?: string;
  days?: string | number;
}

interface LegacyUdsProfileState {
  omitted?: string;
  readingsVerified?: boolean;
}

interface LegacyFlowState {
  safetyNone?: boolean;
}

interface LegacyDocumentationWindow extends Window {
  ipmgInitiationProtocolSnapshot?: () => LegacyInitiationSnapshot;
  ipmgInitiationProtocolSummary?: () => string;
  samplePackageTraceEntries?: () => LegacySampleTraceEntry[];
  sampleReviewConfirmationCurrent?: () => boolean;
  sampleDoseEntries?: () => LegacySampleDoseEntry[];
  __IPMG_RC538_UDS_PROFILE__?: LegacyUdsProfileState;
  __IPMG_RC530__?: LegacyFlowState;
  __IPMG_DENSE_SAMPLE_NOTE__?: string;
  __IPMG_DENSE_FORMS_NOTE__?: string;
}

interface LegacyUdsNote {
  cc?: string;
  as?: string;
  pl?: string;
  tebra?: string;
  [key: string]: unknown;
}

interface AdapterInstallState {
  uninstall: () => void;
}

const INSTALL_KEY = "__IPMG_CLINICAL_DOCUMENTATION_ADAPTER__";
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

const runtimeWindow = (): LegacyDocumentationWindow =>
  window as LegacyDocumentationWindow;

const compact = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const explicit = (value: unknown): string => {
  const normalized = compact(value);
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

const unique = (items: string[]): string[] => [...new Set(items.filter(Boolean))];

const INJECTION_REVIEW_FACTS: Record<string, string> = {
  "two-identifier id":
    "Patient identity verified using two identifiers (full name and DOB).",
  "medication ‘rights’":
    "Medication verified against the active order — right patient, drug, dose, route, time, and documentation.",
  "allergies reviewed": "Allergy review completed as documented.",
  "consent reaffirmed":
    "Consent for injection obtained and reaffirmed before administration.",
  "prior dose tolerated":
    "Prior-dose response reviewed with the patient as documented.",
  "no contraindications":
    "Pre-injection contraindication and acute side-effect screen completed.",
  "two-clinician check":
    "Independent two-clinician verification of patient, medication, and dose completed.",
  "current opioid-risk / provider plan verified":
    "Current opioid-risk screen and provider plan verified, including relevant opioid, buprenorphine, methadone, or tramadol exposure and current product contraindications.",
  "naltrexone/hepatic review verified":
    "Naltrexone/excipient hypersensitivity and hepatic-risk review verified against the active order and current product information.",
  "suspension inspected & mixed":
    "Product-specific preparation verified against the current product instructions.",
  "product-specific preparation verified":
    "Product-specific preparation verified against the current product instructions.",
  "product visual inspection verified":
    "Product visual inspection verified against the current product instructions.",
  "initiation / re-initiation plan verified":
    "Active order and product-specific initiation / re-initiation plan verified.",
  "ordered oral initiation plan documented":
    "Ordered oral aripiprazole initiation or overlap plan verified against the active order.",
  "stabilized on prerequisite lai":
    "Prerequisite LAI stabilization reviewed before transition to the selected interval.",
  "paliperidone/risperidone tolerability reviewed":
    "Paliperidone or risperidone tolerability reviewed when applicable.",
  "aripiprazole tolerability / transition reviewed":
    "Aripiprazole tolerability and initiation / transition plan reviewed when applicable.",
};

const INJECTION_PLAN_FACTS: Record<string, string> = {
  "aseptic technique":
    "Hand hygiene performed; injection site cleansed with alcohol and allowed to dry.",
  "post-inj observation":
    "Patient observed after injection; documented response recorded.",
  "education provided":
    "Post-injection education provided regarding expected effects, symptoms to report, and next-dose adherence.",
  "supplied needle / body-habitus check":
    "Kit-supplied needle and body-habitus selection verified; ordered deep gluteal IM route/site documented.",
  "gluteal-only administration":
    "Gluteal-only route requirement verified against the actual administration site.",
  "no massage after injection":
    "Injection site was not massaged after administration per product instructions.",
  "ordered route / technique verified":
    "Ordered route, site, and product-specific technique verified against the actual administration.",
};

const normalizedFactKey = (value: string): string =>
  compact(value).toLowerCase();

/**
 * Carries only the response the staff member selected or entered. Historical
 * response metadata included broader negative findings (for example, no
 * swelling) that were not independently confirmed in the workflow.
 */
export const legacyInjectionResponseFact = (
  responseSelection: string,
  customResponse = "",
): string => explicit(customResponse) || explicit(responseSelection);

const injectionFactLines = (
  doc: Document,
): { assessment: string[]; plan: string[] } => {
  const selected = unique([
    ...selectedControlTexts("attChips", doc),
    ...selectedControlTexts("medSpecChips", doc),
  ]);
  const assessment: string[] = [];
  const plan: string[] = [];
  selected.forEach((label) => {
    const key = normalizedFactKey(label);
    if (INJECTION_PLAN_FACTS[key]) {
      plan.push(INJECTION_PLAN_FACTS[key]);
      return;
    }
    assessment.push(INJECTION_REVIEW_FACTS[key] ?? label);
  });
  if (value("allergies", doc)) {
    const generic = INJECTION_REVIEW_FACTS["allergies reviewed"];
    if (generic) {
      const index = assessment.indexOf(generic);
      if (index >= 0) assessment.splice(index, 1);
    }
  }
  if (value("tech", doc)) {
    plan.push(`Needle / technique: ${value("tech", doc)}`);
  }
  return { assessment: unique(assessment), plan: unique(plan) };
};

const element = <T extends HTMLElement>(
  id: string,
  doc: Document = document,
): T | null => doc.getElementById(id) as T | null;

const value = (id: string, doc: Document = document): string => {
  const control = element<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(id, doc);
  return explicit(control?.value);
};

const rawValue = (id: string, doc: Document = document): string => {
  const control = element<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(id, doc);
  return compact(control?.value);
};

const checked = (id: string, doc: Document = document): boolean =>
  Boolean(element<HTMLInputElement>(id, doc)?.checked);

const nodeText = (
  selector: string,
  root: ParentNode = document,
): string => explicit(root.querySelector(selector)?.textContent);

const selectedOptionText = (
  id: string,
  doc: Document = document,
): string => {
  const select = element<HTMLSelectElement>(id, doc);
  if (!select || !select.value) return "";
  return explicit(select.selectedOptions[0]?.textContent || select.value);
};

const selectedControlTexts = (
  containerId: string,
  doc: Document = document,
): string[] => {
  const container = element<HTMLElement>(containerId, doc);
  if (!container) return [];
  return unique(
    [
      ...container.querySelectorAll<HTMLElement>(
        ".chip.on, button.on, [aria-pressed='true']",
      ),
    ].map((control) =>
      explicit(control.textContent)?.replace(/^[✓✔]\s*/, ""),
    ),
  );
};

const selectedControlText = (
  containerId: string,
  doc: Document = document,
): string => selectedControlTexts(containerId, doc)[0] ?? "";

const formatIsoDate = (raw: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(compact(raw));
  if (!match) return explicit(raw);
  const monthIndex = Number(match[2]) - 1;
  const month = MONTHS[monthIndex];
  if (!month) return explicit(raw);
  return `${month} ${Number(match[3])}, ${match[1]}`;
};

const formatMonth = (raw: string): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(compact(raw));
  return match ? `${match[2]}/${match[1]}` : explicit(raw);
};

const formatTime = (raw: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(compact(raw));
  if (!match) return explicit(raw);
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
};

const formatDateTime = (raw: string): string => {
  const [date = "", time = ""] = compact(raw).split("T");
  if (!date) return "";
  const dateLabel = formatIsoDate(date);
  const timeLabel = formatTime(time);
  return [dateLabel, timeLabel].filter(Boolean).join(" at ");
};

const addCalendarDays = (raw: string, days: number): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(compact(raw));
  if (!match) return "";
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
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

export interface MappedLegacyInitiation {
  protocol?: InjectionInitiationProtocol;
  secondComponent?: InjectionComponent;
}

/**
 * Pure compatibility mapping retained as an export so protocol preservation can
 * be fixture-tested without loading the legacy browser runtime.
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
  const orderCategory = sustennaOrderLabel(
    explicit(snapshot?.sustennaOrder),
  );
  if (orderCategory) notes.push(`Ordered initiation category: ${orderCategory}.`);
  if (snapshot?.second?.orderVerified) {
    notes.push(
      "Component 2 product and exact dose verified against the active order.",
    );
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
    ? `${
        protocolKey === "aristada-21day"
          ? "21-day"
          : "14-day"
      } oral continuation ${
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

  const mappedProtocol: InjectionInitiationProtocol = {
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
      day8 && administrationDate
        ? formatIsoDate(administrationDate)
        : undefined,
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
          administrationTime:
            formatTime(secondAdministrationTime) || undefined,
          ndc: explicit(second.ndc) || undefined,
          lot: explicit(second.lot) || undefined,
          expiration: formatMonth(explicit(second.exp)) || undefined,
        }
      : undefined;

  return {
    protocol: mappedProtocol,
    ...(secondComponent ? { secondComponent } : {}),
  };
};

const dispositionFromDom = (
  doc: Document = document,
): InjectionDisposition | undefined => {
  const selected = doc.querySelector<HTMLElement>(
    "#clinicalDisposition [data-disposition].on",
  );
  const selectedKind = explicit(selected?.dataset.disposition);
  const badge = nodeText("#clinicalDispositionBadge", doc);
  if (!selectedKind) return undefined;
  if (
    selectedKind === "administered" &&
    !/administration documented/i.test(badge)
  ) {
    return undefined;
  }
  const kind =
    selectedKind === "provider"
      ? "provider-directed"
      : selectedKind === "held" ||
          selectedKind === "escalated" ||
          selectedKind === "administered"
        ? selectedKind
        : undefined;
  if (!kind) return undefined;
  const labels: Record<InjectionDisposition["kind"], string> = {
    administered: "Administered",
    held: "Held",
    escalated: "Escalated",
    "provider-directed": "Provider-directed plan",
  };
  return {
    kind,
    label: labels[kind],
    notified: value("clinicalDispositionProvider", doc) || undefined,
    decisionTime:
      formatDateTime(rawValue("clinicalDispositionTime", doc)) || undefined,
    direction: value("clinicalDispositionOutcome", doc) || undefined,
  };
};

const primaryMedicationComponent = (
  disposition: InjectionDisposition | undefined,
  doc: Document,
): InjectionComponent | undefined => {
  const medication =
    nodeText("#medHdrName", doc) || selectedControlText("medChips", doc);
  const dose = selectedControlText("doseChips", doc);
  const route = selectedControlText("routeChips", doc);
  const site = selectedControlText("siteChips", doc);
  const hasProduct = Boolean(
    medication ||
      dose ||
      route ||
      site ||
      value("ndc", doc) ||
      value("lot", doc) ||
      value("exp", doc),
  );
  if (!hasProduct) return undefined;
  const administered = disposition?.kind === "administered";
  const responseSelection = selectedControlText("respChips", doc);
  const response = legacyInjectionResponseFact(
    responseSelection,
    rawValue("respCustom", doc),
  );
  const deviceSelection = rawValue("injDevice", doc);
  const device =
    deviceSelection === "Other"
      ? value("injDeviceOther", doc)
      : explicit(deviceSelection);
  const siteConditionSelection = rawValue("injSiteCondition", doc);
  const siteCondition =
    siteConditionSelection === "Other"
      ? value("injSiteConditionDetail", doc)
      : explicit(siteConditionSelection);
  const amount = [
    value("injVolume", doc),
    selectedOptionText("injVolumeUnit", doc),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    label: "Injection component 1",
    medication: medication || undefined,
    dose: dose || undefined,
    route: route || undefined,
    site: site || undefined,
    administrationDate:
      administered && rawValue("adminDate", doc)
        ? formatIsoDate(rawValue("adminDate", doc))
        : undefined,
    administrationTime:
      administered && rawValue("injAdminTime", doc)
        ? formatTime(rawValue("injAdminTime", doc))
        : undefined,
    administeredBy: administered ? value("admin", doc) || undefined : undefined,
    amount: administered && amount ? amount : undefined,
    device: administered && device ? device : undefined,
    siteCondition:
      administered && siteCondition ? siteCondition : undefined,
    response: administered && response ? response : undefined,
    ndc: value("ndc", doc) || undefined,
    lot: value("lot", doc) || undefined,
    expiration:
      formatMonth(rawValue("exp", doc)) || value("exp", doc) || undefined,
  };
};

const injectionTimingReview = (doc: Document): string => {
  if (!rawValue("priorDose", doc)) return "";
  return nodeText("#injTiming .tl-detail", doc);
};

export const readLegacyInjectionDocumentation = (
  doc: Document = document,
  win: LegacyDocumentationWindow = runtimeWindow(),
): InjectionDocumentationInput | null => {
  const disposition = dispositionFromDom(doc);
  const primary = primaryMedicationComponent(disposition, doc);
  if (!primary && !disposition) return null;

  const initiationSnapshot = (() => {
    try {
      return win.ipmgInitiationProtocolSnapshot?.();
    } catch {
      return undefined;
    }
  })();
  const initiationTitle = (() => {
    try {
      return explicit(win.ipmgInitiationProtocolSummary?.());
    } catch {
      return "";
    }
  })();
  const administrationDate = rawValue("adminDate", doc);
  const initiation = mapLegacyInitiationProtocol(
    initiationSnapshot,
    explicit(primary?.medication),
    administrationDate,
    rawValue("injSecondAdminTime", doc),
    initiationTitle,
  );
  const components = [primary, initiation.secondComponent].filter(
    (component): component is InjectionComponent => Boolean(component),
  );
  if (components.length > 1 && components[0]) {
    components[0] = { ...components[0], label: "Injection component 1" };
  } else if (components[0]) {
    components[0] = { ...components[0], label: undefined };
  }

  const visitType = selectedControlText("reasonChips", doc);
  const medicationLine = [
    explicit(primary?.medication),
    explicit(primary?.dose),
  ]
    .filter(Boolean)
    .join(" ");
  const summary =
    disposition?.kind === "administered"
      ? `Injection visit — ${medicationLine || "medication administration"}.`
      : disposition
        ? `Injection visit — ${
            medicationLine || "selected medication"
          }; medication not administered.`
        : `Injection documentation draft — ${
            medicationLine || "selected medication"
          }.`;

  // A selected medication is only a draft until a disposition is recorded.
  // Do not turn default chips (NKDA, rights, consent, technique) into
  // affirmative chart facts while the encounter is still unfinished.
  const documentedFacts = disposition
    ? injectionFactLines(doc)
    : { assessment: [] as string[], plan: [] as string[] };
  const reviewItems = unique([
    ...documentedFacts.assessment,
    ...(disposition && win.__IPMG_RC530__?.safetyNone
      ? ["No acute concerns today confirmed."]
      : []),
  ]);
  const clinicianAttention = unique(
    selectedControlTexts("injSafetyChips", doc),
  );
  const productSource = selectedOptionText("injProductSource", doc);
  const waste = checked("injWasteToggle", doc)
    ? value("injWasteAmount", doc)
    : "";
  const wasteWitness = checked("injWasteToggle", doc)
    ? value("injWasteWitness", doc)
    : "";
  const hasIssue = checked("injProductIssueToggle", doc);
  const hasException = checked("injExceptionToggle", doc);

  return {
    chiefComplaint: {
      summary,
      visitType: visitType || undefined,
      purpose: value("injOrderPurpose", doc) || undefined,
      encounterDate: administrationDate
        ? formatIsoDate(administrationDate)
        : undefined,
    },
    disposition,
    preAdministration: {
      orderPurpose: value("injOrderPurpose", doc) || undefined,
      allergiesReview: disposition ? value("allergies", doc) || undefined : undefined,
      previousDoseDate: rawValue("priorDose", doc)
        ? formatIsoDate(rawValue("priorDose", doc))
        : undefined,
      previousSite:
        selectedOptionText("priorSite", doc) ||
        value("priorSite", doc) ||
        undefined,
      timingReview: injectionTimingReview(doc) || undefined,
      vitals: {
        bloodPressure: value("bp", doc) || undefined,
        heartRate: value("hr", doc) || undefined,
        temperature: value("temp", doc) || undefined,
      },
      reviewItems: reviewItems.length ? reviewItems : undefined,
      clinicianAttention: clinicianAttention.length
        ? clinicianAttention
        : undefined,
    },
    components,
    initiation: initiation.protocol,
    handling: {
      source: productSource || undefined,
      waste: waste || undefined,
      wasteWitness: wasteWitness || undefined,
      productIssue: hasIssue
        ? value("injProductIssueDetail", doc) || undefined
        : undefined,
      productIssueAction: hasIssue
        ? value("injProductIssueAction", doc) || undefined
        : undefined,
      productIssueNotified: hasIssue
        ? value("injProductIssueRecipient", doc) || undefined
        : undefined,
      productIssueNotificationTime: hasIssue
        ? formatDateTime(rawValue("injProductIssueNotificationTime", doc)) ||
          undefined
        : undefined,
      productIssueDirection: hasIssue
        ? value("injProductIssueDirection", doc) || undefined
        : undefined,
      productIssueNextStep: hasIssue
        ? value("injProductIssueNextStep", doc) || undefined
        : undefined,
    },
    exception: hasException
      ? {
          summary: value("injExceptionSummary", doc) || undefined,
          notified: value("injExceptionRecipient", doc) || undefined,
          notificationTime:
            formatDateTime(rawValue("injExceptionTime", doc)) || undefined,
          direction: value("injExceptionOutcome", doc) || undefined,
        }
      : undefined,
    followUp: {
      nextDoseDate: rawValue("nextDate", doc)
        ? formatIsoDate(rawValue("nextDate", doc))
        : undefined,
      orderingProvider: value("orderingProvider", doc) || undefined,
    },
    // Sourced from the typed panel's own already-computed note facts (via
    // window.ipmgInjectionNoteFacts, set by injection-legacy-mirror.ts)
    // rather than re-derived from these scraped DOM fields, so this
    // legacy-DOM-driven path renders the same RC6.1 compact note as the
    // typed panel's own preview instead of silently falling back to the
    // pre-RC6.1 verbose formatter.
    noteFacts:
      disposition?.kind === "administered"
        ? win.ipmgInjectionNoteFacts?.()
        : undefined,
  };
};

const udsReadingsVerified = (
  doc: Document,
  win: LegacyDocumentationWindow,
): boolean =>
  checked("udsReadingsVerified", doc) ||
  Boolean(win.__IPMG_RC538_UDS_PROFILE__?.readingsVerified);

const udsResultForPanel = (panel: Element): string => {
  if (panel.classList.contains("pos")) return "Preliminary positive";
  if (panel.classList.contains("neg")) return "Negative";
  if (panel.classList.contains("invalid")) return "Invalid / unreadable";
  if (panel.classList.contains("nt")) return "Not tested / not documented";
  return "";
};

const readUdsResultGroups = (doc: Document): UdsResultGroup[] => {
  const groups = [
    ...doc.querySelectorAll<HTMLElement>("#udsResultGrid .uds-group"),
  ];
  if (groups.length) {
    return groups
      .map((group) => {
        const label =
          nodeText(".uds-group-title", group) ||
          nodeText(".uds-group-head", group);
        const results = [...group.querySelectorAll(".uds-panel")]
          .map((panel) => ({
            analyte:
              nodeText(".drug", panel) ||
              explicit((panel as HTMLElement).dataset.panel),
            result: udsResultForPanel(panel),
          }))
          .filter((result) => result.analyte && result.result);
        return { label, results };
      })
      .filter((group) => group.label && group.results.length);
  }

  const results = [
    ...doc.querySelectorAll<HTMLElement>("#udsResultGrid .uds-panel"),
  ]
    .map((panel) => ({
      analyte: nodeText(".drug", panel) || explicit(panel.dataset.panel),
      result: udsResultForPanel(panel),
    }))
    .filter((result) => result.analyte && result.result);
  return results.length ? [{ label: "Screening panel", results }] : [];
};

const resultFacts = (groups: UdsResultGroup[]) =>
  groups.flatMap((group) =>
    group.results.map((result) => ({
      group: group.label,
      analyte: result.analyte,
      result: result.result,
    })),
  );

export const readLegacyUdsDocumentation = (
  doc: Document = document,
  win: LegacyDocumentationWindow = runtimeWindow(),
): UdsDocumentationInput | null => {
  const verified = udsReadingsVerified(doc, win);
  const patient = value("udsPtName", doc);
  const device = selectedOptionText("udsDevice", doc);
  const started = Boolean(
    patient ||
      value("udsDOB", doc) ||
      device ||
      value("udsLot", doc) ||
      value("udsExp", doc) ||
      value("udsComment", doc) ||
      verified,
  );
  if (!started) return null;

  const groups = verified ? readUdsResultGroups(doc) : [];
  const facts = resultFacts(groups);
  const control = verified
    ? selectedControlText("udsControlChips", doc)
    : "";
  const validity = verified ? selectedOptionText("udsValidity", doc) : "";
  const medicationAlignmentValue = rawValue("udsConsistent", doc);
  const medicationAlignment =
    medicationAlignmentValue &&
    medicationAlignmentValue !== "no unexpected"
      ? selectedOptionText("udsConsistent", doc)
      : "";
  const attention: string[] = [];
  if (/invalid|not documented|missing/i.test(control)) {
    attention.push(`${control}; do not interpret the screening result.`);
  }
  facts.forEach((fact) => {
    if (/preliminary positive/i.test(fact.result)) {
      attention.push(
        `${fact.analyte} preliminary positive requires provider review.`,
      );
    }
    if (/invalid/i.test(fact.result)) {
      attention.push(
        `${fact.analyte} is invalid / unreadable and should not be interpreted.`,
      );
    }
  });
  if (/needs review/i.test(validity)) {
    attention.push("Validity markers require provider review.");
  }
  if (
    medicationAlignmentValue === "not aligned" ||
    medicationAlignmentValue === "needs review"
  ) {
    attention.push(`${medicationAlignment || "Medication alignment"} requires clinician review.`);
  }

  const plan: string[] = [];
  if (verified) {
    plan.push(
      "Results documented as a point-of-care preliminary screening result.",
    );
  }
  if (/invalid|not documented|missing/i.test(control)) {
    plan.push(
      "Do not interpret; repeat collection or use outside laboratory confirmation per provider direction.",
    );
  } else if (facts.some((fact) => /invalid/i.test(fact.result))) {
    plan.push(
      "Repeat affected invalid panel(s) or use outside laboratory confirmation per provider direction.",
    );
  } else if (
    facts.some((fact) => /preliminary positive/i.test(fact.result))
  ) {
    plan.push(
      "Route preliminary positive finding(s) for clinician review in clinical context.",
    );
  }

  const outsideLabValue = rawValue("udsLab", doc);
  const outsideLabPlan =
    outsideLabValue && outsideLabValue !== "provider to decide"
      ? selectedOptionText("udsLab", doc)
      : "";

  return {
    summary: "Point-of-care urine drug screen documentation.",
    patient: patient || undefined,
    dob: value("udsDOB", doc) || undefined,
    collection: {
      reason: selectedControlText("udsReasonChips", doc) || undefined,
      collectedAt:
        verified && rawValue("udsDateTime", doc)
          ? formatDateTime(rawValue("udsDateTime", doc))
          : undefined,
      collectedBy: value("udsCollector", doc) || undefined,
      specimen: verified ? "Urine" : undefined,
      device: device || undefined,
      lot: value("udsLot", doc) || undefined,
      expiration:
        formatMonth(rawValue("udsExp", doc)) ||
        value("udsExp", doc) ||
        undefined,
      temperature: verified
        ? selectedControlText("udsTempChips", doc) || undefined
        : undefined,
    },
    controlReview: verified
      ? {
          control: control || undefined,
          validity: validity || undefined,
          integrity: ["Physical cup and displayed panel readings verified."],
        }
      : undefined,
    resultGroups: groups.length ? groups : undefined,
    medicationAlignment: medicationAlignment || undefined,
    clinicianAttention: attention.length ? unique(attention) : undefined,
    patientContext: value("udsComment", doc) || undefined,
    plan: plan.length ? unique(plan) : undefined,
    outsideLabPlan: outsideLabPlan || undefined,
  };
};

const readSampleTraceEntries = (
  win: LegacyDocumentationWindow,
): LegacySampleTraceEntry[] => {
  try {
    const entries = win.samplePackageTraceEntries?.();
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
};

const readSampleDoseEntries = (
  win: LegacyDocumentationWindow,
): LegacySampleDoseEntry[] => {
  try {
    const entries = win.sampleDoseEntries?.();
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
};

const currentSampleReview = (win: LegacyDocumentationWindow): boolean => {
  try {
    return Boolean(win.sampleReviewConfirmationCurrent?.());
  } catch {
    return false;
  }
};

const sampleReviewConfirmation = (
  doc: Document,
  win: LegacyDocumentationWindow,
): SamplesDocumentationInput["reviewedToday"] => {
  if (!currentSampleReview(win)) return undefined;
  const status = nodeText("#sampleReviewedTodayStatus", doc);
  const match =
    /confirmed today by (.+?)(?: at ([^.]+))?\./i.exec(status);
  const reviewedBy =
    explicit(match?.[1]) || value("sampleStaff", doc) || undefined;
  const date = rawValue("sampleDate", doc);
  const time = explicit(match?.[2]);
  const reviewedAt = [
    date ? formatIsoDate(date) : "Confirmed today",
    time,
  ]
    .filter(Boolean)
    .join(" at ");
  return { reviewedAt, reviewedBy };
};

export const readLegacySamplesDocumentation = (
  doc: Document = document,
  win: LegacyDocumentationWindow = runtimeWindow(),
): SamplesDocumentationInput | null => {
  const patient = value("samplePtName", doc);
  const medication = value("sampleMedLabel", doc);
  const quantity = value("sampleQty", doc);
  const traces = readSampleTraceEntries(win);
  const doses = readSampleDoseEntries(win);
  const started = Boolean(
    patient ||
      value("sampleDOB", doc) ||
      medication ||
      quantity ||
      value("sampleLot", doc) ||
      value("sampleExp", doc) ||
      value("samplePrescriber", doc) ||
      value("sampleStaff", doc) ||
      value("sampleExtra", doc) ||
      value("sampleHandoutStatus", doc) ||
      value("sampleFollowUp", doc) ||
      traces.length,
  );
  if (!started) return null;

  const review = sampleReviewConfirmation(doc, win);
  const startDate = rawValue("sampleStart", doc);
  const packages = traces.map((entry, index) => ({
    label: explicit(entry.label) || `Package ${index + 1}`,
    medication: explicit(entry.strength) || medication || undefined,
    quantity: explicit(entry.quantity) || undefined,
    lot: explicit(entry.lot) || undefined,
    expiration:
      formatMonth(explicit(entry.exp)) || explicit(entry.exp) || undefined,
  }));
  const planSteps = doses
    .map((entry, index) => {
      const days = explicit(String(entry.days ?? ""));
      const dateDetail =
        index === 0 && startDate
          ? `${formatIsoDate(startDate)}${days ? ` · ${days} day(s)` : ""}`
          : days
            ? `${days} day(s)`
            : "";
      return {
        medication: explicit(entry.strength) || undefined,
        quantity: explicit(entry.qty) || undefined,
        dateRange: dateDetail || undefined,
        directions: explicit(entry.sig) || undefined,
      };
    })
    .filter((step) =>
      Boolean(
        step.medication ||
          step.quantity ||
          step.dateRange ||
          step.directions,
      ),
    );
  const counseling = review
    ? unique(
        [
          selectedOptionText("sampleMedCheck", doc),
          selectedOptionText("sampleEdu", doc),
        ].filter(
          (item) =>
            item &&
            !/^(?:not documented|pending provider confirmation)$/i.test(item),
        ),
      )
    : [];
  const specialInstructions = value("sampleTitration", doc);

  return {
    summary: "Oral medication sample documentation.",
    patient: patient || undefined,
    dob: value("sampleDOB", doc) || undefined,
    purpose:
      selectedOptionText("samplePurpose", doc) ||
      value("samplePurpose", doc) ||
      undefined,
    prescriber: value("samplePrescriber", doc) || undefined,
    dispensedBy: value("sampleStaff", doc) || undefined,
    packages: packages.length ? packages : undefined,
    planSteps: planSteps.length ? planSteps : undefined,
    patientInstructions: specialInstructions
      ? [specialInstructions]
      : undefined,
    counseling: counseling.length ? counseling : undefined,
    patientContext: value("sampleExtra", doc) || undefined,
    handoutStatus: rawValue("sampleHandoutStatus", doc)
      ? selectedOptionText("sampleHandoutStatus", doc) || undefined
      : undefined,
    followUp: value("sampleFollowUp", doc)
      ? [value("sampleFollowUp", doc)]
      : undefined,
    reviewedToday: review,
  };
};

const selectedFormsLabel = (
  selector: string,
  childSelector: string,
  doc: Document,
): string => {
  const selected = doc.querySelector<HTMLElement>(selector);
  return (
    nodeText(childSelector, selected ?? doc) ||
    explicit(selected?.textContent)
  );
};

export const readLegacyFormsDocumentation = (
  doc: Document = document,
): FormsDocumentationInput | null => {
  const requestCategory = selectedFormsLabel(
    "#formsTypeGrid .form-kind.on",
    ".t",
    doc,
  );
  const documentType = selectedFormsLabel(
    "#letterTypeChips .letter-chip.on",
    ".letter-chip",
    doc,
  );
  const status = selectedFormsLabel(
    "#formsStatusChips .form-status.on",
    ".form-status",
    doc,
  );
  const started = Boolean(
    value("formsPtName", doc) ||
      value("formsDOB", doc) ||
      value("formsProvider", doc) ||
      value("letterProvider", doc) ||
      value("formsStaff", doc) ||
      value("letterPreparedBy", doc) ||
      value("formsDue", doc) ||
      value("formsNotes", doc) ||
      value("formsApproval", doc) ||
      value("formsAction", doc) ||
      value("formsFollowUp", doc) ||
      (requestCategory && !/^work \/ school letter$/i.test(requestCategory)) ||
      (documentType &&
        !/^diagnosis \/ treatment verification$/i.test(documentType)) ||
      (status && !/^received$/i.test(status)),
  );
  if (!started) return null;

  const fee = selectedOptionText("formsFee", doc);
  const notification = selectedOptionText("formsNotified", doc);
  return {
    summary: `${documentType || requestCategory || "Forms / letter"} handoff.`,
    patient: value("formsPtName", doc) || undefined,
    dob: value("formsDOB", doc) || undefined,
    requestCategory: requestCategory || undefined,
    documentType: documentType || undefined,
    requestDate: rawValue("formsDate", doc)
      ? formatIsoDate(rawValue("formsDate", doc))
      : undefined,
    requestNotes: value("formsNotes", doc) || undefined,
    status: status || undefined,
    assignedProvider:
      value("formsProvider", doc) ||
      value("letterProvider", doc) ||
      undefined,
    assignedStaff:
      value("formsStaff", doc) ||
      value("letterPreparedBy", doc) ||
      undefined,
    targetDate: rawValue("formsDue", doc)
      ? formatIsoDate(rawValue("formsDue", doc))
      : undefined,
    feeStatus:
      fee && !/^no fee \/ not applicable$/i.test(fee) ? fee : undefined,
    deliveryMethod: selectedOptionText("formsDelivery", doc) || undefined,
    patientNotification:
      notification && !/^not yet notified$/i.test(notification)
        ? notification
        : undefined,
    approvalStatus: rawValue("formsApproval", doc)
      ? selectedOptionText("formsApproval", doc) || undefined
      : undefined,
    actions: value("formsAction", doc)
      ? [value("formsAction", doc)]
      : undefined,
    followUp: value("formsFollowUp", doc)
      ? [value("formsFollowUp", doc)]
      : undefined,
  };
};

const previewClass = (line: string): string => {
  if (!line) return "tebra-note-spacer";
  if (/^[A-Z0-9][A-Z0-9 /—·+-]+$/.test(line)) {
    return "tebra-note-heading";
  }
  if (/^→ /.test(line)) return "tebra-note-arrow";
  if (/^\s+↳ /.test(line)) return "tebra-note-indent";
  if (/^! /.test(line)) return "tebra-note-exception";
  if (/^• /.test(line)) return "tebra-note-bullet";
  if (line === "────────────────────────────────") {
    return "tebra-note-divider";
  }
  return "";
};

const writePreview = (
  id: string,
  content: string,
  doc: Document = document,
): void => {
  const root = element<HTMLElement>(id, doc);
  if (!root) return;
  root.replaceChildren();
  root.dataset.smartphrase = "dense";
  if (!content) return;
  content.split("\n").forEach((line) => {
    const paragraph = doc.createElement("p");
    paragraph.className = previewClass(line);
    if (!line) {
      paragraph.textContent = "\u00a0";
      paragraph.setAttribute("aria-hidden", "true");
    } else {
      paragraph.textContent = line;
    }
    root.append(paragraph);
  });
};

const refreshInjectionDocumentation = (
  doc: Document = document,
  win: LegacyDocumentationWindow = runtimeWindow(),
): void => {
  if (
    doc
      .getElementById("panel-administer")
      ?.classList.contains("record-readonly")
  ) {
    return;
  }
  const input = readLegacyInjectionDocumentation(doc, win);
  if (!input) {
    win._note = { cc: "", as: "", pl: "" };
    return;
  }
  const planFacts =
    input.disposition?.kind === "administered"
      ? injectionFactLines(doc).plan
      : [];
  const result = DocumentationEngine.format("injection", input, {
    workflow: "injection",
    readiness: "ready",
    stops: [],
    warnings: [],
    recommendations: [],
    calculatedDates: {},
    output: {
      documentation: {
        plan: planFacts,
      },
    },
  });
  win._note = {
    cc: result.cc,
    as: result.assessment,
    pl: result.plan,
  };
  writePreview("outCC", result.cc, doc);
  writePreview("outAS", result.assessment, doc);
  writePreview("outPL", result.plan, doc);
  const scan = element<HTMLElement>("scanPrev", doc);
  if (scan) scan.textContent = result.cc.split("\n")[0] ?? "";
};

const refreshUdsDocumentation = (
  doc: Document = document,
  win: LegacyDocumentationWindow = runtimeWindow(),
): void => {
  const input = readLegacyUdsDocumentation(doc, win);
  const noteWindow = win as LegacyDocumentationWindow & {
    _udsNote?: LegacyUdsNote;
  };
  if (!input) {
    noteWindow._udsNote = {
      ...(noteWindow._udsNote ?? {}),
      cc: "",
      as: "",
      pl: "",
      tebra: "",
    };
    writePreview("udsOutCC", "", doc);
    writePreview("udsOutAS", "", doc);
    writePreview("udsOutPL", "", doc);
    return;
  }

  const full = DocumentationEngine.format("uds", input);
  const first = DocumentationEngine.format("uds", {
    summary: input.summary,
    patient: input.patient,
    dob: input.dob,
    collection: input.collection,
  });
  const body = DocumentationEngine.format("uds", {
    controlReview: input.controlReview,
    resultGroups: input.resultGroups,
    medicationAlignment: input.medicationAlignment,
    clinicianAttention: input.clinicianAttention,
    patientContext: input.patientContext,
  });
  const footer = DocumentationEngine.format("uds", {
    plan: input.plan,
    outsideLabPlan: input.outsideLabPlan,
  });
  noteWindow._udsNote = {
    ...(noteWindow._udsNote ?? {}),
    cc: first.text,
    as: body.text,
    pl: footer.text,
    tebra: full.text,
  };
  writePreview("udsOutCC", first.text, doc);
  writePreview("udsOutAS", body.text, doc);
  writePreview("udsOutPL", footer.text, doc);
  const scan = element<HTMLElement>("udsScanPrev", doc);
  if (scan) scan.textContent = input.summary ?? "";
};

const refreshSamplesDocumentation = (
  doc: Document = document,
  win: LegacyDocumentationWindow = runtimeWindow(),
): string => {
  const input = readLegacySamplesDocumentation(doc, win);
  const content = input
    ? DocumentationEngine.format("samples", input).text
    : "";
  win.__IPMG_DENSE_SAMPLE_NOTE__ = content;
  return content;
};

const refreshFormsDocumentation = (
  doc: Document = document,
  win: LegacyDocumentationWindow = runtimeWindow(),
): string => {
  const input = readLegacyFormsDocumentation(doc);
  const content = input
    ? DocumentationEngine.format("forms", input).text
    : "";
  win.__IPMG_DENSE_FORMS_NOTE__ = content;
  const preview = element<HTMLElement>("formsNotePreview", doc);
  if (preview) {
    preview.textContent = content;
    preview.dataset.smartphrase = "dense";
  }
  return content;
};

export type LegacyDocumentationWorkflow =
  | "injection"
  | "uds"
  | "samples"
  | "forms";

export const refreshLegacyDocumentation = (
  workflow?: LegacyDocumentationWorkflow,
): void => {
  if (!workflow || workflow === "injection") {
    refreshInjectionDocumentation();
  }
  if (!workflow || workflow === "uds") refreshUdsDocumentation();
  if (!workflow || workflow === "samples") refreshSamplesDocumentation();
  if (!workflow || workflow === "forms") refreshFormsDocumentation();
};

const workflowForTarget = (
  target: EventTarget | null,
): LegacyDocumentationWorkflow | undefined => {
  if (!(target instanceof Element)) return undefined;
  if (
    target.closest(
      "#panel-administer, [data-records-open], [data-inj-record-open]",
    )
  ) {
    return "injection";
  }
  if (target.closest("#panel-uds")) return "uds";
  if (target.closest("#panel-samples")) return "samples";
  if (target.closest("#panel-forms")) return "forms";
  return undefined;
};

/**
 * Installs post-render compatibility wrappers after the classic script has
 * loaded. The returned function removes listeners and restores only functions
 * still owned by this adapter.
 */
export const installLegacyDocumentationAdapter = (): (() => void) => {
  const win = runtimeWindow();
  const stateHost = win as unknown as Record<string, unknown>;
  const installed = stateHost[INSTALL_KEY] as AdapterInstallState | undefined;
  if (installed) return installed.uninstall;

  const timers = new Map<LegacyDocumentationWorkflow, number>();
  const restores: Array<() => void> = [];
  const schedule = (workflow: LegacyDocumentationWorkflow): void => {
    const current = timers.get(workflow);
    if (current !== undefined) win.clearTimeout(current);
    const timer = win.setTimeout(() => {
      timers.delete(workflow);
      refreshLegacyDocumentation(workflow);
    }, 0);
    timers.set(workflow, timer);
  };
  const scheduleAll = (): void => {
    schedule("injection");
    schedule("uds");
    schedule("samples");
    schedule("forms");
  };

  const wrapAfterRender = (
    name: "render" | "renderUdsNote" | "renderSampleHandout" | "renderForms",
    workflow: LegacyDocumentationWorkflow,
  ): void => {
    const host = win as unknown as Record<string, unknown>;
    const previous = host[name] as LegacyFunction | undefined;
    if (typeof previous !== "function") return;
    const wrapped: LegacyFunction = function (
      this: unknown,
      ...args: unknown[]
    ) {
      try {
        return previous.apply(this, args);
      } finally {
        // Completion snapshots are captured immediately after the legacy
        // render call returns. Refresh synchronously so a record created by
        // this release permanently stores the dense note, while the queued
        // pass still absorbs any same-tick compatibility updates.
        refreshLegacyDocumentation(workflow);
        schedule(workflow);
      }
    };
    wrapped.__clinicalDocumentationAdapter = true;
    host[name] = wrapped;
    restores.push(() => {
      if (host[name] === wrapped) host[name] = previous;
    });
  };

  const wrapNoteFunction = (
    name: "sampleNoteText" | "formsNoteText",
    workflow: "samples" | "forms",
  ): void => {
    const host = win as unknown as Record<string, unknown>;
    const previous = host[name] as LegacyFunction | undefined;
    if (typeof previous !== "function") return;
    const wrapped: LegacyFunction = function (
      this: unknown,
      ...args: unknown[]
    ) {
      const prior = String(previous.apply(this, args) ?? "");
      if (
        workflow === "samples" &&
        /No medication sample dispensing is documented by this draft\./i.test(
          prior,
        )
      ) {
        return prior;
      }
      return workflow === "samples"
        ? refreshSamplesDocumentation()
        : refreshFormsDocumentation();
    };
    wrapped.__clinicalDocumentationAdapter = true;
    host[name] = wrapped;
    restores.push(() => {
      if (host[name] === wrapped) host[name] = previous;
    });
  };

  wrapAfterRender("render", "injection");
  wrapAfterRender("renderUdsNote", "uds");
  wrapAfterRender("renderSampleHandout", "samples");
  wrapAfterRender("renderForms", "forms");
  wrapNoteFunction("sampleNoteText", "samples");
  wrapNoteFunction("formsNoteText", "forms");

  const handleWorkflowEvent = (event: Event): void => {
    const workflow = workflowForTarget(event.target);
    if (workflow) schedule(workflow);
  };
  const handleTabChange = (): void => scheduleAll();
  document.addEventListener("input", handleWorkflowEvent, true);
  document.addEventListener("change", handleWorkflowEvent, true);
  document.addEventListener("click", handleWorkflowEvent, true);
  document.addEventListener(
    "ipmg:tabchange",
    handleTabChange as EventListener,
  );

  let active = true;
  const uninstall = (): void => {
    if (!active) return;
    active = false;
    document.removeEventListener("input", handleWorkflowEvent, true);
    document.removeEventListener("change", handleWorkflowEvent, true);
    document.removeEventListener("click", handleWorkflowEvent, true);
    document.removeEventListener(
      "ipmg:tabchange",
      handleTabChange as EventListener,
    );
    timers.forEach((timer) => win.clearTimeout(timer));
    timers.clear();
    restores.reverse().forEach((restore) => restore());
    if (
      (stateHost[INSTALL_KEY] as AdapterInstallState | undefined)?.uninstall ===
      uninstall
    ) {
      delete stateHost[INSTALL_KEY];
    }
  };
  stateHost[INSTALL_KEY] = { uninstall } satisfies AdapterInstallState;
  refreshLegacyDocumentation();
  return uninstall;
};
