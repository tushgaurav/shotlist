// I and O are skipped because they read as 1 and 0 on a slate.
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** 0 → A, 23 → Z, 24 → AA, 25 → AB … */
export function suffixAt(index: number): string {
  let n = index + 1;
  let suffix = "";
  while (n > 0) {
    n -= 1;
    suffix = LETTERS[n % LETTERS.length] + suffix;
    n = Math.floor(n / LETTERS.length);
  }
  return suffix;
}

/** The inverse of suffixAt, or -1 for anything it wouldn't produce. */
export function suffixIndex(suffix: string): number {
  if (!suffix) return -1;
  let n = 0;
  for (const char of suffix) {
    const digit = LETTERS.indexOf(char);
    if (digit < 0) return -1;
    n = n * LETTERS.length + digit + 1;
  }
  return n - 1;
}

/**
 * The letter after the highest one in use, so a new shot never takes the label of a shot
 * that sits before it.
 */
export function nextSuffix(existing: (string | null)[]): string {
  let max = -1;
  for (const suffix of existing) {
    if (suffix) max = Math.max(max, suffixIndex(suffix));
  }
  return suffixAt(max + 1);
}

export function shotLabel(
  sceneNumber: string | null | undefined,
  suffix: string | null,
  customLabel: string | null,
) {
  if (customLabel) return customLabel;
  return sceneNumber && suffix ? `${sceneNumber}${suffix}` : "";
}
