import { describe, expect, it } from "vitest";

import { extractPalette, normalizeHex } from "./palette";

/** RGBA pixels: `count` of each color. */
function pixels(...runs: [r: number, g: number, b: number, count: number, alpha?: number][]) {
  const values: number[] = [];
  for (const [r, g, b, count, alpha = 255] of runs) {
    for (let index = 0; index < count; index++) values.push(r, g, b, alpha);
  }
  return new Uint8ClampedArray(values);
}

describe("extractPalette", () => {
  it("returns the main colors, lightest first", () => {
    const palette = extractPalette(pixels([250, 250, 250, 50], [10, 10, 10, 30], [200, 40, 40, 20]), 3);
    expect(palette).toEqual(["#fafafa", "#c82828", "#0a0a0a"]);
  });

  it("skips near-duplicates of a color already picked", () => {
    const palette = extractPalette(
      pixels([30, 90, 200, 60], [34, 94, 204, 40], [240, 200, 40, 10]),
      2,
    );
    expect(palette).toEqual(["#f0c828", "#1e5ac8"]);
  });

  it("fills up from similar colors when there aren't enough distinct ones", () => {
    expect(extractPalette(pixels([30, 90, 200, 60], [34, 94, 204, 40]), 2)).toHaveLength(2);
  });

  it("ignores transparent pixels", () => {
    expect(extractPalette(pixels([255, 0, 0, 100, 0], [0, 0, 255, 1]), 1)).toEqual(["#0000ff"]);
  });

  it("returns nothing for an empty image", () => {
    expect(extractPalette(new Uint8ClampedArray(), 5)).toEqual([]);
  });
});

describe("normalizeHex", () => {
  it("accepts the usual ways of writing a color", () => {
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
    expect(normalizeHex("abc")).toBe("#aabbcc");
    expect(normalizeHex(" #123456 ")).toBe("#123456");
  });

  it("rejects anything else", () => {
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
  });
});
