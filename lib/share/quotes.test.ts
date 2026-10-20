import { describe, expect, it } from "vitest";

import { findQuote, QUOTE_CONTEXT, quoteAt, trimSpan } from "./quotes";

const spanOf = (text: string, passage: string, from = 0) => {
  const start = text.indexOf(passage, from);
  return { start, end: start + passage.length };
};

describe("trimSpan", () => {
  it("drops whitespace and line breaks at either end", () => {
    const text = "One.\n  Two three.  \nFour.";
    expect(trimSpan(text, { start: 4, end: 20 })).toEqual(spanOf(text, "Two three."));
  });

  it("comes back empty for a span of whitespace", () => {
    const span = trimSpan("a \n b", { start: 1, end: 4 });
    expect(span.end - span.start).toBe(0);
  });
});

describe("quoteAt", () => {
  it("keeps a little context either side", () => {
    const text = `${"x".repeat(50)}the passage${"y".repeat(50)}`;
    const quote = quoteAt(text, spanOf(text, "the passage"));
    expect(quote).toEqual({ exact: "the passage", prefix: "x".repeat(QUOTE_CONTEXT), suffix: "y".repeat(QUOTE_CONTEXT) });
  });

  it("stops at the ends of the document", () => {
    expect(quoteAt("Hello world", { start: 0, end: 5 })).toEqual({ exact: "Hello", prefix: "", suffix: " world" });
  });
});

describe("findQuote", () => {
  const text = "MARY\nI said no.\nJOHN\nI said no.\nMARY\nFine.";

  it("finds the passage again after edits elsewhere", () => {
    const quote = quoteAt(text, spanOf(text, "Fine."));
    const edited = `INT. KITCHEN - NIGHT\n${text}`;
    expect(findQuote(edited, quote)).toEqual(spanOf(edited, "Fine."));
  });

  it("tells repeated passages apart by their surroundings", () => {
    const second = spanOf(text, "I said no.", text.indexOf("JOHN"));
    expect(findQuote(text, quoteAt(text, second))).toEqual(second);

    const first = spanOf(text, "I said no.");
    expect(findQuote(text, quoteAt(text, first))).toEqual(first);
  });

  it("prefers the closest surroundings when the context changed too", () => {
    const quote = quoteAt(text, spanOf(text, "I said no.", text.indexOf("JOHN")));
    const edited = text.replace("JOHN", "JOHNNY");
    expect(findQuote(edited, quote)).toEqual(spanOf(edited, "I said no.", edited.indexOf("JOHNNY")));
  });

  it("survives edits right next to the passage", () => {
    const quote = quoteAt(text, spanOf(text, "Fine."));
    const edited = text.replace("MARY\nFine.", "MARY (V.O.)\nFine.");
    expect(findQuote(edited, quote)).toEqual(spanOf(edited, "Fine."));
  });

  it("doesn't move a short passage to the same words elsewhere once it was rewritten", () => {
    const quote = quoteAt(text, spanOf(text, "I said no.", text.indexOf("JOHN")));
    const edited = text.replace("JOHN\nI said no.", "JOHN\nNot a chance.");
    expect(findQuote(edited, quote)).toBeNull();
  });

  it("finds a long passage even when everything around it changed", () => {
    const long = "Rain hammers the windows of the empty diner.";
    const quote = quoteAt(`Before.\n${long}\nAfter.`, { start: 8, end: 8 + long.length });
    const edited = `Something else entirely.\n${long}\nA new ending.`;
    expect(findQuote(edited, quote)).toEqual(spanOf(edited, long));
  });

  it("gives up once the passage itself changed", () => {
    const quote = quoteAt(text, spanOf(text, "Fine."));
    expect(findQuote(text.replace("Fine.", "Okay."), quote)).toBeNull();
  });

  it("matches nothing for an empty quote", () => {
    expect(findQuote(text, { exact: "", prefix: "", suffix: "" })).toBeNull();
  });
});
