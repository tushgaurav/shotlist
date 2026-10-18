import { describe, expect, it } from "vitest";

import type { ScreenplayBlock } from "../screenplay/blocks";
import { CURSOR_MARKER, describeCursor, filledDetails, projectBrief, REWRITE_END, REWRITE_START, scriptContext, type AiProject } from "./context";
import { cleanElements } from "./elements";

const project: AiProject = {
  title: "Night Shift",
  typeName: null,
  logline: null,
  synopsis: null,
  genre: null,
  tone: null,
  targetRuntimeMinutes: null,
  aspectRatio: null,
  language: null,
  titlePage: {},
};

const block = (type: ScreenplayBlock["type"], text: string, sceneId: string | null = null): ScreenplayBlock => ({
  type,
  text,
  sceneId,
});

const script: ScreenplayBlock[] = [
  block("sceneHeading", "INT. DINER - NIGHT", "s1"),
  block("action", "Rain against the glass."),
  block("character", "MARY"),
  block("dialogue", "Coffee?"),
  block("character", "TOM (V.O.)"),
  block("dialogue", "Black."),
  block("character", "MARY"),
  block("dialogue", "Figures."),
  block("sceneHeading", "EXT. PARKING LOT - NIGHT", "s2"),
  block("action", "Tom crosses to his car."),
];

describe("projectBrief", () => {
  it("only mentions the details that are filled in", () => {
    expect(projectBrief(project)).toBe("Title: Night Shift");
    const brief = projectBrief({ ...project, genre: "Thriller", targetRuntimeMinutes: 12, synopsis: "Two strangers." });
    expect(brief).toContain("Genre: Thriller");
    expect(brief).toContain("Target runtime: 12 minutes (about 12 pages");
    expect(brief).toMatch(/Synopsis:\nTwo strangers\.$/);
  });

  it("explains the frame, the language and the format", () => {
    expect(projectBrief({ ...project, aspectRatio: "9:16" })).toContain("vertical frame");
    expect(projectBrief({ ...project, language: "Hindi" })).toContain("write action and dialogue in Hindi");
    expect(projectBrief({ ...project, language: "English" })).not.toContain("write action");
    expect(projectBrief({ ...project, typeName: "Music video" })).toContain("Music videos are mostly visual");
    expect(projectBrief({ ...project, typeName: "Commercial" })).toContain("Commercials are short");
  });

  it("matches project types by whole word", () => {
    expect(projectBrief({ ...project, typeName: "Radio play" })).not.toContain("Format notes");
    expect(projectBrief({ ...project, typeName: "TV ad" })).toContain("Commercials are short");
    expect(projectBrief({ ...project, typeName: "YouTube Shorts" })).toContain("Online video");
  });
});

describe("filledDetails", () => {
  it("lists what the AI will take into account", () => {
    const details: Parameters<typeof filledDetails>[0] = {
      typeName: null,
      logline: null,
      synopsis: null,
      genre: null,
      tone: null,
      targetRuntimeMinutes: null,
      aspectRatio: null,
      language: null,
    };
    expect(filledDetails(details)).toEqual([]);
    expect(filledDetails({ ...details, logline: "Two strangers.", tone: "", targetRuntimeMinutes: 10 })).toEqual([
      "Logline",
      "Runtime",
    ]);
  });
});

describe("scriptContext", () => {
  it("numbers scenes, marks the cursor and ranks the cast", () => {
    const context = scriptContext({ blocks: script, cursor: { block: 3, offset: 6 }, selection: null });
    expect(context.fountain).toContain("INT. DINER - NIGHT #1#");
    expect(context.fountain).toContain("EXT. PARKING LOT - NIGHT #2#");
    expect(context.fountain).toContain(`Coffee${CURSOR_MARKER}?`);
    expect(context.scenes.map((scene) => [scene.number, scene.id, scene.characters])).toEqual([
      [1, "s1", ["MARY", "TOM"]],
      [2, "s2", []],
    ]);
    expect(context.cast).toEqual(["MARY", "TOM"]);
    expect(context.cursor).toMatchObject({ element: "dialogue", emptyLine: false, atEnd: false });
    expect(context.cursor?.scene?.number).toBe(1);
    expect(describeCursor(context.cursor!)).toBe(
      `The ${CURSOR_MARKER} marker is in scene 1 (INT. DINER - NIGHT), on the end of a dialogue line.`,
    );
  });

  it("puts a cursor on an empty line on a line of its own", () => {
    const context = scriptContext({
      blocks: [...script, block("action", "")],
      cursor: { block: script.length, offset: 0 },
      selection: null,
    });
    expect(context.fountain.endsWith(CURSOR_MARKER)).toBe(true);
    expect(context.fountain).not.toContain(`!${CURSOR_MARKER}`);
    expect(context.cursor).toMatchObject({ element: "action", emptyLine: true, atEnd: true });
  });

  it("marks the lines being rewritten", () => {
    const context = scriptContext({ blocks: script, cursor: null, selection: { from: 2, to: 3 } });
    expect(context.fountain).toContain(`${REWRITE_START}MARY`);
    expect(context.fountain).toContain(`Coffee?${REWRITE_END}`);
    expect(context.selection).toBe("MARY\nCoffee?");
    expect(context.cursor).toBeNull();
  });

  it("cuts the scenes furthest from the cursor down to their headings when it's too long", () => {
    const long = "A long line of action that goes on and on. ".repeat(20);
    const blocks: ScreenplayBlock[] = [];
    for (let i = 1; i <= 6; i++) blocks.push(block("sceneHeading", `INT. ROOM ${i} - DAY`, `s${i}`), block("action", long));
    const context = scriptContext({ blocks, cursor: { block: 1, offset: 0 }, selection: null }, { maxChars: 3000 });

    expect(context.omittedScenes).toBeGreaterThan(0);
    expect(context.fountain.length).toBeLessThanOrEqual(3000);
    expect(context.fountain).toContain(`${CURSOR_MARKER}${long.trim()}`);
    expect(context.fountain).toContain("INT. ROOM 6 - DAY #6#\n\n[[1 line not shown]]");
    expect(context.scenes).toHaveLength(6);
  });

  it("knows when the script is empty", () => {
    expect(scriptContext({ blocks: [block("action", "  ")], cursor: null, selection: null }).isEmpty).toBe(true);
    expect(scriptContext({ blocks: script, cursor: null, selection: null }).isEmpty).toBe(false);
  });
});

describe("cleanElements", () => {
  it("skips lines that haven't fully arrived", () => {
    expect(cleanElements([{ type: "act" }, { type: "action" }, { type: "action", text: "Rain." }])).toEqual([
      { type: "action", text: "Rain." },
    ]);
    expect(cleanElements(undefined)).toEqual([]);
  });

  it("drops stray Fountain symbols and splits paragraphs", () => {
    expect(
      cleanElements(
        [
          { type: "sceneHeading", text: ".INT. DINER - NIGHT" },
          { type: "character", text: "@MARY:" },
          { type: "parenthetical", text: "quietly" },
          { type: "action", text: "Rain.\n\nThunder\nrolls." },
          { type: "transition", text: "> CUT TO:" },
          { type: "dialogue", text: "   " },
        ],
        { final: true },
      ),
    ).toEqual([
      { type: "sceneHeading", text: "INT. DINER - NIGHT" },
      { type: "character", text: "MARY" },
      { type: "parenthetical", text: "(quietly)" },
      { type: "action", text: "Rain." },
      { type: "action", text: "Thunder rolls." },
      { type: "transition", text: "CUT TO:" },
    ]);
  });

  it("leaves a parenthetical open and drops an empty last line while streaming", () => {
    expect(cleanElements([{ type: "parenthetical", text: "quiet" }, { type: "dialogue", text: "" }])).toEqual([
      { type: "parenthetical", text: "(quiet" },
    ]);
  });
});
