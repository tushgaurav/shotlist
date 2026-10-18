import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

import type { ScriptPoint, ScriptSnapshot } from "../../ai/schema";
import { blocksFromNode } from "../blocks";
import { sceneRanges } from "./commands";

/** Positions on block boundaries. Equal when lines are inserted rather than replaced. */
export type BlockRange = { from: number; to: number };

/** New lines replace the cursor's line when it's empty, and otherwise go after it. */
export function insertionRange(state: EditorState): BlockRange {
  const $pos = state.selection.$to;
  if ($pos.depth === 0) return { from: $pos.pos, to: $pos.pos };
  const from = $pos.before(1);
  const to = $pos.after(1);
  return $pos.parent.textContent.trim() === "" ? { from, to } : { from: to, to };
}

/** The selected lines, whole. A selection ending at the very start of a line leaves that line out. */
export function rewriteRange(state: EditorState): BlockRange | null {
  const { $from, $to, empty } = state.selection;
  if (empty) return null;
  const from = $from.depth ? $from.before(1) : $from.pos;
  let to = $to.depth ? $to.after(1) : $to.pos;
  if ($to.depth && $to.parentOffset === 0 && $to.before(1) > from) to = $to.before(1);
  return from < to ? { from, to } : null;
}

/** The end of the scene the cursor is in, where a following scene would start. */
export function sceneEndRange(state: EditorState): BlockRange {
  const pos = state.selection.from;
  const scene = sceneRanges(state.doc).findLast((range) => range.from <= pos);
  const end = scene?.to ?? state.doc.content.size;
  return { from: end, to: end };
}

export function sceneRange(doc: ProseMirrorNode, sceneId: string): BlockRange | null {
  const scene = sceneRanges(doc).find((range) => range.id === sceneId);
  return scene ? { from: scene.from, to: scene.to } : null;
}

export function wholeDocRange(doc: ProseMirrorNode): BlockRange {
  return { from: 0, to: doc.content.size };
}

export function isBlankDoc(doc: ProseMirrorNode) {
  let blank = true;
  doc.forEach((node) => {
    if (node.textContent.trim()) blank = false;
  });
  return blank;
}

/** Where the model should see the cursor for lines going into `range`. */
export function insertionPoint(doc: ProseMirrorNode, range: BlockRange): ScriptPoint | null {
  if (doc.childCount === 0) return null;
  const index = doc.resolve(range.from).index(0);
  if (range.from < range.to || index === 0) return { block: Math.min(index, doc.childCount - 1), offset: 0 };
  return { block: index - 1, offset: doc.child(index - 1).textContent.length };
}

/** The first and last block indexes inside `range`. */
export function blockSpan(doc: ProseMirrorNode, range: BlockRange) {
  return { from: doc.resolve(range.from).index(0), to: doc.resolve(range.to).index(0) - 1 };
}

export function scriptSnapshot(
  doc: ProseMirrorNode,
  { cursor = null, selection = null }: { cursor?: ScriptPoint | null; selection?: BlockRange | null } = {},
): ScriptSnapshot {
  return {
    blocks: blocksFromNode(doc),
    cursor,
    selection: selection ? blockSpan(doc, selection) : null,
  };
}
