import type { InjectionMedicationKey } from "./injection-catalog";

/**
 * Product-reference data only. This is intentionally separate from the
 * medication guidance/evaluator: an NDC directory listing is useful for
 * package documentation, but it must never change clinical gates or rules.
 */
export const INJECTION_NDC_REFERENCE_VERSION = "ndc-reference-2026-08-03";
export const FDA_NDC_DIRECTORY_URL = "https://api.fda.gov/drug/ndc.json";
export const NDC_REFERENCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const NDC_REFERENCE_CACHE_KEY = "ipmgMedAssistNdcReferenceV1";

export type InjectionNdcSource = "bundled" | "remote" | "custom";
export type NdcPackageKind = "commercial" | "sample";

/** Metadata persisted alongside, never instead of, the documented NDC text. */
export interface InjectionNdcSelection {
  ndc?: string;
  source?: InjectionNdcSource;
  packageLabel?: string;
  package?: string;
  labeler?: string;
  packageKind?: NdcPackageKind;
  medicationKey?: InjectionMedicationKey | "";
  dose?: string;
  referenceVersion?: string;
}

export interface InjectionNdcSelectionMetadata {
  primary?: InjectionNdcSelection;
  pairedSecond?: InjectionNdcSelection;
}

/**
 * Records how the visible next-dose value was obtained. It is a staff aid,
 * not an order, and remains editable by the documenting staff member.
 */
export interface InjectionNextDoseProvenance {
  value?: string;
  source?: "calculated" | "manual";
  calculatedFrom?: string;
}

export interface InjectionDocumentationMetadata {
  clinicalReferenceVersion?: string;
  ndcSelection?: InjectionNdcSelectionMetadata;
  nextDose?: InjectionNextDoseProvenance;
}

export interface NdcOptionQuery {
  medicationKey: InjectionMedicationKey | "";
  dose: string;
}

export interface NdcPackageOption {
  id: string;
  medicationKey: Exclude<InjectionMedicationKey, "other">;
  /** Exact administration dose when the package maps directly to one. */
  dose?: string;
  /** FDA-listed product strength/concentration, retained for staff review. */
  strength: string;
  presentation: string;
  package: string;
  labeler: string;
  packageKind: NdcPackageKind;
  ndc: string;
  source: "bundled" | "remote";
  sourceUrl: string;
  referenceVersion: string;
}

export interface NdcResolution {
  value: string;
  source: InjectionNdcSource | "none";
  option?: NdcPackageOption;
}

type NdcCatalogMedicationKey = Exclude<InjectionMedicationKey, "other">;

const catalogNdc = (
  medicationKey: NdcCatalogMedicationKey,
  dose: string | undefined,
  strength: string,
  presentation: string,
  packageDescription: string,
  labeler: string,
  ndc: string,
  packageKind: NdcPackageKind = "commercial",
): NdcPackageOption => ({
  id: `${medicationKey}:${dose ?? "any"}:${ndc}`,
  medicationKey,
  ...(dose ? { dose } : {}),
  strength,
  presentation,
  package: packageDescription,
  labeler,
  packageKind,
  ndc,
  source: "bundled",
  sourceUrl: FDA_NDC_DIRECTORY_URL,
  referenceVersion: INJECTION_NDC_REFERENCE_VERSION,
});

type CatalogPackageNdc = string | { ndc: string; packageKind?: NdcPackageKind };

const packageOptions = (
  medicationKey: NdcCatalogMedicationKey,
  dose: string | undefined,
  strength: string,
  presentation: string,
  packageDescription: string,
  labeler: string,
  ndcs: readonly CatalogPackageNdc[],
): NdcPackageOption[] =>
  ndcs.map((entry) => {
    const { ndc, packageKind = "commercial" } =
      typeof entry === "string" ? { ndc: entry } : entry;
    return catalogNdc(
      medicationKey,
      dose,
      strength,
      presentation,
      packageDescription,
      labeler,
      ndc,
      packageKind,
    );
  });

/**
 * Browser-offline baseline from the FDA NDC Directory, reviewed 2026-08-03.
 * Package codes are deliberately package NDCs (not billing-format guesses).
 */
export const BUNDLED_INJECTION_NDC_OPTIONS: readonly NdcPackageOption[] = [
  ...packageOptions("aristada", "441 mg", "441 mg/1.6 mL", "prefilled syringe", "1 syringe in 1 carton", "Alkermes, Inc.", ["65757-401-03", { ndc: "65757-401-04", packageKind: "sample" }]),
  ...packageOptions("aristada", "662 mg", "662 mg/2.4 mL", "prefilled syringe", "1 syringe in 1 carton", "Alkermes, Inc.", ["65757-402-03", { ndc: "65757-402-04", packageKind: "sample" }]),
  ...packageOptions("aristada", "882 mg", "882 mg/3.2 mL", "prefilled syringe", "1 syringe in 1 carton", "Alkermes, Inc.", ["65757-403-03", { ndc: "65757-403-04", packageKind: "sample" }]),
  ...packageOptions("aristada", "1064 mg", "1064 mg/3.9 mL", "prefilled syringe", "1 syringe in 1 carton", "Alkermes, Inc.", ["65757-404-03", { ndc: "65757-404-04", packageKind: "sample" }]),
  ...packageOptions("initio", "675 mg", "675 mg/2.4 mL", "prefilled syringe", "1 syringe in 1 carton", "Alkermes, Inc.", ["65757-500-03", { ndc: "65757-500-04", packageKind: "sample" }]),
  ...packageOptions("sustenna", "39 mg", "39 mg/0.25 mL", "prefilled syringe", "1 prefilled syringe in 1 kit", "Janssen Pharmaceuticals, Inc.", ["50458-560-01"]),
  ...packageOptions("sustenna", "78 mg", "78 mg/0.5 mL", "prefilled syringe", "1 prefilled syringe in 1 kit", "Janssen Pharmaceuticals, Inc.", ["50458-561-01"]),
  ...packageOptions("sustenna", "117 mg", "117 mg/0.75 mL", "prefilled syringe", "1 prefilled syringe in 1 kit", "Janssen Pharmaceuticals, Inc.", ["50458-562-01"]),
  ...packageOptions("sustenna", "156 mg", "156 mg/mL", "prefilled syringe", "1 prefilled syringe in 1 kit", "Janssen Pharmaceuticals, Inc.", ["50458-563-01", { ndc: "50458-563-03", packageKind: "sample" }]),
  ...packageOptions("sustenna", "234 mg", "234 mg/1.5 mL", "prefilled syringe", "1 prefilled syringe in 1 kit", "Janssen Pharmaceuticals, Inc.", ["50458-564-01", { ndc: "50458-564-03", packageKind: "sample" }]),
  ...packageOptions("erzofri", "39 mg", "39 mg/0.25 mL", "glass prefilled syringe", "1 glass prefilled syringe in 1 kit", "Shandong Luye Pharmaceutical Co., Ltd.", ["72526-105-11"]),
  ...packageOptions("erzofri", "78 mg", "78 mg/0.5 mL", "glass prefilled syringe", "1 glass prefilled syringe in 1 kit", "Shandong Luye Pharmaceutical Co., Ltd.", ["72526-106-11"]),
  ...packageOptions("erzofri", "117 mg", "117 mg/0.75 mL", "glass prefilled syringe", "1 glass prefilled syringe in 1 kit", "Shandong Luye Pharmaceutical Co., Ltd.", ["72526-107-11"]),
  ...packageOptions("erzofri", "156 mg", "156 mg/mL", "glass prefilled syringe", "1 glass prefilled syringe in 1 kit", "Shandong Luye Pharmaceutical Co., Ltd.", ["72526-108-11"]),
  ...packageOptions("erzofri", "234 mg", "234 mg/1.5 mL", "glass prefilled syringe", "1 glass prefilled syringe in 1 kit", "Shandong Luye Pharmaceutical Co., Ltd.", ["72526-109-11"]),
  ...packageOptions("erzofri", "351 mg", "351 mg/2.25 mL", "glass prefilled syringe", "1 glass prefilled syringe in 1 kit", "Shandong Luye Pharmaceutical Co., Ltd.", ["72526-110-11", { ndc: "72526-110-21", packageKind: "sample" }]),
  ...packageOptions("trinza", "273 mg", "273 mg/0.88 mL", "prefilled syringe", "1 syringe in 1 carton", "Janssen Pharmaceuticals, Inc.", ["50458-606-01"]),
  ...packageOptions("trinza", "410 mg", "410 mg/1.32 mL", "prefilled syringe", "1 syringe in 1 carton", "Janssen Pharmaceuticals, Inc.", ["50458-607-01"]),
  ...packageOptions("trinza", "546 mg", "546 mg/1.75 mL", "prefilled syringe", "1 syringe in 1 carton", "Janssen Pharmaceuticals, Inc.", ["50458-608-01"]),
  ...packageOptions("trinza", "819 mg", "819 mg/2.63 mL", "prefilled syringe", "1 syringe in 1 carton", "Janssen Pharmaceuticals, Inc.", ["50458-609-01"]),
  ...packageOptions("hafyera", "1092 mg", "1092 mg/3.5 mL", "prefilled syringe", "1 syringe in 1 carton", "Janssen Pharmaceuticals, Inc.", ["50458-611-01"]),
  ...packageOptions("hafyera", "1560 mg", "1560 mg/5 mL", "prefilled syringe", "1 syringe in 1 carton", "Janssen Pharmaceuticals, Inc.", ["50458-612-01"]),
  ...packageOptions("uzedy", "50 mg", "50 mg/0.14 mL", "extended-release glass syringe", "1 glass prefilled syringe in 1 carton", "Teva Pharmaceuticals USA, Inc.", ["51759-305-10", { ndc: "51759-305-11", packageKind: "sample" }]),
  ...packageOptions("uzedy", "75 mg", "75 mg/0.21 mL", "extended-release glass syringe", "1 glass prefilled syringe in 1 carton", "Teva Pharmaceuticals USA, Inc.", ["51759-410-10", { ndc: "51759-410-11", packageKind: "sample" }]),
  ...packageOptions("uzedy", "100 mg", "100 mg/0.28 mL", "extended-release glass syringe", "1 glass prefilled syringe in 1 carton", "Teva Pharmaceuticals USA, Inc.", ["51759-520-10", { ndc: "51759-520-11", packageKind: "sample" }]),
  ...packageOptions("uzedy", "125 mg", "125 mg/0.35 mL", "extended-release glass syringe", "1 glass prefilled syringe in 1 carton", "Teva Pharmaceuticals USA, Inc.", ["51759-630-10", { ndc: "51759-630-11", packageKind: "sample" }]),
  ...packageOptions("uzedy", "150 mg", "150 mg/0.42 mL", "extended-release glass syringe", "1 glass prefilled syringe in 1 carton", "Teva Pharmaceuticals USA, Inc.", ["51759-740-10", { ndc: "51759-740-11", packageKind: "sample" }]),
  ...packageOptions("uzedy", "200 mg", "200 mg/0.56 mL", "extended-release glass syringe", "1 glass prefilled syringe in 1 carton", "Teva Pharmaceuticals USA, Inc.", ["51759-850-10", { ndc: "51759-850-11", packageKind: "sample" }]),
  ...packageOptions("uzedy", "250 mg", "250 mg/0.7 mL", "extended-release glass syringe", "1 glass prefilled syringe in 1 carton", "Teva Pharmaceuticals USA, Inc.", ["51759-960-10", { ndc: "51759-960-11", packageKind: "sample" }]),
  ...packageOptions("maintena", "300 mg", "300 mg/1.5 mL", "prefilled dual-chamber syringe", "1 prefilled dual-chamber syringe in 1 kit", "Otsuka America Pharmaceutical, Inc.", ["59148-045-80"]),
  ...packageOptions("maintena", "400 mg", "400 mg/1.9 mL", "prefilled dual-chamber syringe", "1 prefilled dual-chamber syringe in 1 kit", "Otsuka America Pharmaceutical, Inc.", ["59148-072-80", { ndc: "59148-072-92", packageKind: "sample" }]),
  ...packageOptions("maintena", "300 mg", "300 mg/1.5 mL", "single-dose vial kit", "1 vial and diluent in 1 kit", "Otsuka America Pharmaceutical, Inc.", ["59148-232-12"]),
  ...packageOptions("maintena", "400 mg", "400 mg/1.9 mL", "single-dose vial kit", "1 vial and diluent in 1 kit", "Otsuka America Pharmaceutical, Inc.", ["59148-245-12"]),
  ...packageOptions("asimtufii", "720 mg", "720 mg/2.4 mL", "prefilled syringe", "1 syringe in 1 carton", "Otsuka America Pharmaceutical, Inc.", ["59148-102-80"]),
  ...packageOptions("asimtufii", "960 mg", "960 mg/3.2 mL", "prefilled syringe", "1 syringe in 1 carton", "Otsuka America Pharmaceutical, Inc.", ["59148-114-80", { ndc: "59148-114-92", packageKind: "sample" }]),
  ...packageOptions("vivitrol", "380 mg", "380 mg/vial", "single-dose kit", "1 vial, diluent, and administration supplies in 1 kit", "Alkermes, Inc.", ["65757-300-01", { ndc: "65757-301-01", packageKind: "sample" }]),
  // These are the labeler's Haldol Decanoate packages. Generic haloperidol
  // decanoate stock remains documentable through the explicit custom path.
  ...packageOptions("haldol", undefined, "50 mg/mL", "ampule", "3 × 1 mL ampules in a box", "Janssen Pharmaceuticals, Inc.", ["50458-253-03"]),
  ...packageOptions("haldol", undefined, "100 mg/mL", "ampule", "5 × 1 mL ampules in a box", "Janssen Pharmaceuticals, Inc.", ["50458-254-14"]),
  ...packageOptions("prolixin", undefined, "25 mg/mL", "multi-dose vial", "5 mL vial in a carton", "Hikma Pharmaceuticals USA Inc.", ["0143-9529-01"]),
  ...packageOptions("prolixin", undefined, "25 mg/mL", "multi-dose vial", "5 mL vial in a carton", "Sagent Pharmaceuticals", ["25021-838-05"]),
  ...packageOptions("prolixin", undefined, "25 mg/mL", "multi-dose vial", "5 mL vial in a carton", "Fresenius Kabi USA, LLC", ["63323-272-05"]),
  ...packageOptions("prolixin", undefined, "25 mg/mL", "multi-dose vial", "5 mL vial in a carton", "Gland Pharma Limited", ["68083-476-01"]),
  ...packageOptions("prolixin", undefined, "25 mg/mL", "multi-dose vial", "5 mL vial in a carton", "Novadoz Pharmaceuticals LLC", ["72205-100-01"]),
  ...packageOptions("prolixin", undefined, "25 mg/mL", "multi-dose vial", "5 mL vial in a carton", "Bryant Ranch Prepack", ["72162-2635-2"]),
  ...packageOptions("prolixin", undefined, "25 mg/mL", "multi-dose vial", "5 mL vial in a carton", "Mylan Institutional", ["67457-359-59"]),
  ...packageOptions("prolixin", undefined, "125 mg/5 mL", "multi-dose vial", "5 mL vial in a carton", "Eugia US LLC", ["55150-267-05"]),
];

const doseKey = (value: string | undefined): string =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, "");

const ndcDigits = (value: string): string => value.replace(/[^0-9]/g, "");
const isNdcShapedValue = (value: string): boolean => /^[0-9\s-]+$/.test(value);

/* Explicit compatibility aliases from already-supported local records. These
 * are not generated from an NDC-padding algorithm: anything not named here
 * stays custom so the workstation never guesses an arbitrary billing format. */
const EXPLICIT_NDC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "50458-564-01": ["50458-0564-01"],
  "59148-072-80": ["59148-0072-80"],
};

const matchesKnownNdc = (candidate: NdcPackageOption, digits: string): boolean =>
  ndcDigits(candidate.ndc) === digits ||
  (EXPLICIT_NDC_ALIASES[candidate.ndc] ?? []).some((alias) => ndcDigits(alias) === digits);

const isCatalogMedication = (
  medicationKey: InjectionMedicationKey | "",
): medicationKey is NdcCatalogMedicationKey => medicationKey !== "" && medicationKey !== "other";

/** A compact label suitable for a select/listbox without hiding package detail. */
export const formatNdcPackageOption = (option: NdcPackageOption): string =>
  `${option.strength} ${option.presentation}${
    option.packageKind === "sample" ? " — Sample — not for resale" : ""
  } — ${option.ndc}`;

/**
 * Returns exact-dose package choices plus medication-level choices where the
 * administered dose cannot safely determine a concentration/package.
 */
export const resolveNdcOptions = (
  query: NdcOptionQuery,
  additionalOptions: readonly NdcPackageOption[] = [],
): NdcPackageOption[] => {
  if (!isCatalogMedication(query.medicationKey)) return [];
  const requestedDose = doseKey(query.dose);
  const all = [...BUNDLED_INJECTION_NDC_OPTIONS, ...additionalOptions].filter(
    (option) => option.medicationKey === query.medicationKey,
  );
  const applicable = all.filter(
    (option) => !option.dose || !requestedDose || doseKey(option.dose) === requestedDose,
  );
  const deduped = new Map<string, NdcPackageOption>();
  for (const option of applicable) {
    const key = ndcDigits(option.ndc);
    // The curated package entry is the stable offline source of truth when a
    // directory refresh repeats the same exact package NDC.
    if (!deduped.has(key) || option.source === "bundled") deduped.set(key, option);
  }
  return [...deduped.values()].sort((a, b) =>
    formatNdcPackageOption(a).localeCompare(formatNdcPackageOption(b)),
  );
};

/**
 * Canonicalizes only a scanned/pasted value which exactly matches a known
 * package NDC. Arbitrary 10/11/12 digit strings remain untouched as custom
 * documentation so the app never guesses FDA segment positions.
 */
export const resolveNdcEntry = (
  value: string,
  options: readonly NdcPackageOption[] = BUNDLED_INJECTION_NDC_OPTIONS,
): NdcResolution => {
  const supplied = String(value ?? "");
  const trimmed = supplied.trim();
  if (!trimmed) return { value: "", source: "none" };
  // Do not strip arbitrary scanner/notes text down to digits. A value is
  // canonicalized only when it already has an NDC-like shape and exactly
  // matches a listed package (including an explicit historical alias).
  const digits = isNdcShapedValue(trimmed) ? ndcDigits(trimmed) : "";
  const option = digits
    ? options.find((candidate) => matchesKnownNdc(candidate, digits))
    : undefined;
  return option
    ? { value: option.ndc, source: option.source, option }
    : { value: supplied, source: "custom" };
};

export const normalizeKnownNdc = (
  value: string,
  options: readonly NdcPackageOption[] = BUNDLED_INJECTION_NDC_OPTIONS,
): string => resolveNdcEntry(value, options).value;

export const selectionForNdcInput = (
  value: string,
  query: NdcOptionQuery,
  options: readonly NdcPackageOption[] = resolveNdcOptions(query),
): InjectionNdcSelection | undefined => {
  const resolution = resolveNdcEntry(value, options);
  if (resolution.source === "none") return undefined;
  return {
    ndc: resolution.value,
    source: resolution.source,
    ...(resolution.option
      ? {
          packageLabel: formatNdcPackageOption(resolution.option),
          package: resolution.option.package,
          labeler: resolution.option.labeler,
          packageKind: resolution.option.packageKind,
          medicationKey: query.medicationKey,
          dose: query.dose,
          referenceVersion: resolution.option.referenceVersion,
        }
      : { medicationKey: query.medicationKey, dose: query.dose }),
  };
};

interface FdaNdcPackage {
  package_ndc?: unknown;
  description?: unknown;
  sample?: unknown;
}

interface FdaNdcIngredient {
  strength?: unknown;
}

interface FdaNdcProduct {
  product_ndc?: unknown;
  brand_name?: unknown;
  labeler_name?: unknown;
  dosage_form?: unknown;
  active_ingredients?: unknown;
  packaging?: unknown;
}

interface FdaNdcPayload {
  results?: unknown;
}

const FDA_BRAND_QUERY: Record<NdcCatalogMedicationKey, string> = {
  aristada: "ARISTADA",
  initio: "ARISTADA INITIO",
  sustenna: "INVEGA SUSTENNA",
  erzofri: "ERZOFRI",
  trinza: "INVEGA TRINZA",
  hafyera: "INVEGA HAFYERA",
  uzedy: "UZEDY",
  maintena: "ABILIFY MAINTENA",
  asimtufii: "ABILIFY ASIMTUFII",
  vivitrol: "VIVITROL",
  haldol: "HALDOL",
  prolixin: "FLUPHENAZINE DECANOATE",
};

export const buildFdaNdcDirectoryUrl = (query: NdcOptionQuery): string | undefined => {
  if (!isCatalogMedication(query.medicationKey)) return undefined;
  const params = new URLSearchParams({
    search: `brand_name:\"${FDA_BRAND_QUERY[query.medicationKey]}\"`,
    limit: "100",
  });
  return `${FDA_NDC_DIRECTORY_URL}?${params.toString()}`;
};

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);
const packageKindFrom = (value: unknown): NdcPackageKind =>
  value === true || asText(value).toLocaleLowerCase() === "true" ? "sample" : "commercial";

const matchingBundledDose = (query: NdcOptionQuery, productNdc: string): string | undefined => {
  const productDigits = ndcDigits(productNdc);
  const matched = BUNDLED_INJECTION_NDC_OPTIONS.find(
    (option) =>
      option.medicationKey === query.medicationKey &&
      ndcDigits(option.ndc).startsWith(productDigits),
  );
  return matched?.dose;
};

const productMatchesDose = (query: NdcOptionQuery, product: FdaNdcProduct): boolean => {
  const requested = doseKey(query.dose);
  if (!requested) return true;
  const productNdc = asText(product.product_ndc);
  const bundledDose = matchingBundledDose(query, productNdc);
  if (bundledDose) return doseKey(bundledDose) === requested;
  return asArray<FdaNdcIngredient>(product.active_ingredients).some((ingredient) =>
    doseKey(asText(ingredient.strength)).startsWith(requested),
  );
};

/** Converts an FDA directory response into display-only package candidates. */
export const fdaNdcOptionsFromPayload = (
  query: NdcOptionQuery,
  payload: unknown,
): NdcPackageOption[] => {
  if (!isCatalogMedication(query.medicationKey)) return [];
  const products = asArray<FdaNdcProduct>((payload as FdaNdcPayload | null)?.results);
  const options: NdcPackageOption[] = [];
  for (const product of products) {
    if (!productMatchesDose(query, product)) continue;
    const productNdc = asText(product.product_ndc);
    const dose = matchingBundledDose(query, productNdc) || query.dose || undefined;
    const strength =
      asArray<FdaNdcIngredient>(product.active_ingredients)
        .map((ingredient) => asText(ingredient.strength))
        .find(Boolean) || dose || "FDA-listed strength";
    const presentation = asText(product.dosage_form) || "FDA-listed package";
    const labeler = asText(product.labeler_name) || "FDA-listed labeler";
    for (const rawPackage of asArray<FdaNdcPackage>(product.packaging)) {
      const ndc = asText(rawPackage.package_ndc);
      if (!ndc) continue;
      options.push({
        id: `remote:${query.medicationKey}:${dose ?? "any"}:${ndc}`,
        medicationKey: query.medicationKey,
        ...(dose ? { dose } : {}),
        strength,
        presentation,
        package: asText(rawPackage.description) || "FDA-listed package",
        labeler,
        packageKind: packageKindFrom(rawPackage.sample),
        ndc,
        source: "remote",
        sourceUrl: FDA_NDC_DIRECTORY_URL,
        referenceVersion: "fda-listed",
      });
    }
  }
  return resolveNdcOptions(query, options).filter((option) => option.source === "remote");
};

export interface NdcReferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type FdaNdcDirectoryFetcher = (query: Readonly<NdcOptionQuery>) => Promise<unknown>;

export interface NdcOptionsLookup {
  options: NdcPackageOption[];
  remoteStatus: "not-applicable" | "bundled" | "cached" | "refreshed" | "fallback";
  checkedAt?: string;
}

export interface NdcOptionResolver {
  lookup(query: NdcOptionQuery): NdcOptionsLookup;
  refreshIfStale(query: NdcOptionQuery): Promise<NdcOptionsLookup>;
}

export interface NdcOptionResolverOptions {
  storage?: NdcReferenceStorage | null;
  fetcher?: FdaNdcDirectoryFetcher;
  now?: () => number;
  ttlMs?: number;
}

interface CachedNdcReference {
  version: 1;
  medicationKey: NdcCatalogMedicationKey;
  dose: string;
  checkedAt: string;
  outcome: "success" | "failed";
  options: NdcPackageOption[];
}

const queryCacheKey = (query: NdcOptionQuery): string =>
  `${NDC_REFERENCE_CACHE_KEY}:${query.medicationKey}:${doseKey(query.dose) || "all"}`;

const optionFromCache = (
  value: unknown,
  query: NdcOptionQuery,
): NdcPackageOption | undefined => {
  if (!value || typeof value !== "object" || !isCatalogMedication(query.medicationKey)) return undefined;
  const raw = value as Partial<NdcPackageOption>;
  const ndc = asText(raw.ndc);
  if (!ndc || raw.medicationKey !== query.medicationKey || raw.source !== "remote") return undefined;
  const requested = doseKey(query.dose);
  if (raw.dose && requested && doseKey(raw.dose) !== requested) return undefined;
  return {
    id: `remote:${query.medicationKey}:${raw.dose ?? "any"}:${ndc}`,
    medicationKey: query.medicationKey,
    ...(asText(raw.dose) ? { dose: asText(raw.dose) } : {}),
    strength: asText(raw.strength) || "FDA-listed strength",
    presentation: asText(raw.presentation) || "FDA-listed package",
    package: asText(raw.package) || "FDA-listed package",
    labeler: asText(raw.labeler) || "FDA-listed labeler",
    packageKind: raw.packageKind === "sample" ? "sample" : "commercial",
    ndc,
    source: "remote",
    sourceUrl: FDA_NDC_DIRECTORY_URL,
    referenceVersion: "fda-listed",
  };
};

const parseCachedReference = (
  raw: string | null,
  query: NdcOptionQuery,
): CachedNdcReference | undefined => {
  if (!raw || !isCatalogMedication(query.medicationKey)) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<CachedNdcReference>;
    if (
      value.version !== 1 ||
      value.medicationKey !== query.medicationKey ||
      typeof value.dose !== "string" ||
      doseKey(value.dose) !== doseKey(query.dose) ||
      typeof value.checkedAt !== "string" ||
      Number.isNaN(new Date(value.checkedAt).getTime())
    ) {
      return undefined;
    }
    return {
      version: 1,
      medicationKey: query.medicationKey,
      dose: value.dose,
      checkedAt: value.checkedAt,
      // Early cache entries did not record a result; treat them as a normal
      // successful directory cache rather than forcing an unnecessary fetch.
      outcome: value.outcome === "failed" ? "failed" : "success",
      options: asArray<unknown>(value.options)
        .map((option) => optionFromCache(option, query))
        .filter((option): option is NdcPackageOption => Boolean(option)),
    };
  } catch {
    return undefined;
  }
};

const browserReferenceStorage = (): NdcReferenceStorage | null => {
  try {
    const candidate = (globalThis as typeof globalThis & {
      localStorage?: NdcReferenceStorage;
      window?: { localStorage?: NdcReferenceStorage };
    }).window?.localStorage ?? (globalThis as { localStorage?: NdcReferenceStorage }).localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
};

/**
 * The default request contains only a medication brand query. Patient/visit,
 * note, staff, lot, and entered NDC text are deliberately never sent.
 */
export const fetchFdaNdcDirectory: FdaNdcDirectoryFetcher = async (query) => {
  const url = buildFdaNdcDirectoryUrl(query);
  if (!url || typeof globalThis.fetch !== "function") return { results: [] };
  const response = await globalThis.fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`FDA NDC directory request failed (${response.status}).`);
  return response.json();
};

/**
 * Small browser-local cache around FDA-listed package choices. It is a
 * convenience layer with a 24-hour per-product throttle; failed or blocked
 * requests simply retain the audited bundled list.
 */
export const createNdcOptionResolver = (
  options: NdcOptionResolverOptions = {},
): NdcOptionResolver => {
  const storage = options.storage === undefined ? browserReferenceStorage() : options.storage;
  const fetcher = options.fetcher ?? fetchFdaNdcDirectory;
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? NDC_REFERENCE_CACHE_TTL_MS;
  const attemptedAt = new Map<string, number>();
  const inFlight = new Map<string, Promise<NdcOptionsLookup>>();

  const cache = (query: NdcOptionQuery): CachedNdcReference | undefined => {
    if (!storage || !isCatalogMedication(query.medicationKey)) return undefined;
    try {
      return parseCachedReference(storage.getItem(queryCacheKey(query)), query);
    } catch {
      return undefined;
    }
  };

  const isFresh = (entry: CachedNdcReference | undefined): boolean => {
    if (!entry) return false;
    const checked = new Date(entry.checkedAt).getTime();
    return !Number.isNaN(checked) && now() - checked < ttlMs;
  };

  const fromCache = (
    query: NdcOptionQuery,
    entry: CachedNdcReference | undefined,
    remoteStatus: NdcOptionsLookup["remoteStatus"],
  ): NdcOptionsLookup => ({
    options: resolveNdcOptions(query, entry?.options ?? []),
    remoteStatus,
    ...(entry ? { checkedAt: entry.checkedAt } : {}),
  });

  const lookup = (query: NdcOptionQuery): NdcOptionsLookup => {
    if (!isCatalogMedication(query.medicationKey)) {
      return { options: [], remoteStatus: "not-applicable" };
    }
    const entry = cache(query);
    return isFresh(entry)
      ? fromCache(query, entry, entry?.outcome === "failed" ? "fallback" : "cached")
      : fromCache(query, undefined, "bundled");
  };

  const persist = (
    query: NdcOptionQuery,
    remoteOptions: NdcPackageOption[],
    outcome: CachedNdcReference["outcome"] = "success",
  ): CachedNdcReference | undefined => {
    if (!isCatalogMedication(query.medicationKey)) return undefined;
    const entry: CachedNdcReference = {
      version: 1,
      medicationKey: query.medicationKey,
      dose: query.dose,
      checkedAt: new Date(now()).toISOString(),
      outcome,
      options: remoteOptions,
    };
    if (!storage) return entry;
    try {
      storage.setItem(queryCacheKey(query), JSON.stringify(entry));
    } catch {
      // A blocked cache must not change the visible bundled fallback.
    }
    return entry;
  };

  const refreshIfStale = async (query: NdcOptionQuery): Promise<NdcOptionsLookup> => {
    if (!isCatalogMedication(query.medicationKey)) return lookup(query);
    const current = cache(query);
    if (isFresh(current)) {
      return fromCache(query, current, current?.outcome === "failed" ? "fallback" : "cached");
    }
    const key = queryCacheKey(query);
    const attempted = attemptedAt.get(key);
    if (attempted !== undefined && now() - attempted < ttlMs) return lookup(query);
    const existing = inFlight.get(key);
    if (existing) return existing;
    attemptedAt.set(key, now());
    const refresh = (async (): Promise<NdcOptionsLookup> => {
      try {
        const payload = await fetcher({ medicationKey: query.medicationKey, dose: query.dose });
        const refreshed = fdaNdcOptionsFromPayload(query, payload);
        const entry = persist(query, refreshed);
        return fromCache(query, entry, "refreshed");
      } catch {
        // Cache an empty successful-shape record after a failed attempt so a
        // browser does not repeatedly issue a product request within 24 hours.
        persist(query, [], "failed");
        return fromCache(query, undefined, "fallback");
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, refresh);
    return refresh;
  };

  return { lookup, refreshIfStale };
};
