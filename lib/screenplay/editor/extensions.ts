import { Extension, type Extensions } from "@tiptap/core";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { chainCommands } from "@tiptap/pm/commands";
import type { Command } from "@tiptap/pm/state";

import { ELEMENT_PLACEHOLDERS, isElementType, SHORTCUT_ORDER } from "../elements";
import { AiSuggestion } from "./ai-suggestion";
import { autocompletePlugin } from "./autocomplete";
import {
  acceptSuggestion,
  cycleElement,
  dismissSuggestion,
  enter,
  setElementType,
} from "./commands";
import { acceptGhostText, dismissGhostText, ghostTextPlugin } from "./ghost-text";
import { screenplayInputPlugin } from "./input";
import { sceneIdsPlugin } from "./scene-ids";
import { screenplaySchemaExtensions } from "./schema";

const ScreenplayBehavior = Extension.create({
  name: "screenplayBehavior",
  priority: 200,

  addKeyboardShortcuts() {
    const run = (command: Command) => () => command(this.editor.state, this.editor.view.dispatch);
    const shortcuts: Record<string, () => boolean> = {
      Enter: run(enter),
      "Shift-Enter": run(enter),
      Tab: run(chainCommands(acceptSuggestion, acceptGhostText, cycleElement(1))),
      "Shift-Tab": run(cycleElement(-1)),
      ArrowRight: run(acceptSuggestion),
      Escape: run(chainCommands(dismissSuggestion, dismissGhostText)),
    };
    SHORTCUT_ORDER.forEach((type, index) => {
      shortcuts[`Mod-Alt-${index + 1}`] = run(setElementType(type));
    });
    return shortcuts;
  },

  addProseMirrorPlugins() {
    return [sceneIdsPlugin(), autocompletePlugin(), ghostTextPlugin(), screenplayInputPlugin()];
  },
});

export function screenplayEditorExtensions(): Extensions {
  return [
    ...screenplaySchemaExtensions(),
    ScreenplayBehavior,
    AiSuggestion,
    UndoRedo,
    Placeholder.configure({
      placeholder: ({ node }) =>
        isElementType(node.type.name) ? ELEMENT_PLACEHOLDERS[node.type.name] : "",
    }),
  ];
}
