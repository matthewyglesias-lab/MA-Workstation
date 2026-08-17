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
 * SOURCE OF TRUTH: the clinic's own current roster. Do not populate this from
 * a directory aggregator (Practo, Yelp, WebMD, health-plan finders) - those
 * carry departed providers and wrong site attributions, and a wrong ordering
 * provider in a chart is a documentation error, not a cosmetic one. The
 * official provider page is captcha-gated and cannot be scraped.
 *
 * TO POPULATE: add one entry per provider, in the shape below, and the three
 * provider fields become registers automatically. While this list is empty
 * every provider field stays a plain free-text input, exactly as before - the
 * register never degrades entry to a dropdown holding only "Other".
 *
 *   { id: "rivera-a", family: "Rivera", given: "A.", credential: "PMHNP" }
 *
 * `id` is what gets stored, so it must stay stable once a record references
 * it. Renaming a provider is safe; changing an existing `id` is not.
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
  /** MD, DO, PMHNP, NP, PA-C, PsyD, LCSW, ... */
  credential: string;
  /** Set when a provider stops taking orders; keeps old records readable. */
  inactive?: boolean;
}

/**
 * San Bernardino ordering providers. Intentionally empty - see TO POPULATE.
 */
export const SAN_BERNARDINO_PROVIDERS: ReadonlyArray<RegisteredProvider> = [];

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
): ReadonlyArray<{ key: string; label: string; description?: string }> {
  return register
    .filter((provider) => !provider.inactive)
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
): boolean {
  return register.some((provider) => !provider.inactive);
}
