"use client";

import { cn } from "cn";
import { GripVerticalIcon, PlusIcon } from "lucide-react";
import { memo, type KeyboardEvent } from "react";

import type { ShotGroup } from "@/lib/shots/groups";
import { shotLabel } from "@/lib/shots/numbering";
import { SHOT_STATUS_LABELS, type ShotRecord } from "@/lib/shots/types";

import { STATUS_DOTS } from "./cells";
import { useShotListActions, type DropTarget, type ShotListActions } from "./context";
import { GroupHeader, groupName } from "./shot-group";
import { ImageFrame, pastedImage } from "./shot-image";
import { ShotRowMenu } from "./shot-row";

/** Alt+arrows move the focused card; Esc leaves its text. */
export function handleStoryboardKeyDown(event: KeyboardEvent<HTMLElement>, actions: ShotListActions) {
  if (event.defaultPrevented || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey) return;
  const target = event.target as HTMLElement;
  const card = target.closest<HTMLElement>("[data-shot-row]");
  if (!card) return;

  if (event.key === "Escape" && target.matches("[data-cell-control]")) {
    target.blur();
    return;
  }
  if (!event.altKey || event.shiftKey) return;
  const direction =
    event.key === "ArrowUp" || event.key === "ArrowLeft"
      ? -1
      : event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : 0;
  if (!direction) return;
  event.preventDefault();
  const field = target.closest<HTMLElement>("[data-col]")?.dataset.col;
  actions.nudge(card.dataset.shotRow!, direction, field ?? "description");
}

type StoryboardGroupProps = {
  group: ShotGroup;
  sceneNumbers: Map<string, string>;
  /** Only set when the drop target is in this group. */
  dropTarget: DropTarget | null;
  draggingId: string | null;
};

export const StoryboardGroup = memo(function StoryboardGroup({
  group,
  sceneNumbers,
  dropTarget,
  draggingId,
}: StoryboardGroupProps) {
  const actions = useShotListActions();
  const sceneId = group.kind === "scene" ? group.scene.id : null;

  return (
    <section aria-label={groupName(group)} data-group={group.key}>
      <GroupHeader group={group} />
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4 p-4">
        {group.shots.map((shot) => (
          <StoryboardCard
            key={shot.id}
            shot={shot}
            autoLabel={shotLabel(shot.sceneId ? sceneNumbers.get(shot.sceneId) : null, shot.suffix, null)}
            unlinked={group.kind === "unlinked"}
            groupKey={group.key}
            dropSide={dropTarget?.shotId === shot.id ? dropTarget.side : null}
            dragging={draggingId === shot.id}
          />
        ))}
        {group.kind !== "unlinked" && (
          <li
            className="relative"
            onDragOver={(event) => actions.dragOver(event, group.key, null, "x")}
            onDrop={actions.drop}
          >
            {dropTarget && dropTarget.shotId === null && <CardDropLine side="before" />}
            <button
              type="button"
              onClick={() => actions.focusShot(actions.add(sceneId))}
              className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors outline-none hover:border-foreground/30 hover:text-foreground focus-visible:border-ring focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <PlusIcon className="size-5" aria-hidden />
              {group.kind === "scene" ? `Add Shot to Scene ${group.scene.number}` : "Add Standalone Shot"}
            </button>
          </li>
        )}
      </ol>
    </section>
  );
});

type StoryboardCardProps = {
  shot: ShotRecord;
  autoLabel: string;
  unlinked: boolean;
  groupKey: string;
  dropSide: "before" | "after" | null;
  dragging: boolean;
};

const StoryboardCard = memo(function StoryboardCard({
  shot,
  autoLabel,
  unlinked,
  groupKey,
  dropSide,
  dragging,
}: StoryboardCardProps) {
  const actions = useShotListActions();
  const label = shot.customLabel || autoLabel;
  const name = `shot ${label || "without a label"}`;
  const specs = [shot.size, shot.shotType, shot.movement, shot.lens].filter(Boolean).join(" · ");

  return (
    <li
      data-shot-row={shot.id}
      data-status={shot.status}
      aria-label={name}
      onDragOver={(event) => actions.dragOver(event, groupKey, shot.id, "x")}
      onDrop={actions.drop}
      onPaste={(event) => {
        const file = pastedImage(event);
        if (!file) return;
        event.preventDefault();
        actions.uploadImage(shot.id, file);
      }}
      className={cn(
        "group/card relative flex scroll-mt-40 flex-col rounded-lg border bg-card shadow-xs data-[status=omitted]:opacity-60",
        dragging && "opacity-40",
      )}
    >
      {dropSide && <CardDropLine side={dropSide} />}
      <ImageFrame shot={shot} name={name} />

      <div className="flex items-center gap-1.5 pt-1.5 pr-1.5 pl-1">
        <button
          type="button"
          draggable
          tabIndex={-1}
          aria-label={`Drag to move ${name}`}
          onDragStart={(event) => actions.dragStart(event, shot.id)}
          onDragEnd={actions.dragEnd}
          className="flex h-6 cursor-grab items-center text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <span
          title={unlinked ? "This shot's scene was removed from the script" : undefined}
          className={cn("font-mono text-sm font-semibold", unlinked && "text-muted-foreground line-through")}
        >
          {label || "—"}
        </span>
        <span
          role="img"
          aria-label={SHOT_STATUS_LABELS[shot.status]}
          title={SHOT_STATUS_LABELS[shot.status]}
          className={cn("size-2 shrink-0 rounded-full", STATUS_DOTS[shot.status])}
        />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{specs}</span>
        <ShotRowMenu
          shot={shot}
          name={name}
          unlinked={unlinked}
          layout="cards"
          className="opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100"
        />
      </div>

      <div data-col="description" className="px-1 pb-1.5">
        <textarea
          data-cell-control
          rows={2}
          value={shot.description}
          aria-label={`Description, ${name}`}
          placeholder="What we see"
          onChange={(event) => actions.store.update(shot.id, { description: event.target.value })}
          className="block min-h-13 w-full field-sizing-content resize-none rounded-md bg-transparent px-2 py-1 text-sm leading-5 outline-none placeholder:text-muted-foreground/50 focus:bg-background focus:ring-2 focus:ring-ring/60"
        />
      </div>
    </li>
  );
});

function CardDropLine({ side }: { side: "before" | "after" }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 w-0.5 rounded-full bg-primary",
        side === "before" ? "-left-[9px]" : "-right-[9px]",
      )}
    />
  );
}
