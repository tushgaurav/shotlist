import { describe, expect, it } from "vitest";

import { nextSuffix, shotLabel, suffixAt, suffixIndex } from "./numbering";

describe("suffixAt", () => {
  it("skips I and O", () => {
    expect(Array.from({ length: 24 }, (_, i) => suffixAt(i)).join("")).toBe(
      "ABCDEFGHJKLMNPQRSTUVWXYZ",
    );
  });

  it("continues with AA after Z", () => {
    expect(suffixAt(23)).toBe("Z");
    expect(suffixAt(24)).toBe("AA");
    expect(suffixAt(25)).toBe("AB");
    expect(suffixAt(24 + 24 * 24)).toBe("AAA");
  });

  it("round-trips through suffixIndex", () => {
    for (let i = 0; i < 1000; i++) expect(suffixIndex(suffixAt(i))).toBe(i);
  });
});

describe("suffixIndex", () => {
  it("rejects letters a renumber would never produce", () => {
    expect(suffixIndex("I")).toBe(-1);
    expect(suffixIndex("O")).toBe(-1);
    expect(suffixIndex("a")).toBe(-1);
    expect(suffixIndex("")).toBe(-1);
  });
});

describe("nextSuffix", () => {
  it("starts at A", () => {
    expect(nextSuffix([])).toBe("A");
    expect(nextSuffix([null])).toBe("A");
  });

  it("takes the letter after the highest one, not the first gap", () => {
    expect(nextSuffix(["A", "C"])).toBe("D");
    expect(nextSuffix(["H"])).toBe("J");
    expect(nextSuffix(["Z", "B"])).toBe("AA");
  });
});

describe("shotLabel", () => {
  it("joins the scene number and suffix", () => {
    expect(shotLabel("12", "A", null)).toBe("12A");
  });

  it("prefers a custom label", () => {
    expect(shotLabel("12", "A", "Drone 1")).toBe("Drone 1");
    expect(shotLabel(null, null, "B-roll")).toBe("B-roll");
  });

  it("is empty without a scene", () => {
    expect(shotLabel(null, "A", null)).toBe("");
  });
});
