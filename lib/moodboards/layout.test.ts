import { describe, expect, it } from "vitest";

import { layoutBoard, visibleColumns, type LayoutEntry } from "./layout";

const item = (id: string, height: number, wide = false): LayoutEntry => ({ id, height, wide });

describe("layoutBoard", () => {
  it("puts each item in the shortest column, leftmost on a tie", () => {
    const bands = layoutBoard([item("a", 100), item("b", 50), item("c", 80), item("d", 10)], 3);
    expect(bands).toEqual([{ kind: "columns", key: "run:a", columns: [["a"], ["b", "d"], ["c"]] }]);
  });

  it("fills columns left to right while they're even", () => {
    const bands = layoutBoard([item("a", 10), item("b", 10), item("c", 10), item("d", 10)], 2);
    expect(bands).toEqual([{ kind: "columns", key: "run:a", columns: [["a", "c"], ["b", "d"]] }]);
  });

  it("counts the gap between items in a column", () => {
    // Without the gap, column 0 (10 + 10) would tie with column 1 (20) and win.
    const bands = layoutBoard([item("a", 10), item("b", 20), item("c", 10), item("d", 5)], 2, 4);
    expect(bands[0]).toMatchObject({ columns: [["a", "c"], ["b", "d"]] });
  });

  it("starts a fresh run after a full-width item", () => {
    const bands = layoutBoard(
      [item("a", 100), item("h", 20, true), item("b", 10), item("c", 10), item("w", 20, true)],
      2,
    );
    expect(bands).toEqual([
      { kind: "columns", key: "run:a", columns: [["a"], []] },
      { kind: "wide", key: "h", id: "h" },
      { kind: "columns", key: "run:b", columns: [["b"], ["c"]] },
      { kind: "wide", key: "w", id: "w" },
    ]);
  });

  it("stacks everything in one column", () => {
    expect(layoutBoard([item("a", 1), item("b", 1)], 1)).toEqual([
      { kind: "columns", key: "run:a", columns: [["a", "b"]] },
    ]);
  });

  it("lays out an empty board as nothing", () => {
    expect(layoutBoard([], 3)).toEqual([]);
  });
});

describe("visibleColumns", () => {
  it("keeps the board's count when it fits", () => {
    expect(visibleColumns(4, 1200, 16)).toBe(4);
    expect(visibleColumns(2, 1200, 16)).toBe(2);
  });

  it("shows at most two columns on phones", () => {
    expect(visibleColumns(4, 400, 12)).toBe(2);
  });

  it("drops columns that would be too narrow", () => {
    expect(visibleColumns(4, 500, 12)).toBe(2);
    expect(visibleColumns(3, 250, 12)).toBe(1);
  });
});
