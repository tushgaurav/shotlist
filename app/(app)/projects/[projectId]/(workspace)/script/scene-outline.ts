import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";

export type SceneItem = { id: string; number: number; heading: string };

/** The script's scenes as typed so far, and the one the cursor is in. */
export function useSceneOutline(editor: Editor | null) {
  return (
    useEditorState({
      editor,
      selector: ({ editor }) => {
        const scenes: SceneItem[] = [];
        let activeId: string | null = null;
        if (!editor) return { scenes, activeId };

        const cursor = editor.state.selection.from;
        editor.state.doc.forEach((node, pos) => {
          const id = node.attrs.sceneId;
          if (node.type.name !== "sceneHeading" || !id) return;
          scenes.push({ id, number: scenes.length + 1, heading: node.textContent.trim().toUpperCase() });
          if (pos < cursor) activeId = id;
        });
        return { scenes, activeId };
      },
    }) ?? { scenes: [], activeId: null }
  );
}
