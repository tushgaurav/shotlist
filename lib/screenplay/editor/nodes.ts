import { mergeAttributes, Node } from "@tiptap/core";

import type { ElementType } from "../elements";

function elementNode(name: ElementType) {
  return Node.create({
    name,
    group: "block",
    content: "inline*",
    parseHTML() {
      const rules: { tag: string; priority?: number }[] = [
        { tag: `p[data-type="${name}"]`, priority: 60 },
      ];
      // Anything pasted from outside the editor becomes action.
      if (name === "action") rules.push({ tag: "p" });
      return rules;
    },
    renderHTML({ HTMLAttributes }) {
      return ["p", mergeAttributes(HTMLAttributes, { "data-type": name, class: `sp-${name}` }), 0];
    },
  });
}

export const SceneHeading = elementNode("sceneHeading").extend({
  addAttributes() {
    return {
      sceneId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-scene-id"),
        renderHTML: (attributes) =>
          attributes.sceneId ? { "data-scene-id": attributes.sceneId } : {},
      },
    };
  },
});

// Action comes first so it is the schema's default block.
export const elementNodes = [
  elementNode("action"),
  SceneHeading,
  elementNode("character"),
  elementNode("parenthetical"),
  elementNode("dialogue"),
  elementNode("transition"),
];
