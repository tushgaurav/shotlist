import { isElementType, UPPERCASE_ELEMENTS, type ElementType } from "./elements";
import type { ScreenplayDocJSON, TextJSON, TitlePage } from "./types";

export type PaperSize = "letter" | "a4";

/** Page sizes in inches. */
export const PAPER_SIZES: Record<PaperSize, { label: string; width: number; height: number }> = {
  letter: { label: "US Letter", width: 8.5, height: 11 },
  a4: { label: "A4", width: 8.27, height: 11.69 },
};

/** Courier at 12 pt: every character is 1/10 inch wide and every line 1/6 inch tall. */
export const CHARS_PER_INCH = 10;
export const LINES_PER_INCH = 6;

/** Page margins in inches, the same as the editor's page in screenplay.css. */
export const PAGE_MARGINS = { top: 1, right: 1, bottom: 1, left: 1.5 };

export type TextRun = { text: string; bold: boolean; italic: boolean; underline: boolean };

export type LayoutLine = {
  /** Lines down from the top margin. */
  row: number;
  /** Characters across from the left margin. */
  column: number;
  runs: TextRun[];
  /** Printed in both margins; set on the first line of a scene heading when scene numbers are on. */
  sceneNumber?: string;
};

export type LayoutPage = { lines: LayoutLine[] };

export type ScreenplayLayout = {
  paper: PaperSize;
  /** Characters per line and lines per page inside the margins. */
  columns: number;
  rows: number;
  titlePage: LayoutPage | null;
  pages: LayoutPage[];
};

export type LayoutOptions = {
  paper: PaperSize;
  sceneNumbers?: boolean;
  /** Adds a title page when given. */
  titlePage?: TitlePage;
};

/** Element positions in characters from the left margin, matching screenplay.css. */
const INDENT: Record<ElementType, number> = {
  sceneHeading: 0,
  action: 0,
  character: 22,
  parenthetical: 16,
  dialogue: 10,
  transition: 0,
};
const MAX_WIDTH: Partial<Record<ElementType, number>> = { parenthetical: 20, dialogue: 35 };

const SPEECH: ReadonlySet<ElementType> = new Set(["parenthetical", "dialogue"]);
const DASHES = new Set(["-", "–", "—"]);
const CONTINUED = /\(CONT['’]D\)\s*$/i;

type Line = { column: number; runs: TextRun[] };

type Block = { type: ElementType; runs: TextRun[]; lines: Line[]; sceneNumber?: string };

/** A line of a character's speech, tagged with the parenthetical or dialogue it belongs to. */
type SpeechLine = Line & { part: number; parenthetical: boolean };

type Unit =
  | { kind: "block"; block: Block; space: number }
  | { kind: "dialogue"; cue: Block; speech: SpeechLine[]; space: number };

/**
 * Lays a screenplay out on pages the way it prints: Courier 12 pt, standard element
 * positions, and the usual page-break rules. A scene heading never ends a page, action
 * splits only with two lines on each side, and a speech split across pages gets (MORE)
 * and a (CONT'D) cue. Empty elements are skipped, as in the Fountain export.
 */
export function layoutScreenplay(doc: ScreenplayDocJSON, options: LayoutOptions): ScreenplayLayout {
  const { width, height } = PAPER_SIZES[options.paper];
  const columns = Math.floor((width - PAGE_MARGINS.left - PAGE_MARGINS.right) * CHARS_PER_INCH + 1e-6);
  const rows = Math.floor((height - PAGE_MARGINS.top - PAGE_MARGINS.bottom) * LINES_PER_INCH + 1e-6);

  const units = buildUnits(doc, columns, options.sceneNumbers ?? false);
  const pages = new PageBuilder(rows);
  units.forEach((unit, index) => {
    if (unit.kind === "dialogue") placeDialogue(pages, unit, columns);
    else placeBlock(pages, unit, units[index + 1]);
  });

  return {
    paper: options.paper,
    columns,
    rows,
    titlePage: options.titlePage ? layoutTitlePage(options.titlePage, columns, rows) : null,
    pages: pages.finish(),
  };
}

function buildUnits(doc: ScreenplayDocJSON, columns: number, sceneNumbers: boolean): Unit[] {
  const units: Unit[] = [];
  let previous: ElementType | null = null;
  // Numbered like the scene sidebar: every heading with a scene ID counts, even an empty one.
  let scenes = 0;

  for (const node of doc.content) {
    if (!isElementType(node.type)) continue;
    const type = node.type;
    const isScene = type === "sceneHeading" && typeof node.attrs?.sceneId === "string";
    if (isScene) scenes++;

    const nodes = node.content ?? [];
    if (!nodes.some((text) => text.text.trim())) continue;

    const runs = toRuns(nodes, UPPERCASE_ELEMENTS.has(type));
    const block: Block = {
      type,
      runs,
      lines: layoutLines(type, runs, columns),
      sceneNumber: isScene && sceneNumbers ? String(scenes) : undefined,
    };

    const last = units.at(-1);
    if (SPEECH.has(type) && last?.kind === "dialogue") {
      const part = (last.speech.at(-1)?.part ?? -1) + 1;
      last.speech.push(...block.lines.map((line) => ({ ...line, part, parenthetical: type === "parenthetical" })));
    } else if (type === "character") {
      units.push({ kind: "dialogue", cue: block, speech: [], space: spaceBefore(previous, type) });
    } else {
      units.push({ kind: "block", block, space: spaceBefore(previous, type) });
    }
    previous = type;
  }
  return units;
}

function isSpeaker(type: ElementType) {
  return type === "character" || SPEECH.has(type);
}

/** Blank lines before an element, as in screenplay.css. */
function spaceBefore(previous: ElementType | null, type: ElementType) {
  if (!previous) return 0;
  if (type === "sceneHeading") return 2;
  if (SPEECH.has(type) && isSpeaker(previous)) return 0;
  return 1;
}

export function toRuns(nodes: TextJSON[], uppercase: boolean): TextRun[] {
  return nodes.map((node) => {
    const marks = new Set((node.marks ?? []).map((mark) => mark.type));
    return {
      text: (uppercase ? node.text.toUpperCase() : node.text).replace(/[\t\n\r\f\v]/g, " "),
      bold: marks.has("bold"),
      italic: marks.has("italic"),
      underline: marks.has("underline"),
    };
  });
}

function layoutLines(type: ElementType, runs: TextRun[], columns: number): Line[] {
  const indent = INDENT[type];
  const width = Math.min(MAX_WIDTH[type] ?? Infinity, columns - indent);
  const text = runs.map((run) => run.text).join("");
  return wrapText(text, width).map(([start, end]) => ({
    column: type === "transition" ? columns - (end - start) : indent,
    runs: sliceRuns(runs, start, end),
  }));
}

/**
 * Breaks text into lines of at most `width` characters, at spaces or after a dash where
 * possible, like the editor does. Returns [start, end) offsets; spaces at a break are dropped.
 */
export function wrapText(text: string, width: number): [number, number][] {
  const lines: [number, number][] = [];
  let start = 0;
  while (start < text.length) {
    if (text.length - start <= width) {
      const end = trimEnd(text, start, text.length);
      if (end > start) lines.push([start, end]);
      break;
    }

    let end = start + width;
    let next = end;
    for (let at = start + width; at > start; at--) {
      if (text[at] === " ") {
        const trimmed = trimEnd(text, start, at);
        if (trimmed > start) {
          end = trimmed;
          next = at;
          break;
        }
      } else if (DASHES.has(text[at - 1]) && at - 1 > start) {
        end = next = at;
        break;
      }
    }

    lines.push([start, end]);
    start = next;
    while (text[start] === " ") start++;
  }
  return lines;
}

function trimEnd(text: string, start: number, end: number) {
  while (end > start && text[end - 1] === " ") end--;
  return end;
}

function sliceRuns(runs: TextRun[], start: number, end: number): TextRun[] {
  const sliced: TextRun[] = [];
  let offset = 0;
  for (const run of runs) {
    const from = Math.max(start, offset);
    const to = Math.min(end, offset + run.text.length);
    if (from < to) sliced.push({ ...run, text: run.text.slice(from - offset, to - offset) });
    offset += run.text.length;
  }
  return sliced;
}

export function plain(text: string): TextRun[] {
  return [{ text, bold: false, italic: false, underline: false }];
}

class PageBuilder {
  private pages: LayoutPage[] = [];
  private lines: LayoutLine[] = [];
  private row = 0;

  constructor(private readonly rows: number) {}

  get atTop() {
    return this.row === 0;
  }

  /** Lines left on this page after `space` blank lines, which are dropped at the top of a page. */
  room(space: number) {
    return this.rows - this.row - (this.atTop ? 0 : space);
  }

  add(space: number, lines: (Line & { sceneNumber?: string })[]) {
    if (!this.atTop) this.row += space;
    for (const { column, runs, sceneNumber } of lines) {
      this.lines.push({ row: this.row++, column, runs, ...(sceneNumber ? { sceneNumber } : {}) });
    }
  }

  newPage() {
    this.pages.push({ lines: this.lines });
    this.lines = [];
    this.row = 0;
  }

  finish() {
    if (this.lines.length > 0 || this.pages.length === 0) this.newPage();
    return this.pages;
  }
}

function placeBlock(pages: PageBuilder, unit: Extract<Unit, { kind: "block" }>, next: Unit | undefined) {
  const { block } = unit;
  let { space } = unit;
  let lines = block.lines;

  if (block.type === "sceneHeading") {
    // Keep the heading with the start of whatever follows it.
    const needed = lines.length + (next ? next.space + minimumStart(next) : 0);
    if (pages.room(space) < needed && !pages.atTop) pages.newPage();
    pages.add(space, lines.map((line, index) => (index === 0 ? { ...line, sceneNumber: block.sceneNumber } : line)));
    return;
  }

  while (true) {
    const room = pages.room(space);
    if (lines.length <= room) {
      pages.add(space, lines);
      return;
    }
    let split = block.type === "action" ? Math.min(room, lines.length - 2) : 0;
    if (split < 2) {
      if (!pages.atTop) {
        pages.newPage();
        continue;
      }
      // Longer than a whole page and not splittable by the rules: fill the page.
      split = room;
    }
    pages.add(space, lines.slice(0, split));
    pages.newPage();
    lines = lines.slice(split);
    space = 0;
  }
}

function placeDialogue(pages: PageBuilder, unit: Extract<Unit, { kind: "dialogue" }>, columns: number) {
  let { cue, speech, space } = unit;

  while (true) {
    const room = pages.room(space);
    if (cue.lines.length + speech.length <= room) {
      pages.add(space, [...cue.lines, ...speech]);
      return;
    }

    // Lines of speech to keep on this page; one more line is needed for (MORE).
    const fits = splitPoints(speech).filter((split) => cue.lines.length + split + 1 <= room);
    let split = fits.at(-1);
    if (split === undefined) {
      if (!pages.atTop) {
        pages.newPage();
        continue;
      }
      // A speech too long for a page with no allowed break in it: break where the page fills.
      split = Math.min(speech.length, Math.max(1, room - cue.lines.length - 1));
    }

    pages.add(space, [...cue.lines, ...speech.slice(0, split), { column: INDENT.character, runs: plain("(MORE)") }]);
    pages.newPage();
    cue = continuedCue(cue, columns);
    speech = speech.slice(split);
    space = 0;
  }
}

/**
 * Where a speech may break across pages, as the number of lines kept on the first page:
 * after a line of dialogue (never after a parenthetical), and inside a paragraph only
 * with at least two of its lines on each side.
 */
function splitPoints(speech: SpeechLine[]): number[] {
  const points: number[] = [];
  for (let split = 1; split < speech.length; split++) {
    const before = speech[split - 1];
    if (before.parenthetical) continue;
    if (speech[split].part === before.part) {
      const linesBefore = speech.slice(0, split).filter((line) => line.part === before.part).length;
      const linesAfter = speech.slice(split).filter((line) => line.part === before.part).length;
      if (linesBefore < 2 || linesAfter < 2) continue;
    }
    points.push(split);
  }
  return points;
}

/** The fewest lines a unit needs to start on a page without breaking the rules. */
function minimumStart(unit: Unit) {
  if (unit.kind === "dialogue") {
    const total = unit.cue.lines.length + unit.speech.length;
    const first = splitPoints(unit.speech)[0];
    return first === undefined ? total : Math.min(total, unit.cue.lines.length + first + 1);
  }
  const lines = unit.block.lines.length;
  return unit.block.type === "action" && lines >= 4 ? 2 : lines;
}

function continuedCue(cue: Block, columns: number): Block {
  const text = cue.runs.map((run) => run.text).join("");
  if (CONTINUED.test(text)) return cue;
  const runs = [...cue.runs, ...plain(" (CONT'D)")];
  return { ...cue, runs, lines: layoutLines("character", runs, columns) };
}

/** Title centred a third of the way down; contact bottom left and draft date bottom right. */
function layoutTitlePage(titlePage: TitlePage, columns: number, rows: number): LayoutPage {
  const lines: LayoutLine[] = [];
  const valueLines = (value: string | undefined, width: number) =>
    (value ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => wrapText(line, width).map(([start, end]) => line.slice(start, end)));

  // Each value with the blank lines above it.
  const centered: [string | undefined, number][] = [
    [titlePage.title, 0],
    [titlePage.credit, 1],
    [titlePage.author, 1],
    [titlePage.source, 2],
  ];
  let row = Math.round(rows * 0.3);
  let first = true;
  for (const [value, gap] of centered) {
    const texts = valueLines(value, columns);
    if (texts.length === 0) continue;
    if (!first) row += gap;
    first = false;
    for (const text of texts) {
      lines.push({ row: row++, column: Math.floor((columns - text.length) / 2), runs: plain(text) });
    }
  }

  const draftDate = valueLines(titlePage.draftDate, Math.floor(columns / 2));
  const draftWidth = Math.max(0, ...draftDate.map((text) => text.length));
  const contact = valueLines(titlePage.contact, draftWidth ? columns - draftWidth - 4 : columns);
  const bottom = (texts: string[], column: (text: string) => number) =>
    texts.forEach((text, index) =>
      lines.push({ row: rows - texts.length + index, column: column(text), runs: plain(text) }),
    );
  bottom(contact, () => 0);
  bottom(draftDate, (text) => columns - text.length);

  return { lines };
}
