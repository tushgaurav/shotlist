import { MAX_BOARD_COLUMNS } from "./types";

export type LayoutEntry = { id: string; wide: boolean; height: number };

/** A run of items in columns, or one full-width item between runs. */
export type Band = { kind: "columns"; key: string; columns: string[][] } | { kind: "wide"; key: string; id: string };

/**
 * Lays out a board in its stored order. Each item goes into the column that is shortest so
 * far (the leftmost on a tie), so the board reads left to right. A full-width item starts
 * below the tallest column, and the items after it start a fresh run of columns.
 * `gap` is the space between items in a column.
 */
export function layoutBoard(entries: LayoutEntry[], columnCount: number, gap = 0): Band[] {
  const count = Math.max(1, Math.floor(columnCount));
  const bands: Band[] = [];
  let columns: string[][] | null = null;
  let heights: number[] = [];

  for (const entry of entries) {
    if (entry.wide) {
      columns = null;
      bands.push({ kind: "wide", key: entry.id, id: entry.id });
      continue;
    }
    if (!columns) {
      columns = Array.from({ length: count }, () => []);
      heights = Array.from({ length: count }, () => 0);
      // Keyed by its first item, so a run keeps its identity while items around it change.
      bands.push({ kind: "columns", key: `run:${entry.id}`, columns });
    }
    let shortest = 0;
    for (let index = 1; index < count; index++) {
      if (heights[index] < heights[shortest]) shortest = index;
    }
    columns[shortest].push(entry.id);
    heights[shortest] += (columns[shortest].length > 1 ? gap : 0) + entry.height;
  }
  return bands;
}

const MIN_COLUMN_WIDTH = 140;
const PHONE_WIDTH = 640;

/** The board's column count, cut down to what fits. Phones show at most two. */
export function visibleColumns(columns: number, width: number, gap: number) {
  const fit = Math.max(1, Math.floor((width + gap) / (MIN_COLUMN_WIDTH + gap)));
  const cap = width < PHONE_WIDTH ? 2 : MAX_BOARD_COLUMNS;
  return Math.max(1, Math.min(columns, fit, cap));
}
