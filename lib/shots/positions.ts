import { generateKeyBetween } from "fractional-indexing";

export function isValidPosition(key: string) {
  // The library only checks the integer part, so check the alphabet here.
  if (key.length > 128 || !/^[0-9A-Za-z]+$/.test(key)) return false;
  try {
    generateKeyBetween(key, null);
    return true;
  } catch {
    return false;
  }
}

/** An order key between two neighbours; either may be null for the start or end. */
export function positionBetween(before: string | null, after: string | null) {
  // Two tabs can produce equal keys. There's no key between them, so go after both.
  if (before !== null && after !== null && before >= after) return generateKeyBetween(before, null);
  return generateKeyBetween(before, after);
}
