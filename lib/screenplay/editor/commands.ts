import { setBlockType } from "@tiptap/pm/commands";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type Command } from "@tiptap/pm/state";

import { isElementType, NEXT_ELEMENT, TAB_CYCLE, type ElementType } from "../elements";
import { autocompleteKey, getActiveSuggestion } from "./autocomplete";

export function isTransitionText(text: string) {
  const trimmed = text.trim();
  return trimmed.length <= 40 && trimmed === trimmed.toUpperCase() && /\p{L}.*TO:$/u.test(trimmed);
}

/**
 * Enter: accept any suggestion, then
 * - on an empty line, turn it into action;
 * - at the start of a line, insert an action line above;
 * - mid-line, split into two elements of the same type;
 * - at the end, start the element that normally follows (character → dialogue, …).
 */
export const enter: Command = (state, dispatch) => {
  if (!(state.selection instanceof TextSelection) || !state.selection.$cursor) return false;
  const { schema } = state;
  const tr = state.tr;

  const suggestion = getActiveSuggestion(state);
  if (suggestion) tr.insertText(suggestion);

  const $cursor = tr.doc.resolve(tr.selection.from);
  const block = $cursor.parent;
  const type = block.type.name;
  if ($cursor.depth !== 1 || !isElementType(type)) return false;
  const blockPos = $cursor.before();

  if (block.content.size === 0) {
    if (type === "action") tr.split($cursor.pos, 1, [{ type: schema.nodes.action }]);
    else tr.setNodeMarkup(blockPos, schema.nodes.action);
  } else if ($cursor.parentOffset === 0) {
    tr.insert(blockPos, schema.nodes.action.create());
  } else if ($cursor.parentOffset < block.content.size) {
    tr.split($cursor.pos);
  } else {
    let current: ElementType = type;
    if (type === "action" && isTransitionText(block.textContent)) {
      tr.setNodeMarkup(blockPos, schema.nodes.transition);
      current = "transition";
    }
    if (type === "parenthetical" && !block.textContent.trimEnd().endsWith(")")) {
      tr.insertText(")");
    }
    tr.split(tr.selection.from, 1, [{ type: schema.nodes[NEXT_ELEMENT[current]] }]);
  }

  dispatch?.(tr.scrollIntoView());
  return true;
};

export function setElementType(type: ElementType): Command {
  return (state, dispatch) => setBlockType(state.schema.nodes[type])(state, dispatch);
}

/** Tab / Shift+Tab. Always handles the key so focus never leaves the editor. */
export function cycleElement(direction: 1 | -1): Command {
  return (state, dispatch) => {
    const type = state.selection.$from.parent.type.name;
    if (!isElementType(type)) return false;
    const index = TAB_CYCLE.indexOf(type);
    const next = TAB_CYCLE[(index + direction + TAB_CYCLE.length) % TAB_CYCLE.length];
    setElementType(next)(state, dispatch);
    return true;
  };
}

export const acceptSuggestion: Command = (state, dispatch) => {
  const suggestion = getActiveSuggestion(state);
  if (!suggestion) return false;
  dispatch?.(state.tr.insertText(suggestion).scrollIntoView());
  return true;
};

export const dismissSuggestion: Command = (state, dispatch) => {
  if (!getActiveSuggestion(state)) return false;
  dispatch?.(state.tr.setMeta(autocompleteKey, { dismissed: true }));
  return true;
};

export type SceneRange = { id: string; from: number; to: number };

/** Each scene runs from its heading up to the next heading (or the end of the script). */
export function sceneRanges(doc: ProseMirrorNode): SceneRange[] {
  const ranges: SceneRange[] = [];
  doc.forEach((node, pos) => {
    if (node.type.name !== "sceneHeading") return;
    const previous = ranges.at(-1);
    if (previous) previous.to = pos;
    ranges.push({ id: node.attrs.sceneId, from: pos, to: doc.content.size });
  });
  return ranges;
}

/** Moves a whole scene so it sits before `beforeSceneId`, or at the end when that is null. */
export function moveScene(sceneId: string, beforeSceneId: string | null): Command {
  return (state, dispatch) => {
    const ranges = sceneRanges(state.doc);
    const source = ranges.find((range) => range.id === sceneId);
    if (!source) return false;

    const target = beforeSceneId === null ? state.doc.content.size : ranges.find((range) => range.id === beforeSceneId)?.from;
    if (target === undefined || (target >= source.from && target <= source.to)) return false;

    if (dispatch) {
      const content = state.doc.slice(source.from, source.to).content;
      const tr = state.tr.delete(source.from, source.to);
      const insertAt = tr.mapping.map(target);
      tr.insert(insertAt, content);
      tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
