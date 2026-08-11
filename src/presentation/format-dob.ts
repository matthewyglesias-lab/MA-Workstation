/**
 * As-you-type MM/DD/YYYY formatting for a date-of-birth text field. Purely a
 * display mask - it inserts slashes as digits accumulate, nothing more.
 * Digits are the only thing that carries meaning; everything else (existing
 * slashes, letters, stray punctuation) is stripped and the slashes are
 * rebuilt from the resulting digit count, so backspacing from the end of
 * the field always removes exactly one digit's worth of formatting.
 */
export function formatDobAsTyped(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
