import { describe, expect, it } from "vitest";

import { joinCompletion, lastWord } from "./complete";

describe("lastWord", () => {
  it("finds the last word, ignoring a typed space", () => {
    expect(lastWord("Headlights flare behind")).toBe("behind");
    expect(lastWord("Headlights flare behind ")).toBe("behind");
    expect(lastWord("She stops.")).toBe("stops.");
    expect(lastWord("")).toBe("");
  });
});

describe("joinCompletion", () => {
  it("strips the echoed word and keeps the space after it", () => {
    expect(joinCompletion("behind her, closing fast.", "Headlights flare behind")).toBe(" her, closing fast.");
    expect(joinCompletion("Behind her.", "Headlights flare behind")).toBe(" her.");
  });

  it("finishes a half-typed word", () => {
    expect(joinCompletion("walks to the window.", "Mary walk")).toBe("s to the window.");
  });

  it("doesn't double a space the writer already typed", () => {
    expect(joinCompletion("behind her.", "Headlights flare behind ")).toBe("her.");
  });

  it("joins replies that didn't echo the word as a new word", () => {
    expect(joinCompletion("the windshield of a sedan", "Headlights flare behind")).toBe(" the windshield of a sedan");
    expect(joinCompletion("her.", "Headlights flare behind ")).toBe("her.");
    expect(joinCompletion(", closing fast.", "Headlights flare behind")).toBe(", closing fast.");
  });

  it("keeps the first line only, and nothing stays nothing", () => {
    expect(joinCompletion("behind her.\nMARY\nWho's there?", "Headlights flare behind")).toBe(" her.");
    expect(joinCompletion("", "Headlights flare behind")).toBe("");
    expect(joinCompletion("behind", "Headlights flare behind")).toBe("");
  });
});
