"use client";

import { cn } from "cn";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  CornerDownRightIcon,
  EllipsisIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { memo, useRef, useSyncExternalStore, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortcutLabel, useIsMac } from "@/lib/keyboard";
import type { PresetOption } from "@/lib/shots/presets";
import type { ShotPatch, ShotRecord } from "@/lib/shots/types";

import { CheckCell, LongTextCell, NumberCell, PresetCell, StatusCell, TextCell } from "./cells";
import type { ShotColumn } from "./columns";
import { useShotListActions } from "./context";
import { ImageCell, pastedImage } from "./shot-image";

type ShotRowProps = {
  shot: ShotRecord;
  /** "12A", or "" for standalone shots. */
  autoLabel: string;
  unlinked: boolean;
  groupKey: string;
  columns: ShotColumn[];
  template: CSSProperties;
  characters: PresetOption[];
  dropSide: "before" | "after" | null;
  dragging: boolean;
};

export const ShotRow = memo(function ShotRow({
  shot,
  autoLabel,
  unlinked,
  groupKey,
  columns,
  template,
  characters,
  dropSide,
  dragging,
}: ShotRowProps) {
  const actions = useShotListActions();
  const name = `shot ${shot.customLabel || autoLabel || "without a label"}`;
  const update = (patch: ShotPatch) => actions.store.update(shot.id, patch);

  return (
    <div
      role="row"
      data-shot-row={shot.id}
      data-status={shot.status}
      style={template}
      onDragOver={(event) => actions.dragOver(event, groupKey, shot.id)}
      onDrop={actions.drop}
      onPaste={(event) => {
        const file = pastedImage(event);
        if (!file) return;
        event.preventDefault();
        actions.uploadImage(shot.id, file);
      }}
      className={cn(
        "group/row relative grid scroll-mt-36 scroll-mb-4 border-b bg-(--row-bg) [--row-bg:var(--background)] hover:[--row-bg:color-mix(in_oklch,var(--muted)_60%,var(--background))] data-[status=omitted]:text-muted-foreground",
        dragging && "opacity-40",
      )}
    >
      {dropSide && <DropLine side={dropSide} />}

      <div role="gridcell" className="sticky left-0 z-1 flex items-center justify-center bg-(--row-bg)">
        <button
          type="button"
          draggable
          tabIndex={-1}
          aria-label={`Drag to move ${name}`}
          onDragStart={(event) => actions.dragStart(event, shot.id)}
          onDragEnd={actions.dragEnd}
          className="flex h-full w-full cursor-grab items-center justify-center text-muted-foreground/40 opacity-0 group-hover/row:opacity-100 hover:text-foreground active:cursor-grabbing [@media(hover:none)]:opacity-100"
        >
          <GripVerticalIcon className="size-4" />
        </button>
      </div>

      <div
        role="gridcell"
        data-col="customLabel"
        className="sticky left-7 z-1 flex border-r bg-(--row-bg)"
      >
        <TextCell
          value={shot.customLabel}
          label={`Label, ${name}`}
          placeholder={autoLabel || "Label"}
          title={
            unlinked
              ? "This shot's scene was removed from the script"
              : autoLabel
                ? `Type to replace ${autoLabel}`
                : undefined
          }
          onChange={(customLabel) => update({ customLabel })}
          className={cn(
            "font-mono font-semibold",
            autoLabel && !unlinked && "placeholder:text-foreground",
            unlinked && "placeholder:text-muted-foreground placeholder:line-through",
          )}
        />
      </div>

      {columns.map((column) => (
        <div key={column.field} role="gridcell" data-col={column.field} className="flex min-w-0 border-r">
          <Cell column={column} shot={shot} name={name} characters={characters} update={update} />
        </div>
      ))}

      <div role="gridcell" className="flex items-start justify-center pt-1.5">
        <ShotRowMenu shot={shot} name={name} unlinked={unlinked} />
      </div>
    </div>
  );
});

function Cell({
  column,
  shot,
  name,
  characters,
  update,
}: {
  column: ShotColumn;
  shot: ShotRecord;
  name: string;
  characters: PresetOption[];
  update: (patch: ShotPatch) => void;
}) {
  const label = `${column.label}, ${name}`;
  switch (column.kind) {
    case "text":
      return (
        <TextCell
          value={shot[column.field]}
          label={label}
          placeholder={column.placeholder}
          onChange={(value) => update({ [column.field]: value } as ShotPatch)}
        />
      );
    case "longtext":
      return (
        <LongTextCell
          value={shot[column.field]}
          label={label}
          placeholder={column.placeholder}
          onChange={(value) => update({ [column.field]: value } as ShotPatch)}
        />
      );
    case "preset":
      return (
        <PresetCell
          value={shot[column.field]}
          label={label}
          options={column.presets === "characters" ? characters : column.presets}
          multiple={column.multiple}
          onChange={(value) => update({ [column.field]: value } as ShotPatch)}
        />
      );
    case "number":
      return (
        <NumberCell
          value={shot.estShootMinutes}
          label={label}
          onChange={(estShootMinutes) => update({ estShootMinutes })}
        />
      );
    case "check":
      return <CheckCell value={shot.vfx} label={label} onChange={(vfx) => update({ vfx })} />;
    case "status":
      return <StatusCell value={shot.status} label={label} onChange={(status) => update({ status })} />;
    case "image":
      return <ImageCell shot={shot} name={name} />;
  }
}

export function DropLine({ side }: { side: "before" | "after" }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-primary",
        side === "before" ? "-top-px" : "-bottom-px",
      )}
    />
  );
}

export function ShotRowMenu({
  shot,
  name,
  unlinked,
  layout = "rows",
  className = "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100",
}: {
  shot: ShotRecord;
  name: string;
  unlinked: boolean;
  /** Storyboard cards read left to right, so "up" and "down" become "earlier" and "later". */
  layout?: "rows" | "cards";
  className?: string;
}) {
  const actions = useShotListActions();
  const isMac = useIsMac();
  // The menu traps focus while open, so a shot added from it is focused once it closes.
  const added = useRef<string | null>(null);
  const [earlier, later] = layout === "rows" ? ["Move up", "Move down"] : ["Move earlier", "Move later"];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${name}`} className={className}>
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onCloseAutoFocus={(event) => {
          if (!added.current) return;
          event.preventDefault();
          actions.focusShot(added.current);
          added.current = null;
        }}
      >
        {!unlinked && (
          <>
            <DropdownMenuItem onSelect={() => (added.current = actions.addAfter(shot.id))}>
              <PlusIcon />
              Insert shot below
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => (added.current = actions.duplicate(shot.id))}>
              <CopyIcon />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => actions.nudge(shot.id, -1)}>
              <ArrowUpIcon />
              {earlier}
              <DropdownMenuShortcut>{shortcutLabel(["Alt", "↑"], isMac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.nudge(shot.id, 1)}>
              <ArrowDownIcon />
              {later}
              <DropdownMenuShortcut>{shortcutLabel(["Alt", "↓"], isMac)}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CornerDownRightIcon />
            Move to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-72 overflow-y-auto">
            <MoveTargets shot={shot} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => actions.remove(shot.id)}>
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Only mounted while the submenu is open, so it can read scenes straight from the store. */
function MoveTargets({ shot }: { shot: ShotRecord }) {
  const { store, moveTo } = useShotListActions();
  const { scenes } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return (
    <>
      {scenes
        .filter((scene) => !scene.removed)
        .map((scene) => (
          <DropdownMenuItem
            key={scene.id}
            disabled={scene.id === shot.sceneId}
            onSelect={() => moveTo(shot.id, scene.id)}
          >
            <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
              {scene.number}
            </span>
            <span className="truncate font-mono text-xs uppercase">{scene.heading || "Untitled scene"}</span>
          </DropdownMenuItem>
        ))}
      {scenes.some((scene) => !scene.removed) && <DropdownMenuSeparator />}
      <DropdownMenuItem disabled={shot.sceneId === null} onSelect={() => moveTo(shot.id, null)}>
        Standalone shots
      </DropdownMenuItem>
    </>
  );
}
