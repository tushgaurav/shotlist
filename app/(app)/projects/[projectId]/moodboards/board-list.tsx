"use client";

import { cn } from "cn";
import { ChevronRightIcon, ImagesIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { itemSearchText, type BoardItem, type BoardRecord } from "@/lib/moodboards/types";
import { assetUrl } from "@/lib/shots/images";

import { useBoardActions } from "./context";

type BoardDrop = { boardId: string; mode: "before" | "after" | "into" };

type BoardStats = { count: number; coverId: string | null; text: string };

export function BoardList({
  boards,
  items,
  selectedId,
  onSelect,
  onCreate,
  onMove,
  className,
}: {
  /** Every board, archived ones too, in order. */
  boards: BoardRecord[];
  items: BoardItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onMove: (id: string, beforeId: string | null) => void;
  className?: string;
}) {
  const actions = useBoardActions();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [drop, setDrop] = useState<BoardDrop | null>(null);

  const stats = useMemo(() => {
    const result = new Map<string, BoardStats>();
    for (const item of items) {
      const entry = result.get(item.boardId) ?? { count: 0, coverId: null, text: "" };
      entry.count++;
      entry.coverId ??= item.assetId;
      entry.text += `\n${itemSearchText(item)}`;
      result.set(item.boardId, entry);
    }
    return result;
  }, [items]);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? boards.filter((board) => board.name.toLowerCase().includes(needle) || stats.get(board.id)?.text.includes(needle))
    : boards;
  const active = matches.filter((board) => !board.archived);
  const archived = matches.filter((board) => board.archived);
  // A search shows matching archived boards without having to open the group.
  const archivedOpen = showArchived || (needle !== "" && archived.length > 0);

  const onDragOver = (event: DragEvent<HTMLElement>, board: BoardRecord) => {
    const dragging = actions.getDragged();
    if (!dragging) return;
    if (dragging.kind === "item") {
      const item = items.find((i) => i.id === dragging.id);
      if (!item || item.boardId === board.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDrop({ boardId: board.id, mode: "into" });
      return;
    }
    if (dragging.id === board.id || needle) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    setDrop({ boardId: board.id, mode: event.clientY > rect.top + rect.height / 2 ? "after" : "before" });
  };

  const onDrop = (event: DragEvent<HTMLElement>, board: BoardRecord) => {
    const dragging = actions.getDragged();
    const target = drop;
    if (!dragging || target?.boardId !== board.id) return;
    event.preventDefault();
    event.stopPropagation();
    setDrop(null);
    actions.dragEnd();
    if (dragging.kind === "item") {
      actions.moveTo(dragging.id, board.id);
      return;
    }
    const others = boards.filter((b) => b.id !== dragging.id);
    const index = others.findIndex((b) => b.id === board.id);
    onMove(dragging.id, target.mode === "before" ? board.id : (others[index + 1]?.id ?? null));
  };

  const row = (board: BoardRecord) => {
    const info = stats.get(board.id);
    const dropMode = drop?.boardId === board.id ? drop.mode : null;
    return (
      <li
        key={board.id}
        className="relative"
        onDragOver={(event) => onDragOver(event, board)}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null);
        }}
        onDrop={(event) => onDrop(event, board)}
      >
        {(dropMode === "before" || dropMode === "after") && (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-primary",
              dropMode === "before" ? "-top-px" : "-bottom-px",
            )}
          />
        )}
        <button
          type="button"
          draggable={!needle}
          aria-current={board.id === selectedId ? "page" : undefined}
          onClick={() => onSelect(board.id)}
          onDragStart={(event) => actions.dragBoardStart(event, board.id)}
          onDragEnd={() => {
            setDrop(null);
            actions.dragEnd();
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=page]:bg-muted",
            dropMode === "into" && "bg-primary/10 ring-2 ring-primary",
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted ring-1 ring-foreground/5">
            {info?.coverId ? (
              // eslint-disable-next-line @next/next/no-img-element -- served through an authenticated redirect, which the image optimizer can't follow
              <img src={assetUrl(info.coverId, "thumb")} alt="" draggable={false} className="size-full object-cover" />
            ) : (
              <ImagesIcon className="size-4 text-muted-foreground" aria-hidden />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{board.name}</span>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {info?.count ?? 0} {info?.count === 1 ? "item" : "items"}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <aside
      aria-label="Boards"
      className={cn(
        "sticky top-12 flex h-[calc(100svh-3rem)] w-full shrink-0 flex-col border-r bg-background md:w-72",
        className,
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b pr-2 pl-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Boards <span className="ml-1 tabular-nums">{boards.filter((board) => !board.archived).length}</span>
        </h2>
        <Button variant="ghost" size="sm" onClick={onCreate}>
          <PlusIcon data-icon="inline-start" />
          New Board
        </Button>
      </div>
      <div className="relative shrink-0 px-2 pt-2">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4.5 mt-1 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search boards"
          aria-label="Search boards"
          className="h-8 pl-7 text-sm"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">{active.map(row)}</ul>
        {needle && matches.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No boards match “{query.trim()}”.</p>
        )}
        {archived.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              aria-expanded={archivedOpen}
              onClick={() => setShowArchived((open) => !open)}
              className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <ChevronRightIcon className={cn("size-3.5 transition-transform", archivedOpen && "rotate-90")} aria-hidden />
              Archived <span className="ml-1 tabular-nums">{archived.length}</span>
            </button>
            {archivedOpen && <ul className="mt-0.5 space-y-0.5">{archived.map(row)}</ul>}
          </div>
        )}
      </div>
    </aside>
  );
}
