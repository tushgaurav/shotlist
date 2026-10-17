import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Command } from "@tiptap/pm/state";

import { autocompletePlugin } from "./autocomplete";
import { sceneIdsPlugin } from "./scene-ids";
import { screenplaySchema } from "./schema";

export const schema = screenplaySchema();

type BlockSpec = [type: string, text?: string, sceneId?: string | null];

export function makeDoc(...blocks: BlockSpec[]) {
  return schema.node(
    "doc",
    null,
    blocks.map(([type, text, sceneId]) =>
      schema.node(type, type === "sceneHeading" ? { sceneId: sceneId ?? null } : null, text ? schema.text(text) : undefined),
    ),
  );
}

export function idFactory(prefix = "new") {
  let count = 0;
  return () => `${prefix}${++count}`;
}

/** Creates a state with the cursor in block `index` at `offset` (defaults to the end). */
export function makeState(doc: ProseMirrorNode, index = doc.childCount - 1, offset?: number) {
  const state = EditorState.create({
    doc,
    plugins: [sceneIdsPlugin(idFactory()), autocompletePlugin()],
  });
  return withCursor(state, index, offset);
}

export function withCursor(state: EditorState, index: number, offset?: number) {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
  const block = state.doc.child(index);
  const cursor = pos + 1 + (offset ?? block.content.size);
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursor)));
}

export function run(state: EditorState, command: Command) {
  let next: EditorState | null = null;
  const handled = command(state, (tr) => {
    next = state.applyTransaction(tr).state;
  });
  return { handled, state: next ?? state };
}

export function blocks(state: EditorState) {
  const result: (string | [string, string, string | null])[] = [];
  state.doc.forEach((node) => {
    result.push(
      node.type.name === "sceneHeading"
        ? [node.type.name, node.textContent, node.attrs.sceneId]
        : `${node.type.name}:${node.textContent}`,
    );
  });
  return result;
}

export function cursorBlock(state: EditorState) {
  const { $from } = state.selection;
  return { type: $from.parent.type.name, index: $from.index(0), offset: $from.parentOffset };
}
