import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScriptSnapshot } from "../../ai/schema";
import { autocompletePlugin } from "./autocomplete";
import {
  acceptGhostText,
  canSuggest,
  dismissGhostText,
  getGhostText,
  ghostContext,
  ghostTextKey,
  ghostTextPlugin,
  tidyGhost,
  type GhostTextSource,
} from "./ghost-text";
import { blocks, makeDoc, run, withCursor } from "./test-utils";

const DELAY = 700;
const plugin = ghostTextPlugin({ delay: DELAY });

function editorState(doc: ProseMirrorNode, index = doc.childCount - 1, offset?: number) {
  return withCursor(EditorState.create({ doc, plugins: [autocompletePlugin(), plugin] }), index, offset);
}

function withGhost(state: EditorState, text: string, source: GhostTextSource = async () => null) {
  return state.apply(state.tr.setMeta(ghostTextKey, { source, ghost: { pos: state.selection.from, text } }));
}

const line = "Mary pulls the curtain back";

describe("ghost text: where it's offered", () => {
  it("offers at the end of a long enough action or dialogue line", () => {
    expect(canSuggest(editorState(makeDoc(["action", line])))).toBe(true);
    expect(canSuggest(editorState(makeDoc(["character", "MARY"], ["dialogue", "I told you already, Tom"])))).toBe(true);
  });

  it("stays out of the way elsewhere", () => {
    expect(canSuggest(editorState(makeDoc(["action", line]), 0, 4))).toBe(false);
    expect(canSuggest(editorState(makeDoc(["action", "She runs."])))).toBe(false);
    expect(canSuggest(editorState(makeDoc(["character", "MARY ELIZABETH JONES"])))).toBe(false);
    expect(canSuggest(editorState(makeDoc(["sceneHeading", "INT. KITCHEN - NIGHT"])))).toBe(false);
  });

  it("sends the current scene and the one before it, up to the cursor", () => {
    const doc = makeDoc(
      ["sceneHeading", "INT. HALL - NIGHT", "a"],
      ["action", "Dust everywhere."],
      ["sceneHeading", "EXT. YARD - NIGHT", "b"],
      ["action", "Rain."],
      ["sceneHeading", "INT. KITCHEN - NIGHT", "c"],
      ["action", line],
      ["action", "Later."],
    );
    const snapshot = ghostContext(editorState(doc, 5));
    expect(snapshot.blocks.map((block) => block.text)).toEqual([
      "EXT. YARD - NIGHT",
      "Rain.",
      "INT. KITCHEN - NIGHT",
      line,
    ]);
    expect(snapshot.cursor).toEqual({ block: 3, offset: line.length });
  });
});

describe("ghost text: tidying the reply", () => {
  it("keeps one line and drops wrapping quotes", () => {
    expect(tidyGhost(" and peers out.\nMARY\nHello?", line)).toBe(" and peers out.");
    expect(tidyGhost(' "and peers out."', line)).toBe(" and peers out.");
  });

  it("fixes the space between the line and the suggestion", () => {
    expect(tidyGhost(" and peers out.", `${line} `)).toBe("and peers out.");
    expect(tidyGhost("She freezes.", "Mary pulls the curtain back.")).toBe(" She freezes.");
    expect(tidyGhost("s to the window.", "Mary walk")).toBe("s to the window.");
  });

  it("returns null for nothing and shortens long replies at a word", () => {
    expect(tidyGhost("  \n ", line)).toBeNull();
    const long = tidyGhost(` ${"word ".repeat(60)}`, line)!;
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.endsWith("word")).toBe(true);
  });
});

describe("ghost text: showing and accepting", () => {
  it("shows at the cursor and hides when the cursor moves", () => {
    const state = withGhost(editorState(makeDoc(["action", line])), " and peers out.");
    expect(getGhostText(state)).toBe(" and peers out.");
    expect(getGhostText(withCursor(state, 0, 3))).toBeNull();
  });

  it("keeps the rest showing while you type the same letters", () => {
    let state = withGhost(editorState(makeDoc(["action", line])), " and peers out.");
    state = state.apply(state.tr.insertText(" an"));
    expect(getGhostText(state)).toBe("d peers out.");
    state = state.apply(state.tr.insertText("x"));
    expect(getGhostText(state)).toBeNull();
  });

  it("Tab inserts the suggestion", () => {
    const state = withGhost(editorState(makeDoc(["action", line])), " and peers out.");
    const accepted = run(state, acceptGhostText);
    expect(accepted.handled).toBe(true);
    expect(blocks(accepted.state)).toEqual([`action:${line} and peers out.`]);
    expect(getGhostText(accepted.state)).toBeNull();
    expect(run(accepted.state, acceptGhostText).handled).toBe(false);
  });

  it("Escape dismisses it", () => {
    const state = withGhost(editorState(makeDoc(["action", line])), " and peers out.");
    const dismissed = run(state, dismissGhostText);
    expect(dismissed.handled).toBe(true);
    expect(getGhostText(dismissed.state)).toBeNull();
    expect(blocks(dismissed.state)).toEqual([`action:${line}`]);
  });

  it("turning suggestions off clears the one showing", () => {
    const state = withGhost(editorState(makeDoc(["action", line])), " and peers out.");
    const off = state.apply(state.tr.setMeta(ghostTextKey, { source: null }));
    expect(getGhostText(off)).toBeNull();
  });
});

describe("ghost text: asking for suggestions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function harness(source: GhostTextSource) {
    const start = editorState(makeDoc(["action", "Mary pulls the curtain"]));
    const view = {
      state: start.apply(start.tr.setMeta(ghostTextKey, { source })),
      editable: true,
      isDestroyed: false,
      hasFocus: () => true,
      dispatch(tr: Transaction) {
        const prev = view.state;
        view.state = view.state.apply(tr);
        pluginView.update?.(view as unknown as EditorView, prev);
      },
    };
    const pluginView = plugin.spec.view!(view as unknown as EditorView);
    return { view, type: (text: string) => view.dispatch(view.state.tr.insertText(text)) };
  }

  it("asks once the writer pauses, with the script up to the cursor", async () => {
    const source = vi.fn<GhostTextSource>(async () => " and peers out.");
    const { view, type } = harness(source);
    type(" b");
    type("ack");
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(source).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(source).toHaveBeenCalledOnce();
    const [snapshot] = source.mock.calls[0] as [ScriptSnapshot, AbortSignal];
    expect(snapshot.blocks.at(-1)?.text).toBe(line);
    expect(getGhostText(view.state)).toBe(" and peers out.");
  });

  it("drops a reply that arrives after more typing", async () => {
    let resolve: (text: string) => void = () => {};
    let signal: AbortSignal | undefined;
    const { view, type } = harness((_script, abort) => {
      signal = abort;
      return new Promise((done) => (resolve = done));
    });
    type(" back");
    await vi.advanceTimersByTimeAsync(DELAY);
    type(" slowly");
    expect(signal?.aborted).toBe(true);
    resolve(" and peers out.");
    await vi.advanceTimersByTimeAsync(0);
    expect(getGhostText(view.state)).toBeNull();
  });

  it("doesn't ask when the cursor only moves", async () => {
    const source = vi.fn<GhostTextSource>(async () => " and peers out.");
    const { view } = harness(source);
    view.dispatch(view.state.tr.setSelection(withCursor(view.state, 0, 3).selection));
    view.dispatch(view.state.tr.setSelection(withCursor(view.state, 0).selection));
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(source).not.toHaveBeenCalled();
  });
});
