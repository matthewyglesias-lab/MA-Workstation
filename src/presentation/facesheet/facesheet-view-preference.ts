import { browserSafeStorage, type SafeStorage } from "../../persistence/storage";
import { FACESHEET_CARD_ORDER, type FacesheetCardId } from "./Facesheet";

/**
 * Which Facesheet cards this browser shows.
 *
 * A display preference, and deliberately presentation-owned: it holds no
 * clinical content, so it does not belong in the record repositories and this
 * module adds no key or field to them. It goes through the same `SafeStorage`
 * wrapper everything else uses, so a browser with storage disabled degrades to
 * the default set rather than throwing.
 */
export const FACESHEET_CARDS_STORAGE_KEY = "ipmgMedAssistFacesheetCards_v1";

const isCardId = (value: unknown): value is FacesheetCardId =>
  typeof value === "string" &&
  (FACESHEET_CARD_ORDER as readonly string[]).includes(value);

/** Stored order is ignored; the Facesheet's own order is the layout. */
const inCanonicalOrder = (cards: readonly FacesheetCardId[]): FacesheetCardId[] =>
  FACESHEET_CARD_ORDER.filter((card) => cards.includes(card));

export const readFacesheetCards = (
  storage: SafeStorage = browserSafeStorage(),
): FacesheetCardId[] => {
  const raw = storage.read(FACESHEET_CARDS_STORAGE_KEY);
  if (!raw.ok || !raw.value) return [...FACESHEET_CARD_ORDER];
  try {
    const parsed: unknown = JSON.parse(raw.value);
    if (!Array.isArray(parsed)) return [...FACESHEET_CARD_ORDER];
    // An empty stored array is a real choice - every card hidden - and is kept.
    // A malformed one is not, and falls back to the full set.
    return inCanonicalOrder(parsed.filter(isCardId));
  } catch {
    return [...FACESHEET_CARD_ORDER];
  }
};

export const writeFacesheetCards = (
  cards: readonly FacesheetCardId[],
  storage: SafeStorage = browserSafeStorage(),
): void => {
  storage.write(FACESHEET_CARDS_STORAGE_KEY, JSON.stringify(inCanonicalOrder(cards)));
};

export const toggleFacesheetCard = (
  cards: readonly FacesheetCardId[],
  card: FacesheetCardId,
): FacesheetCardId[] =>
  inCanonicalOrder(
    cards.includes(card) ? cards.filter((item) => item !== card) : [...cards, card],
  );
