import { describe, expect, it } from "vitest";

import { isValidPosition, positionBetween } from "./positions";

describe("positionBetween", () => {
  it("sorts between its neighbours as a plain string", () => {
    const first = positionBetween(null, null);
    const last = positionBetween(first, null);
    const middle = positionBetween(first, last);
    expect([last, middle, first].sort()).toEqual([first, middle, last]);
  });

  it("goes after both neighbours when they're equal", () => {
    const key = positionBetween(null, null);
    expect(positionBetween(key, key) > key).toBe(true);
  });
});

describe("isValidPosition", () => {
  it("accepts generated keys and rejects anything else", () => {
    expect(isValidPosition(positionBetween(null, null))).toBe(true);
    expect(isValidPosition("zz")).toBe(false);
    expect(isValidPosition("")).toBe(false);
    expect(isValidPosition("a0 ")).toBe(false);
  });
});
