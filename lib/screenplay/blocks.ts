import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { isElementType, type ElementType } from "./elements";
import type { ScreenplayDocJSON } from "./types";

/** A flat view of one screenplay element, independent of editor or storage format. */
export type ScreenplayBlock = {
  type: ElementType;
  text: string;
  sceneId: string | null;
};

export function blocksFromJSON(doc: ScreenplayDocJSON): ScreenplayBlock[] {
  return doc.content.flatMap((block) => {
    if (!isElementType(block.type)) return [];
    const sceneId = block.attrs?.sceneId;
    return {
      type: block.type,
      text: (block.content ?? []).map((node) => node.text).join(""),
      sceneId: typeof sceneId === "string" ? sceneId : null,
    };
  });
}

export function blocksFromNode(doc: ProseMirrorNode): ScreenplayBlock[] {
  const blocks: ScreenplayBlock[] = [];
  doc.forEach((node) => {
    const type = node.type.name;
    if (!isElementType(type)) return;
    const sceneId = node.attrs.sceneId;
    blocks.push({
      type,
      text: node.textContent,
      sceneId: typeof sceneId === "string" ? sceneId : null,
    });
  });
  return blocks;
}
