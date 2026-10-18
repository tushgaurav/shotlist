import { Extension } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment, type Node as ProseMirrorNode, type Schema, type Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, Selection, TextSelection, type Command, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { nanoid } from "nanoid";

import type { ScreenplayElement } from "../../ai/schema";

/**
 * Lines the AI is writing, or has written and the writer hasn't accepted yet. They sit in the
 * document so they read like the rest of the script, but `committedDoc` leaves them out, so
 * nothing is saved or added to undo history until the writer accepts.
 */
export type AiSuggestion = {
  /** Block boundaries around the suggested lines. */
  from: number;
  to: number;
  /** What the range held before. */
  original: Slice;
  /** False until the first lines arrive; until then the range still holds `original`. */
  replaced: boolean;
  status: "streaming" | "review";
  /** The selection inside the original range, relative to `from`, to put back on discard. */
  restore: { anchor: number; head: number } | null;
};

type Meta =
  | { type: "begin"; from: number; to: number; restore: AiSuggestion["restore"] }
  | { type: "content"; to: number }
  | { type: "review" }
  | { type: "restart" }
  | { type: "clear" };

export const aiSuggestionKey = new PluginKey<AiSuggestion | null>("aiSuggestion");

export function getAiSuggestion(state: EditorState) {
  return aiSuggestionKey.getState(state) ?? null;
}

/** True for transactions that only change the suggestion, so there's nothing new to save. */
export function isAiSuggestionTransaction(tr: Transaction) {
  return tr.getMeta(aiSuggestionKey) !== undefined;
}

/** The document as the writer has it, without any suggestion that hasn't been accepted. */
export function committedDoc(state: EditorState): ProseMirrorNode {
  const suggestion = getAiSuggestion(state);
  if (!suggestion?.replaced) return state.doc;
  return state.doc.replace(suggestion.from, suggestion.to, suggestion.original);
}

function untracked(tr: Transaction, meta: Meta) {
  return tr.setMeta(aiSuggestionKey, meta).setMeta("addToHistory", false);
}

/** Starts a suggestion that will replace the blocks between `from` and `to` (equal to insert). */
export function beginAiSuggestion(state: EditorState, from: number, to: number): Transaction {
  const { selection } = state;
  const inside = selection.from >= from && selection.to <= to && from < to;
  const tr = untracked(state.tr, {
    type: "begin",
    from,
    to,
    restore: inside ? { anchor: selection.anchor - from, head: selection.head - from } : null,
  });
  // Typing is blocked inside the range while it streams, so don't leave the cursor there.
  if (inside && from > 0) tr.setSelection(TextSelection.near(tr.doc.resolve(from), -1));
  return tr;
}

/** Shows `elements` in the range, changing only the blocks that differ from what's there. */
export function updateAiSuggestion(state: EditorState, elements: ScreenplayElement[]): Transaction | null {
  const suggestion = getAiSuggestion(state);
  if (!suggestion || elements.length === 0) return null;

  const current: ProseMirrorNode[] = [];
  if (suggestion.replaced) {
    state.doc.nodesBetween(suggestion.from, suggestion.to, (node, pos) => {
      if (pos >= suggestion.from) current.push(node);
      return false;
    });
  }

  const nodes = elementsToNodes(state.schema, elements, current, headingIds(suggestion.original));
  let index = 0;
  let start = suggestion.from;
  while (index < current.length && index < nodes.length && current[index].eq(nodes[index])) {
    start += current[index].nodeSize;
    index++;
  }
  if (suggestion.replaced && index === current.length && index === nodes.length) return null;

  const added = Fragment.from(nodes.slice(index));
  const tr = state.tr.replaceWith(start, suggestion.to, added);
  return untracked(tr, { type: "content", to: start + added.size });
}

/** The stream ended: the writer can now accept or discard. */
export function finishAiSuggestion(state: EditorState): Transaction | null {
  if (!getAiSuggestion(state)) return null;
  return untracked(state.tr, { type: "review" });
}

/** Streams a revision over the suggestion. Discarding still goes back to the original. */
export function restartAiSuggestion(state: EditorState): Transaction | null {
  if (!getAiSuggestion(state)) return null;
  return untracked(state.tr, { type: "restart" });
}

export const discardAiSuggestion: Command = (state, dispatch) => {
  const suggestion = getAiSuggestion(state);
  if (!suggestion) return false;
  if (dispatch) {
    const tr = untracked(state.tr, { type: "clear" });
    if (suggestion.replaced) tr.replace(suggestion.from, suggestion.to, suggestion.original);
    if (suggestion.restore) {
      const max = tr.doc.content.size;
      const anchor = Math.min(suggestion.from + suggestion.restore.anchor, max);
      const head = Math.min(suggestion.from + suggestion.restore.head, max);
      tr.setSelection(TextSelection.between(tr.doc.resolve(anchor), tr.doc.resolve(head)));
    }
    dispatch(tr);
  }
  return true;
};

type ViewLike = Pick<EditorView, "state" | "dispatch">;

/**
 * Makes the suggestion part of the script as a single undo step. Two dispatches: the first
 * quietly puts the original back, the second makes the change for real, so undo returns to
 * exactly what the writer had.
 */
export function acceptAiSuggestion(view: ViewLike, { keepSelection = false } = {}): boolean {
  const suggestion = getAiSuggestion(view.state);
  if (!suggestion) return false;
  if (!suggestion.replaced) {
    view.dispatch(untracked(view.state.tr, { type: "clear" }));
    return true;
  }

  const content = view.state.doc.slice(suggestion.from, suggestion.to);
  const selection = view.state.selection.toJSON();
  view.dispatch(untracked(view.state.tr.replace(suggestion.from, suggestion.to, suggestion.original), { type: "clear" }));

  const tr = view.state.tr.replace(suggestion.from, suggestion.from + suggestion.original.size, content);
  tr.setSelection(
    keepSelection
      ? Selection.fromJSON(tr.doc, selection)
      : TextSelection.near(tr.doc.resolve(suggestion.from + content.size), -1),
  );
  view.dispatch(closeHistory(tr).scrollIntoView());
  return true;
}

function headingIds(slice: Slice) {
  const ids: string[] = [];
  slice.content.forEach((node) => {
    if (node.type.name === "sceneHeading" && typeof node.attrs.sceneId === "string") ids.push(node.attrs.sceneId);
  });
  return ids;
}

/**
 * Headings keep the ID they already have in the range, or take the next one from the lines
 * being replaced, so rewriting a scene keeps its shots attached.
 */
export function elementsToNodes(
  schema: Schema,
  elements: ScreenplayElement[],
  current: ProseMirrorNode[] = [],
  reuseIds: string[] = [],
) {
  let headings = 0;
  return elements.map((element, index) => {
    const text = element.text ? schema.text(element.text) : undefined;
    if (element.type !== "sceneHeading") return schema.nodes[element.type].create(null, text);
    const existing = current[index];
    const sceneId =
      existing?.type.name === "sceneHeading" && existing.attrs.sceneId
        ? existing.attrs.sceneId
        : (reuseIds[headings] ?? nanoid());
    headings++;
    return schema.nodes.sceneHeading.create({ sceneId }, text);
  });
}

function touchesRange(tr: Transaction, from: number, to: number) {
  let touches = false;
  for (const step of tr.steps) {
    const map = step.getMap();
    map.forEach((start, end) => {
      if (end >= from && start <= to) touches = true;
    });
    if (touches) return true;
    from = map.map(from, 1);
    to = map.map(to, -1);
  }
  return false;
}

function selectionTouches(state: EditorState, suggestion: AiSuggestion) {
  return state.selection.from <= suggestion.to && state.selection.to >= suggestion.from;
}

const EDITING_KEYS = new Set(["Enter", "Backspace", "Delete", "Tab"]);

function pendingWidget() {
  const element = document.createElement("div");
  element.className = "sp-ai-pending";
  element.contentEditable = "false";
  element.setAttribute("aria-hidden", "true");
  element.textContent = "Writing…";
  return element;
}

function caretWidget() {
  const element = document.createElement("span");
  element.className = "sp-ai-caret";
  element.setAttribute("aria-hidden", "true");
  return element;
}

/** Room under the suggestion for its toolbar, so the toolbar never covers the next line. */
export const AI_BAR_SPACE_CLASS = "sp-ai-bar-space";

function barSpaceWidget() {
  const element = document.createElement("div");
  element.className = AI_BAR_SPACE_CLASS;
  element.contentEditable = "false";
  element.setAttribute("aria-hidden", "true");
  return element;
}

export function aiSuggestionPlugin() {
  return new Plugin<AiSuggestion | null>({
    key: aiSuggestionKey,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(aiSuggestionKey) as Meta | undefined;
        if (meta?.type === "begin") {
          return {
            from: meta.from,
            to: meta.to,
            original: tr.doc.slice(meta.from, meta.to),
            replaced: false,
            status: "streaming",
            restore: meta.restore,
          };
        }
        if (meta?.type === "clear" || !value) return null;
        if (meta?.type === "content") return { ...value, to: meta.to, replaced: true };
        if (meta?.type === "review") return { ...value, status: "review" };
        if (meta?.type === "restart") return { ...value, status: "streaming" };
        if (!tr.docChanged) return value;

        const from = tr.mapping.map(value.from, 1);
        const to = Math.max(from, tr.mapping.map(value.to, -1));
        // The writer deleted the whole suggestion.
        if (value.replaced && from === to) return null;
        return { ...value, from, to };
      },
    },
    filterTransaction(tr, state) {
      const suggestion = getAiSuggestion(state);
      if (!suggestion || suggestion.status !== "streaming" || !tr.docChanged) return true;
      if (isAiSuggestionTransaction(tr) || tr.getMeta("appendedTransaction")) return true;
      return !touchesRange(tr, suggestion.from, suggestion.to);
    },
    props: {
      decorations(state) {
        const suggestion = getAiSuggestion(state);
        if (!suggestion) return null;
        const { from, to, replaced, status } = suggestion;
        const decorations: Decoration[] = [];
        const blocks: { node: ProseMirrorNode; pos: number }[] = [];
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (pos >= from) blocks.push({ node, pos });
          return false;
        });

        if (!replaced) {
          let hasText = false;
          for (const { node, pos } of blocks) {
            const empty = node.textContent.trim() === "";
            if (!empty) hasText = true;
            decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: empty ? "sp-ai-hidden" : "sp-ai-replacing" }));
          }
          if (!hasText) decorations.push(Decoration.widget(from, pendingWidget, { side: -2, key: "ai-pending" }));
        } else {
          blocks.forEach(({ node, pos }, index) => {
            const classes = ["sp-ai-suggested"];
            if (index === 0) classes.push("sp-ai-first");
            if (index === blocks.length - 1) classes.push("sp-ai-last");
            decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: classes.join(" ") }));
          });
          if (status === "streaming" && to > from) {
            decorations.push(Decoration.widget(to - 1, caretWidget, { side: 1, key: "ai-caret" }));
          }
        }
        decorations.push(Decoration.widget(to, barSpaceWidget, { side: -1, key: "ai-bar-space", ignoreSelection: true }));
        return DecorationSet.create(state.doc, decorations);
      },
      handleKeyDown(view, event) {
        const suggestion = getAiSuggestion(view.state);
        if (!suggestion || suggestion.status !== "review") return false;
        const mod = event.metaKey || event.ctrlKey;

        if (event.key === "Enter" && mod) return acceptAiSuggestion(view);
        if (event.key === "Escape" || (mod && !event.shiftKey && event.key.toLowerCase() === "z")) {
          return discardAiSuggestion(view.state, view.dispatch);
        }
        // Editing inside the suggestion accepts it first, so the edit lands on accepted text.
        const edits = (event.key.length === 1 && !mod && !event.altKey) || EDITING_KEYS.has(event.key);
        if (edits && selectionTouches(view.state, suggestion)) acceptAiSuggestion(view, { keepSelection: true });
        return false;
      },
      handlePaste(view) {
        const suggestion = getAiSuggestion(view.state);
        if (suggestion?.status === "review" && selectionTouches(view.state, suggestion)) {
          acceptAiSuggestion(view, { keepSelection: true });
        }
        return false;
      },
    },
  });
}

/** Runs before the screenplay keymap, so Escape and Enter reach the suggestion first. */
export const AiSuggestion = Extension.create({
  name: "aiSuggestion",
  priority: 300,
  addProseMirrorPlugins() {
    return [aiSuggestionPlugin()];
  },
});
