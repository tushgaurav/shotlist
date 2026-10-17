import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { describe, expect, it } from "vitest";

import { screenplayInputPlugin } from "./input";
import { blocks, cursorBlock, makeDoc, makeState } from "./test-utils";

const plugin = screenplayInputPlugin();

/** Types `text` at the cursor, the way ProseMirror's handleTextInput would see it. */
function type(state: EditorState, text: string) {
  let next = state;
  const view = {
    get state() {
      return next;
    },
    dispatch(tr: Transaction) {
      next = next.applyTransaction(tr).state;
    },
  } as unknown as EditorView;

  for (const char of text) {
    const { from, to } = next.selection;
    const handled = plugin.props.handleTextInput!.call(plugin, view, from, to, char, () => next.tr.insertText(char, from, to));
    if (!handled) view.dispatch(next.tr.insertText(char, from, to));
  }
  return next;
}

describe("typing shortcuts", () => {
  it("turns an action line into a scene heading once it starts with INT.", () => {
    const next = type(makeState(makeDoc(["action", ""])), "int. kitchen");
    expect(blocks(next)).toEqual([["sceneHeading", "int. kitchen", "new1"]]);
    expect(cursorBlock(next).offset).toBe(12);
  });

  it("starts a parenthetical when ( is typed on an empty line inside dialogue", () => {
    const next = type(makeState(makeDoc(["character", "MARY"], ["dialogue", ""])), "(beat");
    expect(blocks(next)).toEqual(["character:MARY", "parenthetical:(beat"]);
  });

  it("leaves ( alone outside dialogue", () => {
    const next = type(makeState(makeDoc(["action", "Hi."], ["action", ""])), "(");
    expect(blocks(next)).toEqual(["action:Hi.", "action:("]);
  });

  it("stores text as typed", () => {
    const next = type(makeState(makeDoc(["character", ""])), "mary");
    expect(blocks(next)).toEqual(["character:mary"]);
  });
});
