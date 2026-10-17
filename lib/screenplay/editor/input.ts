import { Plugin } from "@tiptap/pm/state";

import { isElementType } from "../elements";
import { startsLikeSceneHeading } from "../scenes";

const DIALOGUE_ELEMENTS = new Set(["character", "parenthetical", "dialogue"]);

/**
 * Typing shortcuts:
 * - "(" on an empty line right after a character or dialogue starts a parenthetical;
 * - an action line that starts with INT. / EXT. / I/E. / EST. becomes a scene heading.
 */
export function screenplayInputPlugin() {
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        const { state } = view;
        const { schema } = state;
        const $from = state.doc.resolve(from);
        const block = $from.parent;
        const type = block.type.name;
        if ($from.depth !== 1 || to > $from.end() || !isElementType(type)) return false;

        const blockPos = $from.before();

        if (text === "(" && block.content.size === 0 && type !== "parenthetical") {
          const index = $from.index(0);
          const previous = index > 0 ? state.doc.child(index - 1).type.name : null;
          if (previous && DIALOGUE_ELEMENTS.has(previous)) {
            view.dispatch(
              state.tr.setNodeMarkup(blockPos, schema.nodes.parenthetical).insertText(text, from, to),
            );
            return true;
          }
        }

        if (type === "action") {
          const current = block.textContent;
          const offset = $from.parentOffset;
          const next = current.slice(0, offset) + text + current.slice(offset + (to - from));
          if (!startsLikeSceneHeading(current) && startsLikeSceneHeading(next)) {
            view.dispatch(
              state.tr.setNodeMarkup(blockPos, schema.nodes.sceneHeading).insertText(text, from, to),
            );
            return true;
          }
        }

        return false;
      },
    },
  });
}
