import { describe, expect, it } from "vitest";

import { layoutScreenplay, wrapText, type LayoutPage } from "./pagination";
import type { BlockJSON, ScreenplayDocJSON } from "./types";

const b = (type: string, text: string, marks?: string[]): BlockJSON => ({
  type,
  content: text ? [{ type: "text", text, ...(marks ? { marks: marks.map((m) => ({ type: m })) } : {}) }] : [],
});
const heading = (sceneId: string, text: string): BlockJSON => ({
  type: "sceneHeading",
  attrs: { sceneId },
  content: text ? [{ type: "text", text }] : [],
});
const doc = (...content: BlockJSON[]): ScreenplayDocJSON => ({ type: "doc", content });

/** One-line actions; the nth ends on row 2(n − 1) of a US Letter page. */
const filler = (count: number) => Array.from({ length: count }, (_, i) => b("action", `Line ${i + 1}.`));
/** Seven words of four letters fill one 35-character dialogue line. */
const words = (lines: number) => Array.from({ length: lines * 7 }, () => "word").join(" ");

/** [row, column, text] for each line, so layouts read like the page. */
const rows = (page: LayoutPage) =>
  page.lines.map((line) => [line.row, line.column, line.runs.map((run) => run.text).join("")]);

const letter = (content: ScreenplayDocJSON, options = {}) => layoutScreenplay(content, { paper: "letter", ...options });

describe("wrapText", () => {
  it("breaks at spaces and drops them", () => {
    expect(wrapText("one two three", 8)).toEqual([
      [0, 7],
      [8, 13],
    ]);
  });

  it("breaks after a dash, and inside a word too long for the line", () => {
    const text = "well-known abcdefghijkl";
    expect(wrapText(text, 6).map(([start, end]) => text.slice(start, end))).toEqual([
      "well-",
      "known",
      "abcdef",
      "ghijkl",
    ]);
  });

  it("keeps leading spaces and drops trailing ones", () => {
    expect(wrapText("  hi   ", 10)).toEqual([[0, 4]]);
  });
});

describe("layoutScreenplay", () => {
  it("places elements where the editor shows them", () => {
    const layout = letter(
      doc(
        heading("a", "int. kitchen - night"),
        b("action", "Mary stirs a pot."),
        b("character", "Mary"),
        b("parenthetical", "(quietly)"),
        b("dialogue", "It's ready."),
        b("transition", "cut to:"),
        heading("b", "EXT. GARDEN - DAY"),
      ),
    );

    expect(layout).toMatchObject({ columns: 60, rows: 54, titlePage: null });
    expect(layout.pages).toHaveLength(1);
    expect(rows(layout.pages[0])).toEqual([
      [0, 0, "INT. KITCHEN - NIGHT"],
      [2, 0, "Mary stirs a pot."],
      [4, 22, "MARY"],
      [5, 16, "(quietly)"],
      [6, 10, "It's ready."],
      [8, 53, "CUT TO:"],
      [11, 0, "EXT. GARDEN - DAY"],
    ]);
  });

  it("wraps each element to its width and keeps marks", () => {
    const layout = letter(
      doc({
        type: "dialogue",
        content: [
          { type: "text", text: "This line of dialogue is " },
          { type: "text", text: "much too long", marks: [{ type: "bold" }, { type: "underline" }] },
          { type: "text", text: " for one line." },
        ],
      }),
    );

    const [first, second] = layout.pages[0].lines;
    expect(first.runs).toEqual([
      { text: "This line of dialogue is ", bold: false, italic: false, underline: false },
      { text: "much too", bold: true, italic: false, underline: true },
    ]);
    expect(second.runs).toEqual([
      { text: "long", bold: true, italic: false, underline: true },
      { text: " for one line.", bold: false, italic: false, underline: false },
    ]);
  });

  it("skips empty elements but still counts their scene numbers", () => {
    const layout = letter(doc(heading("a", ""), b("action", "  "), heading("b", "INT. HOUSE - DAY")), {
      sceneNumbers: true,
    });
    expect(layout.pages[0].lines).toEqual([
      expect.objectContaining({ row: 0, sceneNumber: "2" }),
    ]);
    expect(letter(doc(heading("a", "INT. HOUSE - DAY"))).pages[0].lines[0].sceneNumber).toBeUndefined();
  });

  it("starts a new page when one is full, without a gap at the top", () => {
    const pages = letter(doc(...filler(28))).pages;
    expect(pages).toHaveLength(2);
    expect(rows(pages[0]).at(-1)).toEqual([52, 0, "Line 27."]);
    expect(rows(pages[1])).toEqual([[0, 0, "Line 28."]]);
  });

  it("splits long action with at least two lines on each side", () => {
    const action = b("action", Array.from({ length: 10 }, (_, i) => `Line ${i}`.padEnd(59, ".")).join(" "));

    const split = letter(doc(...filler(24), action)).pages;
    expect(split[0].lines.slice(24).map((line) => line.row)).toEqual([48, 49, 50, 51, 52, 53]);
    expect(split[1].lines).toHaveLength(4);

    const short = b("action", Array.from({ length: 3 }, () => "x".repeat(59)).join(" "));
    const moved = letter(doc(...filler(26), short)).pages;
    expect(moved[0].lines).toHaveLength(26);
    expect(moved[1].lines.map((line) => line.row)).toEqual([0, 1, 2]);
  });

  it("never leaves a scene heading at the bottom of a page", () => {
    const pages = letter(doc(...filler(26), heading("a", "INT. HOUSE - DAY"), b("action", "Quiet."))).pages;
    expect(pages[0].lines).toHaveLength(26);
    expect(rows(pages[1])).toEqual([
      [0, 0, "INT. HOUSE - DAY"],
      [2, 0, "Quiet."],
    ]);
  });

  it("continues a speech on the next page with (MORE) and (CONT'D)", () => {
    const pages = letter(doc(...filler(24), b("character", "Mary (V.O.)"), b("dialogue", words(8)))).pages;

    expect(rows(pages[0]).slice(24)).toEqual([
      [48, 22, "MARY (V.O.)"],
      ...[49, 50, 51, 52].map((row) => [row, 10, words(1)]),
      [53, 22, "(MORE)"],
    ]);
    expect(rows(pages[1])).toEqual([
      [0, 22, "MARY (V.O.) (CONT'D)"],
      ...[1, 2, 3, 4].map((row) => [row, 10, words(1)]),
    ]);
  });

  it("doesn't end a page on a parenthetical or leave one line of a paragraph behind", () => {
    const pages = letter(
      doc(
        ...filler(25),
        b("character", "Mary"),
        b("dialogue", "Wait."),
        b("parenthetical", "(beat)"),
        b("dialogue", words(4)),
      ),
    ).pages;

    expect(rows(pages[0]).slice(25)).toEqual([
      [50, 22, "MARY"],
      [51, 10, "Wait."],
      [52, 22, "(MORE)"],
    ]);
    expect(rows(pages[1]).slice(0, 2)).toEqual([
      [0, 22, "MARY (CONT'D)"],
      [1, 16, "(beat)"],
    ]);
  });

  it("splits a speech longer than a page more than once", () => {
    const pages = letter(doc(b("character", "Mary"), b("dialogue", words(120)))).pages;
    expect(pages).toHaveLength(3);
    for (const page of pages.slice(0, 2)) expect(rows(page).at(-1)).toEqual([53, 22, "(MORE)"]);
    expect(pages.flatMap((page) => page.lines).filter((line) => line.column === 10)).toHaveLength(120);
  });

  it("lays out a title page", () => {
    const layout = letter(doc(b("action", "Hi.")), {
      titlePage: {
        title: "The Pot",
        credit: "Written by",
        author: "Tush",
        contact: "tush@example.com\n+91 00000",
        draftDate: "First draft",
      },
    });

    expect(rows(layout.titlePage!)).toEqual([
      [16, 26, "The Pot"],
      [18, 25, "Written by"],
      [20, 28, "Tush"],
      [52, 0, "tush@example.com"],
      [53, 0, "+91 00000"],
      [53, 49, "First draft"],
    ]);
  });

  it("fits more lines and fewer characters on A4", () => {
    const layout = layoutScreenplay(doc(b("transition", "CUT TO:")), { paper: "a4" });
    expect(layout).toMatchObject({ columns: 57, rows: 58 });
    expect(layout.pages[0].lines[0].column).toBe(50);
  });
});
