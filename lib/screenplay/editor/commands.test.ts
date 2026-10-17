import { describe, expect, it } from "vitest";

import { getActiveSuggestion } from "./autocomplete";
import {
  acceptSuggestion,
  cycleElement,
  dismissSuggestion,
  enter,
  isTransitionText,
  moveScene,
  setElementType,
} from "./commands";
import { blocks, cursorBlock, makeDoc, makeState, run } from "./test-utils";

describe("enter", () => {
  it.each([
    ["sceneHeading", "INT. KITCHEN - DAY", "action"],
    ["action", "Mary cooks.", "action"],
    ["character", "MARY", "dialogue"],
    ["parenthetical", "(beat)", "dialogue"],
    ["dialogue", "Hello.", "character"],
    ["transition", "CUT TO:", "sceneHeading"],
  ])("at the end of %s starts %s", (type, text, expected) => {
    const state = makeState(makeDoc([type, text, type === "sceneHeading" ? "a" : null]));
    const result = run(state, enter);
    expect(result.handled).toBe(true);
    expect(cursorBlock(result.state)).toEqual({ type: expected, index: 1, offset: 0 });
  });

  it("gives a heading created by Enter its own scene ID", () => {
    const state = makeState(makeDoc(["transition", "CUT TO:"]));
    const next = run(state, enter).state;
    expect(blocks(next)).toEqual(["transition:CUT TO:", ["sceneHeading", "", "new1"]]);
  });

  it("closes an open parenthetical", () => {
    const next = run(makeState(makeDoc(["parenthetical", "(beat"])), enter).state;
    expect(blocks(next)).toEqual(["parenthetical:(beat)", "dialogue:"]);
  });

  it("turns an all-caps action ending in TO: into a transition", () => {
    const next = run(makeState(makeDoc(["action", "SMASH CUT TO:"])), enter).state;
    expect(blocks(next)).toEqual(["transition:SMASH CUT TO:", ["sceneHeading", "", "new1"]]);
  });

  it("turns an empty line into action", () => {
    const next = run(makeState(makeDoc(["dialogue", "Hi."], ["character", ""])), enter).state;
    expect(blocks(next)).toEqual(["dialogue:Hi.", "action:"]);
    expect(cursorBlock(next).index).toBe(1);
  });

  it("inserts action above when pressed at the start of a line, keeping the scene ID", () => {
    const next = run(makeState(makeDoc(["sceneHeading", "INT. A", "a"]), 0, 0), enter).state;
    expect(blocks(next)).toEqual(["action:", ["sceneHeading", "INT. A", "a"]]);
    expect(cursorBlock(next)).toEqual({ type: "sceneHeading", index: 1, offset: 0 });
  });

  it("splitting a heading mid-line keeps the ID on the first half", () => {
    const next = run(makeState(makeDoc(["sceneHeading", "INT. AB", "a"]), 0, 6), enter).state;
    expect(blocks(next)).toEqual([
      ["sceneHeading", "INT. A", "a"],
      ["sceneHeading", "B", "new1"],
    ]);
  });
});

describe("element type commands", () => {
  it("Tab cycles forwards and Shift+Tab backwards", () => {
    const state = makeState(makeDoc(["action", "Hi"]));
    expect(cursorBlock(run(state, cycleElement(1)).state).type).toBe("character");
    const back = run(state, cycleElement(-1)).state;
    expect(blocks(back)).toEqual([["sceneHeading", "Hi", "new1"]]);
  });

  it("sets an element type directly", () => {
    const next = run(makeState(makeDoc(["action", "MARY"])), setElementType("character")).state;
    expect(blocks(next)).toEqual(["character:MARY"]);
  });

  it("recognises transitions", () => {
    expect(isTransitionText("CUT TO:")).toBe(true);
    expect(isTransitionText("MATCH CUT TO:")).toBe(true);
    expect(isTransitionText("Cut to:")).toBe(false);
    expect(isTransitionText("TO:")).toBe(false);
  });
});

describe("autocomplete", () => {
  it("completes character names, most used first", () => {
    const doc = makeDoc(
      ["character", "MARCUS"],
      ["dialogue", "Hey."],
      ["character", "MARY (V.O.)"],
      ["dialogue", "Hi."],
      ["character", "MARY"],
      ["dialogue", "Bye."],
      ["character", "MA"],
    );
    const state = makeState(doc);
    expect(getActiveSuggestion(state)).toBe("RY");

    const next = run(state, enter).state;
    expect(blocks(next).slice(-2)).toEqual(["character:MARY", "dialogue:"]);
  });

  it("completes heading prefixes, locations and times of day", () => {
    const heading = (text: string) =>
      makeState(makeDoc(["sceneHeading", "INT. KITCHEN - NIGHT", "a"], ["action", "x"], ["sceneHeading", text, "b"]));

    expect(getActiveSuggestion(heading("E"))).toBe("XT. ");
    expect(getActiveSuggestion(heading("EXT. KIT"))).toBe("CHEN");
    expect(getActiveSuggestion(heading("EXT. GARDEN - N"))).toBe("IGHT");
    expect(getActiveSuggestion(heading("EXT. GARDEN - CON"))).toBe("TINUOUS");
    expect(getActiveSuggestion(heading("EXT. GARDEN"))).toBeNull();
  });

  it("follows the case already typed", () => {
    const state = makeState(makeDoc(["character", "MARY"], ["dialogue", "x"], ["character", "ma"]));
    expect(getActiveSuggestion(state)).toBe("ry");
    expect(blocks(run(state, acceptSuggestion).state).at(-1)).toBe("character:mary");
  });

  it("only suggests at the end of the line", () => {
    const state = makeState(makeDoc(["character", "MARY"], ["dialogue", "x"], ["character", "MA"]), 2, 1);
    expect(getActiveSuggestion(state)).toBeNull();
  });

  it("Tab accepts and Escape dismisses until the next edit", () => {
    const state = makeState(makeDoc(["character", "MARY"], ["dialogue", "x"], ["character", "M"]));
    expect(blocks(run(state, acceptSuggestion).state).at(-1)).toBe("character:MARY");

    const dismissed = run(state, dismissSuggestion).state;
    expect(getActiveSuggestion(dismissed)).toBeNull();
    expect(run(dismissed, acceptSuggestion).handled).toBe(false);

    const typed = dismissed.apply(dismissed.tr.insertText("A"));
    expect(getActiveSuggestion(typed)).toBe("RY");
  });
});

describe("moveScene", () => {
  const doc = makeDoc(
    ["action", "FADE IN:"],
    ["sceneHeading", "INT. A", "a"],
    ["action", "In A."],
    ["sceneHeading", "INT. B", "b"],
    ["action", "In B."],
    ["sceneHeading", "INT. C", "c"],
  );

  it("moves a scene with its content and keeps its ID", () => {
    const next = run(makeState(doc), moveScene("c", "a")).state;
    expect(blocks(next)).toEqual([
      "action:FADE IN:",
      ["sceneHeading", "INT. C", "c"],
      ["sceneHeading", "INT. A", "a"],
      "action:In A.",
      ["sceneHeading", "INT. B", "b"],
      "action:In B.",
    ]);
  });

  it("moves a scene to the end", () => {
    const next = run(makeState(doc), moveScene("a", null)).state;
    expect(blocks(next).slice(1)).toEqual([
      ["sceneHeading", "INT. B", "b"],
      "action:In B.",
      ["sceneHeading", "INT. C", "c"],
      ["sceneHeading", "INT. A", "a"],
      "action:In A.",
    ]);
  });

  it("does nothing when dropped onto itself", () => {
    expect(run(makeState(doc), moveScene("a", "b")).handled).toBe(false);
    expect(run(makeState(doc), moveScene("a", "a")).handled).toBe(false);
  });
});
