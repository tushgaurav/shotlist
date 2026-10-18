import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { history, redo, undo } from "@tiptap/pm/history";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import type { ScreenplayElement } from "../../ai/schema";
import { insertionRange, rewriteRange, sceneEndRange, wholeDocRange } from "./ai-ranges";
import {
  acceptAiSuggestion,
  aiSuggestionPlugin,
  beginAiSuggestion,
  committedDoc,
  discardAiSuggestion,
  finishAiSuggestion,
  getAiSuggestion,
  restartAiSuggestion,
  updateAiSuggestion,
} from "./ai-suggestion";
import { sceneIdsPlugin } from "./scene-ids";
import { blocks, cursorBlock, idFactory, makeDoc, run, withCursor } from "./test-utils";

function editorState(doc: ProseMirrorNode, index = doc.childCount - 1, offset?: number) {
  const state = EditorState.create({ doc, plugins: [history(), sceneIdsPlugin(idFactory()), aiSuggestionPlugin()] });
  return withCursor(state, index, offset);
}

function fakeView(state: EditorState) {
  const view = {
    state,
    dispatch(tr: Transaction) {
      view.state = view.state.apply(tr);
    },
  };
  return view;
}

function apply(state: EditorState, tr: Transaction | null) {
  return tr ? state.apply(tr) : state;
}

function stream(state: EditorState, range: { from: number; to: number }, ...updates: ScreenplayElement[][]) {
  let next = state.apply(beginAiSuggestion(state, range.from, range.to));
  for (const elements of updates) next = apply(next, updateAiSuggestion(next, elements));
  return next;
}

const scene: ScreenplayElement[] = [
  { type: "action", text: "Mary turns." },
  { type: "character", text: "MARY" },
  { type: "dialogue", text: "Who's there?" },
];

describe("ai suggestion", () => {
  it("shows streamed lines after a non-empty line without committing them", () => {
    const state = editorState(makeDoc(["sceneHeading", "INT. HALL - NIGHT", "a"], ["action", "The door creaks."]));
    const next = stream(state, insertionRange(state), scene.slice(0, 1), scene);

    expect(blocks(next)).toEqual([
      ["sceneHeading", "INT. HALL - NIGHT", "a"],
      "action:The door creaks.",
      "action:Mary turns.",
      "character:MARY",
      "dialogue:Who's there?",
    ]);
    expect(committedDoc(next).eq(state.doc)).toBe(true);
  });

  it("leaves the document alone until the first lines arrive", () => {
    const state = editorState(makeDoc(["action", "The door creaks."]));
    const next = stream(state, insertionRange(state), []);
    expect(next.doc.eq(state.doc)).toBe(true);
    expect(getAiSuggestion(next)?.replaced).toBe(false);
  });

  it("only replaces the blocks that changed", () => {
    const state = editorState(makeDoc(["action", "The door creaks."]));
    const first = stream(state, insertionRange(state), [scene[0], { type: "character", text: "MA" }]);
    const kept = first.doc.child(1);
    const second = apply(first, updateAiSuggestion(first, [scene[0], scene[1]]));
    expect(second.doc.child(1)).toBe(kept);
    expect(blocks(second)).toEqual(["action:The door creaks.", "action:Mary turns.", "character:MARY"]);
  });

  it("replaces an empty cursor line and puts it back on discard", () => {
    const state = editorState(makeDoc(["action", "The door creaks."], ["action", ""]));
    const streamed = stream(state, insertionRange(state), scene);
    expect(blocks(streamed)).toEqual(["action:The door creaks.", ...scene.map((e) => `${e.type}:${e.text}`)]);

    const discarded = run(streamed, discardAiSuggestion).state;
    expect(blocks(discarded)).toEqual(["action:The door creaks.", "action:"]);
    expect(cursorBlock(discarded)).toEqual({ type: "action", index: 1, offset: 0 });
    expect(getAiSuggestion(discarded)).toBeNull();
  });

  it("accepts as one undo step", () => {
    const state = editorState(makeDoc(["action", "The door creaks."]));
    const view = fakeView(apply(stream(state, insertionRange(state), scene), null));
    view.dispatch(finishAiSuggestion(view.state)!);

    expect(acceptAiSuggestion(view)).toBe(true);
    expect(getAiSuggestion(view.state)).toBeNull();
    expect(blocks(view.state)).toHaveLength(4);
    expect(cursorBlock(view.state)).toEqual({ type: "dialogue", index: 3, offset: "Who's there?".length });

    const undone = run(view.state, undo).state;
    expect(undone.doc.eq(state.doc)).toBe(true);
    expect(blocks(run(undone, redo).state)).toEqual(blocks(view.state));
  });

  it("keeps the scene ID when a scene is rewritten", () => {
    const doc = makeDoc(
      ["sceneHeading", "INT. HALL - NIGHT", "a"],
      ["action", "The door creaks."],
      ["sceneHeading", "EXT. YARD - DAY", "b"],
    );
    const state = editorState(doc, 1);
    const selected = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, state.doc.child(0).nodeSize + 3)));
    const range = rewriteRange(selected)!;
    const next = stream(selected, range, [
      { type: "sceneHeading", text: "INT. HALLWAY - NIGHT" },
      { type: "action", text: "Silence." },
      { type: "sceneHeading", text: "INT. CELLAR - NIGHT" },
    ]);

    const ids = blocks(next).flatMap((block) => (Array.isArray(block) ? [block[2]] : []));
    expect(ids[0]).toBe("a");
    expect(ids[2]).toBe("b");
    expect(new Set(ids).size).toBe(3);
  });

  it("blocks edits inside the range while streaming but not elsewhere", () => {
    const state = editorState(makeDoc(["action", "The door creaks."], ["action", "End."]), 0);
    const streaming = stream(state, insertionRange(state), scene);
    const suggestion = getAiSuggestion(streaming)!;

    const inside = streaming.tr.insertText("x", suggestion.from + 2);
    expect(streaming.applyTransaction(inside).state).toBe(streaming);

    const outside = streaming.apply(streaming.tr.insertText("Oh. ", 1));
    expect(getAiSuggestion(outside)!.from).toBe(suggestion.from + 4);
    expect(blocks(outside)).toContain("action:Mary turns.");
    expect(committedDoc(outside).child(0).textContent).toBe("Oh. The door creaks.");
    expect(committedDoc(outside).childCount).toBe(2);
  });

  it("restores a rewritten selection on discard", () => {
    const doc = makeDoc(["action", "One."], ["action", "Two."], ["action", "Three."]);
    const state = editorState(doc);
    const from = doc.child(0).nodeSize + 2;
    const to = from + 2;
    const selected = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
    const streamed = stream(selected, rewriteRange(selected)!, [{ type: "action", text: "Deux." }]);

    const discarded = run(streamed, discardAiSuggestion).state;
    expect(discarded.doc.eq(doc)).toBe(true);
    expect([discarded.selection.from, discarded.selection.to]).toEqual([from, to]);
  });

  it("writes a whole draft over an empty script, reusing its scene ID", () => {
    const doc = makeDoc(["sceneHeading", "", "first"]);
    const state = editorState(doc);
    const next = stream(state, wholeDocRange(doc), [
      { type: "sceneHeading", text: "INT. HALL - NIGHT" },
      { type: "action", text: "Dark." },
    ]);
    expect(blocks(next)).toEqual([["sceneHeading", "INT. HALL - NIGHT", "first"], "action:Dark."]);

    const view = fakeView(next);
    acceptAiSuggestion(view);
    expect(run(view.state, undo).state.doc.eq(doc)).toBe(true);
  });

  it("revises a suggestion in place and still discards to the original", () => {
    const state = editorState(makeDoc(["action", "The door creaks."]));
    let next = stream(state, insertionRange(state), scene);
    next = apply(next, finishAiSuggestion(next));
    next = apply(next, restartAiSuggestion(next));
    expect(getAiSuggestion(next)?.status).toBe("streaming");
    next = apply(next, updateAiSuggestion(next, [{ type: "action", text: "Mary waits." }]));
    expect(blocks(next)).toEqual(["action:The door creaks.", "action:Mary waits."]);
    expect(run(next, discardAiSuggestion).state.doc.eq(state.doc)).toBe(true);
  });

  it("inserts a following scene at the end of the current one", () => {
    const doc = makeDoc(
      ["sceneHeading", "INT. HALL - NIGHT", "a"],
      ["action", "The door creaks."],
      ["sceneHeading", "EXT. YARD - DAY", "b"],
    );
    const state = editorState(doc, 1);
    expect(sceneEndRange(state)).toEqual({ from: doc.child(0).nodeSize + doc.child(1).nodeSize, to: doc.child(0).nodeSize + doc.child(1).nodeSize });
  });
});
