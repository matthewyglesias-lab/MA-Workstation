/**
 * Ordering / prescribing provider register.
 *
 * Free-text provider entry lets one clinician reach the chart as "Dr. Smith",
 * "smith", and "J Smith" across three encounters, which makes local records
 * unsearchable and the generated note inconsistent. A register fixes the
 * spelling and the credential at the point of entry.
 *
 * SCOPE: San Bernardino only, by request. IPMG runs roughly ten sites and a
 * provider at one is not automatically at another, so this list must reflect
 * who actually writes orders at San Bernardino.
 *
 * SOURCE OF TRUTH: the clinic's own MAIN_SCHEDULE_SHEET - its SAN BERNARDINO
 * tab for who staffs the site, and its "Provider DEA Lic" tab for licensure
 * spelling and prescribing authority. Do not populate this from a directory
 * aggregator (Practo, Yelp, WebMD, health-plan finders): those were checked
 * against the schedule and put at least two physicians at San Bernardino who
 * do not appear on its roster at all. A wrong ordering provider in a chart is
 * a documentation error, not a cosmetic one.
 *
 * Where the schedule tab and the licensure tab disagree on a given name, the
 * licensure spelling wins - that is the name attached to the credential.
 *
 * `id` is what gets stored, so it must stay stable once a record references
 * it. Renaming a provider is safe; changing an existing `id` is not. Mark a
 * departure with `inactive` rather than deleting the entry, so records that
 * already reference it keep resolving.
 *
 * An empty register is a supported state: every provider field falls back to
 * a plain text input rather than offering a dropdown holding only "Other".
 */

/**
 * Sentinel for the "Other…" choice. Never stored - it only tells the control
 * to show its free-text box, and the record holds the typed name.
 */
export const OTHER_PROVIDER_KEY = "__other__";

export interface RegisteredProvider {
  /** Stable key written to the record. Never reuse or repurpose one. */
  id: string;
  family: string;
  given: string;
  /** MD, DO, PMHNP, NP, PA-C, PsyD, LCSW, LMFT, ... */
  credential: string;
  /**
   * Writes medication orders. Therapists do not, so they are withheld from the
   * Injection ordering-provider and Samples prescriber fields while remaining
   * selectable wherever a non-prescribing clinician legitimately owns the work.
   */
  prescriber: boolean;
  /** Set when a provider stops taking orders; keeps old records readable. */
  inactive?: boolean;
}

/**
 * San Bernardino clinicians, from the SAN BERNARDINO schedule tab.
 *
 * Nine of the ten appear on the licensure tab and carry prescribing authority.
 * Randall Stier is an LMFT and correctly absent from it, so he is registered
 * but not a prescriber - he can own a form, not a medication order.
 */
export const SAN_BERNARDINO_PROVIDERS: ReadonlyArray<RegisteredProvider> = [
  { id: "adeniji-john", family: "Adeniji", given: "John", credential: "PMHNP", prescriber: true },
  { id: "amoako-samuel", family: "Amoako", given: "Samuel", credential: "PMHNP", prescriber: true },
  { id: "aneke-rachael", family: "Aneke", given: "Rachael", credential: "NP", prescriber: true },
  { id: "ani-eberechi", family: "Ani", given: "Eberechi", credential: "NP", prescriber: true },
  { id: "hamisi-khadija", family: "Hamisi", given: "Khadija", credential: "PMHNP", prescriber: true },
  // Licensure tab spells this "Chinyere"; the schedule tab has "Chineyere".
  { id: "obakhume-chinyere", family: "Obakhume", given: "Chinyere", credential: "PMHNP", prescriber: true },
  // Licensure tab spells this "Rachael"; the schedule tab has "Rachel".
  { id: "obi-rachael", family: "Obi", given: "Rachael", credential: "PMHNP", prescriber: true },
  { id: "patel-mansi", family: "Patel", given: "Mansi", credential: "NP", prescriber: true },
  { id: "syed-hozair", family: "Syed", given: "Hozair", credential: "MD", prescriber: true },
  { id: "stier-randall", family: "Stier", given: "Randall", credential: "LMFT", prescriber: false },
];

/** The value written to the note: "Rivera, A., PMHNP". */
export function formatProviderName(provider: RegisteredProvider): string {
  const name = [provider.family, provider.given].filter(Boolean).join(", ");
  return provider.credential ? `${name}, ${provider.credential}` : name;
}

/**
 * Options for the entry control. Inactive providers are withheld from new
 * entry but still resolve by id, so a stored record keeps rendering its
 * original provider rather than silently falling back to raw text.
 */
export function providerRegisterOptions(
  register: ReadonlyArray<RegisteredProvider> = SAN_BERNARDINO_PROVIDERS,
  options: { prescribersOnly?: boolean } = {},
): ReadonlyArray<{ key: string; label: string; description?: string }> {
  return register
    .filter((provider) => !provider.inactive)
    .filter((provider) => !options.prescribersOnly || provider.prescriber)
    .map((provider) => ({
      key: provider.id,
      label: formatProviderName(provider),
      description: provider.credential,
    }));
}

export function findRegisteredProvider(
  id: string,
  register: ReadonlyArray<RegisteredProvider> = SAN_BERNARDINO_PROVIDERS,
): RegisteredProvider | undefined {
  return id ? register.find((provider) => provider.id === id) : undefined;
}

/**
 * Resolves a stored value to display text.
 *
 * Records predating the register hold a typed name rather than an id, and
 * "Other" entries always will. Anything that does not match an id is returned
 * as-is, so no historical value is lost or rewritten.
 */
export function resolveProviderDisplay(
  stored: string,
  register: ReadonlyArray<RegisteredProvider> = SAN_BERNARDINO_PROVIDERS,
): string {
  const trimmed = stored.trim();
  if (!trimmed) return "";
  const match = findRegisteredProvider(trimmed, register);
  return match ? formatProviderName(match) : trimmed;
}

/** True when the register can drive an entry control at all. */
export function hasProviderRegister(
  register: ReadonlyArray<RegisteredProvider> = SAN_BERNARDINO_PROVIDERS,
  options: { prescribersOnly?: boolean } = {},
): boolean {
  return providerRegisterOptions(register, options).length > 0;
}
