"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { cn } from "cn";
import { GripVerticalIcon } from "lucide-react";
import { useState } from "react";

import { moveScene } from "@/lib/screenplay/editor/commands";

type SceneItem = { id: string; number: number; heading: string };
type DropTarget = { id: string; edge: "before" | "after" };

const SCENE_DRAG_TYPE = "application/x-shotlist-scene";

export function SceneSidebar({ editor }: { editor: Editor | null }) {
  const { scenes, activeId } = useEditorState({
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
  }) ?? { scenes: [], activeId: null };

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const move = (sceneId: string, beforeSceneId: string | null) => {
    if (!editor) return false;
    return moveScene(sceneId, beforeSceneId)(editor.state, editor.view.dispatch);
  };

  const jumpTo = (sceneId: string) => {
    if (!editor) return;
    let target: { pos: number; size: number } | null = null;
    editor.state.doc.forEach((node, pos) => {
      if (node.type.name === "sceneHeading" && node.attrs.sceneId === sceneId) {
        target = { pos, size: node.content.size };
      }
    });
    if (!target) return;
    const { pos, size } = target;
    editor.chain().setTextSelection(pos + 1 + size).focus(undefined, { scrollIntoView: false }).run();
    (editor.view.nodeDOM(pos) as HTMLElement | null)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const endDrag = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const drop = () => {
    if (draggingId && dropTarget) {
      const index = scenes.findIndex((scene) => scene.id === dropTarget.id);
      const before = dropTarget.edge === "before" ? dropTarget.id : (scenes[index + 1]?.id ?? null);
      move(draggingId, before);
    }
    endDrag();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const scene = scenes[index];
    const before =
      event.key === "ArrowUp"
        ? scenes[index - 1]?.id
        : index + 1 < scenes.length
          ? (scenes[index + 2]?.id ?? null)
          : undefined;
    if (before === undefined || !move(scene.id, before)) return;
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-scene-button="${scene.id}"]`)?.focus();
    });
  };

  return (
    <aside
      aria-label="Scenes"
      className="sticky top-26 hidden h-[calc(100svh-6.5rem)] w-64 shrink-0 flex-col border-r bg-background lg:flex"
    >
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Scenes</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{scenes.length}</span>
      </div>

      {scenes.length === 0 ? (
        <p className="px-4 py-2 text-sm text-muted-foreground">
          No scenes yet. Start a line with INT. or EXT. to add one.
        </p>
      ) : (
        <ol className="flex-1 overflow-y-auto px-2 pb-4">
          {scenes.map((scene, index) => (
            <li
              key={scene.id}
              className="relative"
              onDragOver={(event) => {
                if (!draggingId || !event.dataTransfer.types.includes(SCENE_DRAG_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const rect = event.currentTarget.getBoundingClientRect();
                const edge = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                if (dropTarget?.id !== scene.id || dropTarget.edge !== edge) {
                  setDropTarget({ id: scene.id, edge });
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                drop();
              }}
            >
              {dropTarget?.id === scene.id && draggingId !== scene.id && (
                <div
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-primary",
                    dropTarget.edge === "before" ? "-top-px" : "-bottom-px",
                  )}
                />
              )}
              <button
                type="button"
                draggable
                data-scene-button={scene.id}
                aria-current={scene.id === activeId ? "location" : undefined}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                title="Click to jump. Drag, or Alt+↑/↓, to move."
                onClick={() => jumpTo(scene.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
                onDragStart={(event) => {
                  event.dataTransfer.setData(SCENE_DRAG_TYPE, scene.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingId(scene.id);
                }}
                onDragEnd={endDrag}
                className={cn(
                  "group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=location]:bg-muted aria-[current=location]:font-medium",
                  draggingId === scene.id && "opacity-50",
                )}
              >
                <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">
                  {scene.number}
                </span>
                <span className="line-clamp-2 flex-1 font-mono leading-5 tracking-tight">
                  {scene.heading || (
                    <span className="font-sans text-muted-foreground italic">Untitled scene</span>
                  )}
                </span>
                <GripVerticalIcon
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
