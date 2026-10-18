import { describe, expect, it } from "vitest";

import { countWords, prompterScript } from "./prompter";
import type { BlockJSON, ScreenplayDocJSON } from "./types";

const block = (type: string, text: string, sceneId?: string): BlockJSON => ({
  type,
  ...(sceneId && { attrs: { sceneId } }),
  ...(text && { content: [{ type: "text", text }] }),
});

const doc = (...content: BlockJSON[]): ScreenplayDocJSON => ({ type: "doc", content });

const script = doc(
  block("action", "FADE IN:"),
  block("sceneHeading", "int. studio - day", "a"),
  block("action", "Sam faces the camera."),
  block("character", "Sam"),
  block("parenthetical", "(smiling)"),
  block("dialogue", "Welcome back to the channel."),
  block("character", "Jo (O.S.)"),
  block("dialogue", "Tell them about the giveaway!"),
  block("character", "SAM"),
  block("dialogue", "Right — the giveaway."),
  block("transition", "cut to:"),
  block("sceneHeading", "EXT. PARK - DAY", "b"),
  block("dialogue", "Nobody said this."),
);

const summary = (doc: ScreenplayDocJSON, character?: string) =>
  prompterScript(doc, character).lines.map((line) => {
    switch (line.kind) {
      case "scene":
        return `scene ${line.number} ${line.heading}`;
      case "speaker":
        return `speaker ${line.name}`;
      case "cue":
        return `cue ${line.runs.map((run) => run.text).join("")}`;
      case "read":
        return `read ${line.runs.map((run) => run.text).join("")}`;
    }
  });

describe("prompterScript", () => {
  it("reads dialogue and turns everything else into cues", () => {
    expect(summary(script)).toEqual([
      "cue FADE IN:",
      "scene 1 INT. STUDIO - DAY",
      "cue Sam faces the camera.",
      "speaker SAM",
      "cue (smiling)",
      "read Welcome back to the channel.",
      "speaker JO (O.S.)",
      "read Tell them about the giveaway!",
      "speaker SAM",
      "read Right — the giveaway.",
      "cue CUT TO:",
      "scene 2 EXT. PARK - DAY",
      "read Nobody said this.",
    ]);
  });

  it("reads only the chosen character and keeps the others as cues under their names", () => {
    expect(summary(script, "SAM")).toEqual([
      "cue FADE IN:",
      "scene 1 INT. STUDIO - DAY",
      "cue Sam faces the camera.",
      "cue (smiling)",
      "read Welcome back to the channel.",
      "speaker JO (O.S.)",
      "cue Tell them about the giveaway!",
      "read Right — the giveaway.",
      "cue CUT TO:",
      "scene 2 EXT. PARK - DAY",
      // No character cue since the heading, so it isn't Sam's.
      "cue Nobody said this.",
    ]);
  });

  it("keeps each line's document index and scene", () => {
    const { lines } = prompterScript(script, "SAM");
    expect(lines[0]).toMatchObject({ block: 0, sceneId: null });
    expect(lines.find((line) => line.kind === "read")).toMatchObject({ block: 5, sceneId: "a" });
    expect(lines.at(-1)).toMatchObject({ block: 12, sceneId: "b" });
  });

  it("marks lines that continue the same speech", () => {
    const continuing = (character?: string) =>
      prompterScript(script, character)
        .lines.filter((line) => line.continues)
        .map((line) => line.block);
    expect(continuing()).toEqual([4, 5, 7, 9]);
    // Sam's second line follows Jo's, so it starts a new speech even without Sam's name above it.
    expect(continuing("SAM")).toEqual([5, 7]);
  });

  it("lists scenes and characters in order", () => {
    const result = prompterScript(script);
    expect(result.scenes).toEqual([
      { id: "a", number: 1, heading: "INT. STUDIO - DAY" },
      { id: "b", number: 2, heading: "EXT. PARK - DAY" },
    ]);
    expect(result.characters).toEqual(["SAM", "JO"]);
  });

  it("counts only the words that are read", () => {
    expect(prompterScript(script).words).toBe(5 + 5 + 3 + 3);
    expect(prompterScript(script, "SAM").words).toBe(5 + 3);
  });

  it("skips empty elements but keeps empty scene headings", () => {
    const empty = doc(block("sceneHeading", "", "a"), block("action", ""), block("character", ""), block("dialogue", " "));
    expect(summary(empty)).toEqual(["scene 1 "]);
  });

  it("keeps bold, italic and underline", () => {
    const marked = doc({
      type: "dialogue",
      content: [
        { type: "text", text: "This is " },
        { type: "text", text: "huge", marks: [{ type: "bold" }] },
        { type: "text", text: "." },
      ],
    });
    const [line] = prompterScript(marked).lines;
    expect(line.kind === "read" && line.runs.map((run) => [run.text, run.bold])).toEqual([
      ["This is ", false],
      ["huge", true],
      [".", false],
    ]);
  });
});

describe("countWords", () => {
  it("ignores dashes and ellipses on their own", () => {
    expect(countWords("Wait — what ... no")).toBe(3);
    expect(countWords("  ")).toBe(0);
    expect(countWords("It's 3 o'clock.")).toBe(3);
  });
});
