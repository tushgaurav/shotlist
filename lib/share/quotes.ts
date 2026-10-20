/**
 * The passage a comment is about: its text plus a little of what comes before and after.
 * Shared links show the live document, so a comment finds its passage again by text, the
 * way the W3C's text quote selectors do, rather than by a position that edits would shift.
 */
export type CommentQuote = { exact: string; prefix: string; suffix: string };

export type TextSpan = { start: number; end: number };

/** How much text either side of the passage is kept, to tell repeated passages apart. */
export const QUOTE_CONTEXT = 32;
export const QUOTE_MAX_LENGTH = 5000;

/**
 * A short passage also needs this much of what comes before or after it to match, or
 * "We are closed." would move to the same line in another scene once the commented one
 * is rewritten.
 */
const MIN_CONTEXT = 8;
/** Passages this long are distinctive enough on their own. */
const DISTINCTIVE_LENGTH = 32;

/** The span without whitespace at either end. Empty if it's all whitespace. */
export function trimSpan(text: string, { start, end }: TextSpan): TextSpan {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return { start, end };
}

export function quoteAt(text: string, { start, end }: TextSpan): CommentQuote {
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - QUOTE_CONTEXT), start),
    suffix: text.slice(end, end + QUOTE_CONTEXT),
  };
}

/**
 * Where the passage is in the text now. If it appears more than once, the one whose
 * surroundings match best wins, then the first. Null once the passage itself has changed,
 * or for a short one, once what's on both sides of it has too.
 */
export function findQuote(text: string, quote: CommentQuote): TextSpan | null {
  const { exact, prefix, suffix } = quote;
  if (!exact) return null;

  const perfect = prefix.length + suffix.length;
  const distinctive = exact.length >= DISTINCTIVE_LENGTH;
  let best: { start: number; score: number } | null = null;
  for (let start = text.indexOf(exact); start !== -1; start = text.indexOf(exact, start + 1)) {
    const end = start + exact.length;
    const before = sharedEnd(text.slice(Math.max(0, start - prefix.length), start), prefix);
    const after = sharedStart(text.slice(end, end + suffix.length), suffix);
    const anchored =
      distinctive || before >= Math.min(MIN_CONTEXT, prefix.length) || after >= Math.min(MIN_CONTEXT, suffix.length);
    if (anchored && (!best || before + after > best.score)) best = { start, score: before + after };
    if (before + after === perfect) break;
  }
  return best && { start: best.start, end: best.start + exact.length };
}

function sharedStart(a: string, b: string) {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length++;
  return length;
}

function sharedEnd(a: string, b: string) {
  let length = 0;
  while (length < a.length && length < b.length && a[a.length - 1 - length] === b[b.length - 1 - length]) length++;
  return length;
}
