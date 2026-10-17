import { describe, expect, it } from "vitest";

import type { ScreenplayBlock } from "./blocks";
import { extractScenes, parseHeading, sceneCharacters, startsLikeSceneHeading } from "./scenes";

describe("parseHeading", () => {
  it.each([
    ["INT. KITCHEN - NIGHT", { intExt: "INT", location: "KITCHEN", timeOfDay: "NIGHT" }],
    ["ext. roof – day", { intExt: "EXT", location: "ROOF", timeOfDay: "DAY" }],
    ["INT./EXT. CAR - MOVING - DAY", { intExt: "INT/EXT", location: "CAR - MOVING", timeOfDay: "DAY" }],
    ["I/E. BUS", { intExt: "INT/EXT", location: "BUS", timeOfDay: null }],
    ["EST. CITY SKYLINE — DUSK", { intExt: "EXT", location: "CITY SKYLINE", timeOfDay: "DUSK" }],
    ["INT. MARY-JANE'S FLAT - LATER", { intExt: "INT", location: "MARY-JANE'S FLAT", timeOfDay: "LATER" }],
    ["MONTAGE", { intExt: null, location: "MONTAGE", timeOfDay: null }],
    ["INT.", { intExt: "INT", location: null, timeOfDay: null }],
    ["INTERIOR DESIGN STUDIO", { intExt: null, location: "INTERIOR DESIGN STUDIO", timeOfDay: null }],
  ])("%s", (heading, expected) => {
    expect(parseHeading(heading)).toEqual(expected);
  });
});

describe("startsLikeSceneHeading", () => {
  it("needs the prefix and its period", () => {
    expect(startsLikeSceneHeading("INT.")).toBe(true);
    expect(startsLikeSceneHeading("ext. ")).toBe(true);
    expect(startsLikeSceneHeading("I/E.")).toBe(true);
    expect(startsLikeSceneHeading("INT./EXT.")).toBe(true);
    expect(startsLikeSceneHeading("INT")).toBe(false);
    expect(startsLikeSceneHeading("Interior.")).toBe(false);
  });
});

const block = (type: ScreenplayBlock["type"], text: string, sceneId: string | null = null) => ({
  type,
  text,
  sceneId,
});

describe("extractScenes", () => {
  const blocks = [
    block("action", "FADE IN:"),
    block("sceneHeading", "INT. KITCHEN - NIGHT", "a"),
    block("action", "Mary cooks."),
    block("sceneHeading", "EXT. ROOF - DAY", "b"),
    block("character", "MARY"),
    block("dialogue", "Hi."),
  ];

  it("numbers scenes in order and ignores text before the first heading", () => {
    const scenes = extractScenes(blocks);
    expect(scenes.map(({ id, position, number, heading, location }) => ({ id, position, number, heading, location }))).toEqual([
      { id: "a", position: 0, number: "1", heading: "INT. KITCHEN - NIGHT", location: "KITCHEN" },
      { id: "b", position: 1, number: "2", heading: "EXT. ROOF - DAY", location: "ROOF" },
    ]);
  });

  it("changes a scene's hash only when that scene's content changes", () => {
    const before = extractScenes(blocks);
    const edited = blocks.map((b) => (b.text === "Hi." ? { ...b, text: "Hello." } : b));
    const after = extractScenes(edited);
    expect(after[0].contentHash).toBe(before[0].contentHash);
    expect(after[1].contentHash).not.toBe(before[1].contentHash);
  });
});

describe("sceneCharacters", () => {
  it("lists each scene's speakers once, without extensions", () => {
    const characters = sceneCharacters([
      block("character", "NARRATOR"),
      block("sceneHeading", "INT. KITCHEN - NIGHT", "a"),
      block("character", "MARY"),
      block("dialogue", "Hi."),
      block("character", "john (V.O.)"),
      block("character", "MARY (CONT'D)"),
      block("sceneHeading", "EXT. ROOF - DAY", "b"),
      block("action", "Empty."),
    ]);
    expect([...characters]).toEqual([
      ["a", ["MARY", "JOHN"]],
      ["b", []],
    ]);
  });
});
