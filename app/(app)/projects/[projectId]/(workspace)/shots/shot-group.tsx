"use client";

import { EllipsisIcon, ListOrderedIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { memo, useMemo, useRef, type CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMinutes, sceneChanged, totalMinutes, type ShotGroup } from "@/lib/shots/groups";
import { shotLabel } from "@/lib/shots/numbering";
import type { PresetOption } from "@/lib/shots/presets";

import type { ShotColumn } from "./columns";
import { useShotListActions, type DropTarget } from "./context";
import { DropLine, ShotRow } from "./shot-row";

type ShotGroupSectionProps = {
  group: ShotGroup;
  columns: ShotColumn[];
  template: CSSProperties & { minWidth: number };
  sceneNumbers: Map<string, string>;
  /** For standalone and unlinked shots, which have no scene of their own. */
  allCharacters: PresetOption[];
  /** Only set when the drop target is in this group. */
  dropTarget: DropTarget | null;
  draggingId: string | null;
};

export const ShotGroupSection = memo(function ShotGroupSection({
  group,
  columns,
  template,
  sceneNumbers,
  allCharacters,
  dropTarget,
  draggingId,
}: ShotGroupSectionProps) {
  const actions = useShotListActions();
  const sceneCharacters = useMemo(
    () => group.scene?.characters.map((value) => ({ value })),
    [group.scene?.characters],
  );
  const characters = sceneCharacters ?? allCharacters;
  const sceneId = group.kind === "scene" ? group.scene.id : null;

  return (
    <section role="rowgroup" aria-label={groupName(group)} data-group={group.key}>
      <GroupHeader group={group} minWidth={template.minWidth} />

      {group.shots.map((shot) => (
        <ShotRow
          key={shot.id}
          shot={shot}
          autoLabel={shotLabel(shot.sceneId ? sceneNumbers.get(shot.sceneId) : null, shot.suffix, null)}
          unlinked={group.kind === "unlinked"}
          groupKey={group.key}
          columns={columns}
          template={template}
          characters={characters}
          dropSide={dropTarget?.shotId === shot.id ? dropTarget.side : null}
          dragging={draggingId === shot.id}
        />
      ))}

      {group.kind !== "unlinked" && (
        <div
          role="row"
          style={{ minWidth: template.minWidth }}
          onDragOver={(event) => actions.dragOver(event, group.key, null)}
          onDrop={actions.drop}
          className="relative border-b"
        >
          {dropTarget && dropTarget.shotId === null && <DropLine side="before" />}
          <div role="gridcell" className="sticky left-0 w-fit">
            <button
              type="button"
              onClick={() => actions.focusShot(actions.add(sceneId))}
              className="flex items-center gap-1.5 py-1.5 pr-3 pl-8 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:underline focus-visible:outline-none"
            >
              <PlusIcon className="size-3.5" aria-hidden />
              {group.kind === "scene" ? `Add Shot to Scene ${group.scene.number}` : "Add Standalone Shot"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
});

export function groupName(group: ShotGroup) {
  if (group.kind === "scene") return `Scene ${group.scene.number}`;
  return group.kind === "unlinked" ? "Unlinked Shots" : "Standalone Shots";
}

/** In the table it's a grid row as wide as the columns; elsewhere (storyboard) a plain bar. */
export function GroupHeader({ group, minWidth }: { group: ShotGroup; minWidth?: number }) {
  const inGrid = minWidth !== undefined;
  const actions = useShotListActions();
  // The menu traps focus while open, so a shot added from it is focused once it closes.
  const added = useRef<string | null>(null);
  const count = group.shots.length;
  const minutes = totalMinutes(group.shots);
  const summary = (
    <span className="text-xs whitespace-nowrap text-muted-foreground">
      {count} {count === 1 ? "shot" : "shots"}
      {minutes > 0 && ` · ${formatMinutes(minutes)}`}
    </span>
  );

  return (
    <div role={inGrid ? "row" : undefined} style={{ minWidth }} className="border-b bg-muted/50">
      <div
        role={inGrid ? "gridcell" : undefined}
        className="sticky left-0 flex w-fit max-w-[calc(100cqw-1rem)] items-center gap-3 py-2 pr-3 pl-3"
      >
        {group.kind === "scene" ? (
          <>
            <span className="rounded bg-foreground px-1.5 py-0.5 font-mono text-xs font-semibold text-background tabular-nums">
              {group.scene.number}
            </span>
            <h2 className="truncate font-mono text-[13px] font-semibold tracking-wide uppercase">
              {group.scene.heading || "Untitled Scene"}
            </h2>
            {summary}
            {sceneChanged(group.scene, count) && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      tabIndex={0}
                      className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                    >
                      Scene Changed
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">
                    The script for this scene changed after its shots were last edited. Check the shots
                    still fit.
                  </TooltipContent>
                </Tooltip>
                <Button variant="ghost" size="xs" onClick={() => actions.markReviewed(group.scene.id)}>
                  Mark Reviewed
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={`Scene ${group.scene.number} Actions`}>
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-56"
                onCloseAutoFocus={(event) => {
                  if (!added.current) return;
                  event.preventDefault();
                  actions.focusShot(added.current);
                  added.current = null;
                }}
              >
                <DropdownMenuItem onSelect={() => (added.current = actions.add(group.scene.id))}>
                  <PlusIcon />
                  Add Shot
                </DropdownMenuItem>
                <DropdownMenuItem disabled={count === 0} onSelect={() => actions.requestRenumber(group.scene)}>
                  <ListOrderedIcon />
                  Renumber Shots…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : group.kind === "unlinked" ? (
          <>
            <TriangleAlertIcon className="size-4 shrink-0 text-amber-600" aria-hidden />
            <h2 className="text-sm font-medium">Unlinked Shots</h2>
            {summary}
            <span className="truncate text-xs text-muted-foreground">
              Their scenes were removed from the script. Move them to a scene or delete them.
            </span>
          </>
        ) : (
          <>
            <h2 className="text-sm font-medium">Standalone Shots</h2>
            {summary}
            <span className="truncate text-xs text-muted-foreground">
              B-roll, inserts and pickups that aren&apos;t tied to a scene.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
