"use client";

import { cn } from "cn";
import { ClapperboardIcon, FileTextIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { downloadText, safeFileName } from "@/lib/download";
import { groupShots, sceneChanged, shotListCsv, totalMinutes } from "@/lib/shots/groups";
import { shotLabel } from "@/lib/shots/numbering";
import type { ShotListData, ShotScene } from "@/lib/shots/types";

import { gridTemplate, useColumnVisibility, useShotListView } from "./columns";
import { ShotListContext, type DropTarget, type ShotListActions } from "./context";
import { focusShotCell, handleGridKeyDown } from "./grid-keys";
import { imageActions, useIgnoreStrayFileDrops, useProjectShots } from "./project-shots";
import { RenumberDialog } from "./renumber-dialog";
import { ShotGroupSection } from "./shot-group";
import { ImageViewer } from "./shot-image";
import { ShotListToolbar } from "./shot-list-toolbar";
import { handleStoryboardKeyDown, StoryboardGroup } from "./storyboard";

const DRAG_TYPE = "application/x-shotlist-shot";

const groupSceneId = (groupKey: string) =>
  groupKey.startsWith("scene:") ? groupKey.slice("scene:".length) : null;

type Props = { projectId: string; projectTitle: string; data: ShotListData; imagesEnabled: boolean };

export function ShotList({ projectId, projectTitle, data, imagesEnabled }: Props) {
  const shots = useProjectShots(projectId, data);
  const { store, images } = shots;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const visibility = useColumnVisibility(projectId);
  const [view, setView] = useShotListView(projectId);
  useIgnoreStrayFileDrops();

  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef<string | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [renumbering, setRenumbering] = useState<ShotScene | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  // A dialog left open shouldn't greet you when you come back to the page.
  useLayoutEffect(
    () => () => {
      setRenumbering(null);
      setViewingId(null);
    },
    [],
  );

  const actions = useMemo<ShotListActions>(() => {
    const labelOf = (shotId: string) => {
      const { scenes, shots } = store.getSnapshot();
      const shot = shots.find((s) => s.id === shotId);
      const number = scenes.find((scene) => scene.id === shot?.sceneId)?.number;
      return shot ? shotLabel(number, shot.suffix, shot.customLabel) : "";
    };
    // Renders the change before returning, so the next keystroke already lands in the new cell.
    const now = <T,>(change: () => T): T => {
      let result!: T;
      flushSync(() => {
        result = change();
      });
      return result;
    };
    const focusShot = (shotId: string | null, field = "description") => {
      if (shotId) focusShotCell(containerRef.current, shotId, field);
    };
    const setTarget = (next: DropTarget | null) => {
      const current = dropRef.current;
      if (
        current?.groupKey === next?.groupKey &&
        current?.shotId === next?.shotId &&
        current?.side === next?.side
      ) {
        return;
      }
      dropRef.current = next;
      setDropTarget(next);
    };
    const endDrag = () => {
      draggedRef.current = null;
      setDraggingId(null);
      setTarget(null);
    };

    return {
      ...imageActions(shots, imagesEnabled, labelOf),
      store,
      images,
      imagesEnabled,
      focusShot,
      add: (sceneId) => now(() => store.add(sceneId)),
      addAfter: (shotId) => {
        const { shots, scenes } = store.getSnapshot();
        const shot = shots.find((s) => s.id === shotId);
        if (!shot) return null;
        // An unlinked shot's scene is gone, so there's no group to add to.
        if (shot.sceneId !== null && !scenes.some((s) => s.id === shot.sceneId && !s.removed)) return null;
        return now(() => store.add(shot.sceneId, { afterId: shotId }));
      },
      duplicate: (shotId) => now(() => store.duplicate(shotId)),
      remove: (shotId) => {
        const label = labelOf(shotId);
        const removed = store.remove(shotId);
        if (!removed) return;
        toast(label ? `Deleted shot ${label}` : "Deleted shot", {
          action: { label: "Undo", onClick: () => store.restore(removed) },
        });
      },
      moveTo: (shotId, sceneId) => {
        store.move(shotId, sceneId, null);
        const number = store.getSnapshot().scenes.find((scene) => scene.id === sceneId)?.number;
        const label = labelOf(shotId);
        toast(number ? `Moved to scene ${number} as ${label}` : "Moved to standalone shots");
      },
      nudge: (shotId, direction, field) => {
        now(() => store.nudge(shotId, direction));
        if (field) focusShot(shotId, field);
      },
      markReviewed: (sceneId) => store.markReviewed(sceneId),
      requestRenumber: setRenumbering,
      viewImage: setViewingId,
      dragStart: (event, shotId) => {
        event.dataTransfer.setData(DRAG_TYPE, shotId);
        event.dataTransfer.effectAllowed = "move";
        const row = event.currentTarget.closest("[data-shot-row]");
        if (row) event.dataTransfer.setDragImage(row, 16, 16);
        draggedRef.current = shotId;
        setDraggingId(shotId);
      },
      dragEnd: endDrag,
      dragOver: (event, groupKey, shotId, axis = "y") => {
        if (!draggedRef.current || groupKey === "unlinked") return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        let side: DropTarget["side"] = "before";
        if (shotId) {
          const rect = event.currentTarget.getBoundingClientRect();
          const past =
            axis === "x" ? event.clientX > rect.left + rect.width / 2 : event.clientY > rect.top + rect.height / 2;
          if (past) side = "after";
        }
        setTarget({ groupKey, shotId, side });
      },
      drop: (event: DragEvent<HTMLElement>) => {
        const shotId = draggedRef.current;
        const target = dropRef.current;
        if (!shotId || !target) return;
        event.preventDefault();
        endDrag();

        const sceneId = groupSceneId(target.groupKey);
        let beforeId = target.shotId;
        if (target.shotId && target.side === "after") {
          const group = store.shotsIn(sceneId);
          beforeId = group[group.findIndex((s) => s.id === target.shotId) + 1]?.id ?? null;
        }
        store.move(shotId, sceneId, beforeId);
      },
    };
  }, [shots, store, images, imagesEnabled]);

  const groups = useMemo(() => groupShots(state.scenes, state.shots), [state.scenes, state.shots]);
  const sceneNumbers = useMemo(
    () => new Map(state.scenes.map((scene) => [scene.id, scene.number])),
    [state.scenes],
  );
  const allCharacters = useMemo(
    () =>
      [...new Set(state.scenes.filter((s) => !s.removed).flatMap((s) => s.characters))].map(
        (value) => ({ value }),
      ),
    [state.scenes],
  );
  const template = useMemo(() => gridTemplate(visibility.columns), [visibility.columns]);
  const changedScenes = groups.filter(
    (group) => group.kind === "scene" && sceneChanged(group.scene, group.shots.length),
  ).length;
  const viewing = viewingId ? (state.shots.find((shot) => shot.id === viewingId) ?? null) : null;

  const exportCsv = () => {
    const fileName = `${safeFileName(projectTitle, "Project")} – Shot List.csv`;
    downloadText(shotListCsv(state.scenes, state.shots), fileName, "text/csv;charset=utf-8");
  };

  const liveScenes = state.scenes.filter((scene) => !scene.removed);
  if (liveScenes.length === 0 && state.shots.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <EmptyState
          icon={ClapperboardIcon}
          title="No Scenes to Plan Yet"
          description="Shots are planned scene by scene. Write scene headings in the script and they'll show up here, or start with standalone shots like B-roll."
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={`/projects/${projectId}/script`}>
                <FileTextIcon data-icon="inline-start" />
                Open the Script
              </Link>
            </Button>
            <Button variant="outline" onClick={() => actions.focusShot(actions.add(null))}>
              <PlusIcon data-icon="inline-start" />
              Add Standalone Shot
            </Button>
          </div>
        </EmptyState>
      </div>
    );
  }

  return (
    <ShotListContext value={actions}>
      <ShotListToolbar
        status={state.status}
        shotCount={state.shots.length}
        minutes={totalMinutes(state.shots)}
        changedScenes={changedScenes}
        view={view}
        onViewChange={setView}
        visibility={visibility}
        onExport={exportCsv}
      />

      {view === "storyboard" ? (
        <div
          ref={containerRef}
          aria-label="Storyboard"
          role="region"
          className="flex-1 pb-24"
          onKeyDown={(event) => handleStoryboardKeyDown(event, actions)}
        >
          {groups.map((group) => (
            <StoryboardGroup
              key={group.key}
              group={group}
              sceneNumbers={sceneNumbers}
              dropTarget={dropTarget?.groupKey === group.key ? dropTarget : null}
              draggingId={draggingId}
            />
          ))}
        </div>
      ) : (
        <div role="grid" aria-label="Shot List" ref={containerRef} className="relative flex-1 pb-24">
          <div
            role="rowgroup"
            ref={headerRef}
            className="sticky top-24 z-20 overflow-hidden border-b bg-muted text-xs font-medium text-muted-foreground"
          >
            <div role="row" className="grid" style={template}>
              <div role="columnheader" className="sticky left-0 z-1 bg-muted">
                <span className="sr-only">Drag</span>
              </div>
              <div role="columnheader" className="sticky left-7 z-1 border-r bg-muted px-2 py-2">
                Shot
              </div>
              {visibility.columns.map((column) => (
                <div
                  key={column.field}
                  role="columnheader"
                  className={cn("truncate border-r px-2 py-2", column.kind === "number" && "text-right")}
                >
                  {column.label}
                </div>
              ))}
              <div role="columnheader">
                <span className="sr-only">Actions</span>
              </div>
            </div>
          </div>

          <div
            className="overflow-x-auto"
            onScroll={(event) => {
              if (headerRef.current) headerRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }}
            onKeyDown={(event) =>
              handleGridKeyDown(event, {
                addAfter: (shotId, field) => actions.focusShot(actions.addAfter(shotId), field),
                nudge: (shotId, direction, field) => actions.nudge(shotId, direction, field),
              })
            }
          >
            {groups.map((group) => (
              <ShotGroupSection
                key={group.key}
                group={group}
                columns={visibility.columns}
                template={template}
                sceneNumbers={sceneNumbers}
                allCharacters={allCharacters}
                dropTarget={dropTarget?.groupKey === group.key ? dropTarget : null}
                draggingId={draggingId}
              />
            ))}
          </div>
        </div>
      )}

      <RenumberDialog
        scene={renumbering}
        shots={state.shots}
        onClose={() => setRenumbering(null)}
        onConfirm={(scene) => {
          store.renumber(scene.id);
          setRenumbering(null);
        }}
      />
      <ImageViewer
        shot={viewing}
        label={
          viewing
            ? shotLabel(viewing.sceneId ? sceneNumbers.get(viewing.sceneId) : null, viewing.suffix, viewing.customLabel)
            : ""
        }
        images={images}
        imagesEnabled={imagesEnabled}
        onUpload={actions.uploadImage}
        onRemove={actions.removeImage}
        onClose={() => setViewingId(null)}
      />
    </ShotListContext>
  );
}
