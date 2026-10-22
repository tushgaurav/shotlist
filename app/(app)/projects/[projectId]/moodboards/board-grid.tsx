"use client";

import { cn } from "cn";
import { ImagesIcon, PlusIcon } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { hasFiles } from "@/lib/images/prepare";
import { layoutBoard, visibleColumns } from "@/lib/moodboards/layout";
import {
  compareOrdered,
  textContent,
  videoContent,
  type BoardItem,
  type BoardRecord,
  type TextStyle,
} from "@/lib/moodboards/types";
import type { BoardUpload } from "@/lib/moodboards/uploads";
import { videoAspect } from "@/lib/moodboards/video-links";

import { AddMenu } from "./add-menu";
import { ItemCard, UploadCard } from "./board-items";
import { useBoardActions, type DropTarget } from "./context";

/** Space between items, in CSS pixels (Tailwind's gap-3). */
const GAP = 12;

const TEXT_HEIGHTS: Record<TextStyle, number> = { title: 48, heading: 36, body: 32, quote: 40 };
const CAPTION_HEIGHT = 26;

type Entry = { kind: "item"; item: BoardItem } | { kind: "upload"; upload: BoardUpload };

const entryId = (entry: Entry) => (entry.kind === "item" ? entry.item.id : entry.upload.id);
const entryPosition = (entry: Entry) => (entry.kind === "item" ? entry.item.position : entry.upload.position);

/** A height to lay out with until the card has been drawn and measured. */
function estimateHeight(entry: Entry, width: number) {
  if (entry.kind === "upload") {
    const { width: w, height: h } = entry.upload;
    return w && h ? (width * h) / w : width;
  }
  const { item } = entry;
  const caption = item.caption ? CAPTION_HEIGHT : 0;
  switch (item.kind) {
    case "image":
      return (item.width && item.height ? (width * item.height) / item.width : width) + caption;
    case "text":
      return TEXT_HEIGHTS[textContent(item)!.style];
    case "palette":
      return 80 + caption;
    case "video_link": {
      const video = videoContent(item)!;
      return (video.provider ? width / videoAspect(video) + 40 : 64) + caption;
    }
  }
}

/**
 * The container's width and every card's height, kept up to date. Cards are found by their
 * `data-measure-id`; their heights don't depend on which column they're in, so laying out
 * again with them can't change them.
 */
function useMeasurements(containerRef: RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState<number | null>(null);
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  const observerRef = useRef<ResizeObserver | null>(null);
  const observed = useRef(new Set<Element>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const tracked = observed.current;
    const observer = new ResizeObserver((entries) => {
      setHeights((current) => {
        let next: Record<string, number> = current;
        for (const entry of entries) {
          if (entry.target === container) continue;
          const id = (entry.target as HTMLElement).dataset.measureId;
          const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
          if (!id || Math.abs((current[id] ?? -1) - height) < 0.5) continue;
          if (next === current) next = { ...current };
          next[id] = height;
        }
        return next;
      });
      for (const entry of entries) {
        if (entry.target === container) setWidth(entry.contentRect.width);
      }
    });
    observerRef.current = observer;
    observer.observe(container);
    setWidth(container.clientWidth);
    return () => {
      observer.disconnect();
      observerRef.current = null;
      tracked.clear();
    };
  }, [containerRef]);

  // After every render: watch new cards, let go of ones that are gone (moving a card to
  // another column makes a new element).
  useLayoutEffect(() => {
    const observer = observerRef.current;
    const container = containerRef.current;
    if (!observer || !container) return;
    for (const element of observed.current) {
      if (element.isConnected) continue;
      observer.unobserve(element);
      observed.current.delete(element);
    }
    for (const element of container.querySelectorAll("[data-measure-id]")) {
      if (observed.current.has(element)) continue;
      observer.observe(element);
      observed.current.add(element);
    }
  });

  return { width, heights };
}

export function BoardGrid({
  board,
  items,
  uploads,
  otherBoards,
  draggingId,
}: {
  board: BoardRecord;
  /** The board's items, in order. */
  items: BoardItem[];
  uploads: readonly BoardUpload[];
  otherBoards: { id: string; name: string }[];
  draggingId: string | null;
}) {
  const actions = useBoardActions();
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, heights } = useMeasurements(containerRef);
  const dropRef = useRef<DropTarget | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [filesOver, setFilesOver] = useState(false);

  const columns = width === null ? board.columns : visibleColumns(board.columns, width, GAP);
  const columnWidth = width === null ? 240 : (width - GAP * (columns - 1)) / columns;

  const entries = useMemo(() => {
    const itemIds = new Set(items.map((item) => item.id));
    const all: Entry[] = [
      ...items.map((item) => ({ kind: "item" as const, item })),
      // A finished upload is an item by now, under the same ID.
      ...uploads
        .filter((upload) => upload.boardId === board.id && !itemIds.has(upload.id))
        .map((upload) => ({ kind: "upload" as const, upload })),
    ];
    return new Map(
      all
        .map((entry) => ({ entry, id: entryId(entry), position: entryPosition(entry) }))
        .sort(compareOrdered)
        .map(({ entry, id }) => [id, entry]),
    );
  }, [items, uploads, board.id]);

  const bands = useMemo(
    () =>
      layoutBoard(
        [...entries].map(([id, entry]) => ({
          id,
          wide: entry.kind === "item" && entry.item.wide,
          height: heights[id] ?? estimateHeight(entry, columnWidth),
        })),
        columns,
        GAP,
      ),
    [entries, heights, columnWidth, columns],
  );

  const setTarget = (next: DropTarget | null) => {
    const current = dropRef.current;
    if (current?.itemId === next?.itemId && current?.side === next?.side) return;
    dropRef.current = next;
    setDropTarget(next);
  };
  const clearDrop = () => {
    setTarget(null);
    setFilesOver(false);
  };

  /** The item a drop lands before; null for the end. */
  const beforeId = (target: DropTarget | null, movingId: string | null) => {
    if (!target?.itemId) return null;
    const others = items.filter((item) => item.id !== movingId);
    const index = others.findIndex((item) => item.id === target.itemId);
    if (index < 0) return null;
    return target.side === "before" ? others[index].id : (others[index + 1]?.id ?? null);
  };

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    const dragging = actions.getDragged();
    const files = hasFiles(event.dataTransfer);
    if (dragging?.kind !== "item" && !files) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = files ? "copy" : "move";
    if (files) setFilesOver(true);

    const target = event.target as Element;
    const card = target.closest<HTMLElement>("[data-item-id]");
    if (card) {
      if (card.dataset.itemId === dragging?.id) return;
      const rect = card.getBoundingClientRect();
      setTarget({ itemId: card.dataset.itemId!, side: event.clientY > rect.top + rect.height / 2 ? "after" : "before" });
    } else if (!target.closest("[data-band]")) {
      // Between items, the last target stays; below them, the drop goes at the end.
      setTarget({ itemId: null, side: "before" });
    }
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    const dragging = actions.getDragged();
    const files = hasFiles(event.dataTransfer);
    if (dragging?.kind !== "item" && !files) return;
    event.preventDefault();
    const target = dropRef.current;
    clearDrop();
    if (files) {
      if (actions.requireImages()) actions.uploadImages(board.id, [...event.dataTransfer.files], beforeId(target, null));
      return;
    }
    actions.dragEnd();
    actions.store.moveItem(dragging!.id, board.id, beforeId(target, dragging!.id));
  };

  const renderEntry = (id: string, cardWidth: number) => {
    const entry = entries.get(id)!;
    if (entry.kind === "upload") return <UploadCard key={id} upload={entry.upload} width={cardWidth} />;
    return (
      <ItemCard
        key={id}
        item={entry.item}
        otherBoards={otherBoards}
        width={cardWidth}
        dropSide={dropTarget?.itemId === id ? dropTarget.side : null}
        dragging={draggingId === id}
      />
    );
  };

  const empty = entries.size === 0;

  return (
    <div
      role="region"
      aria-label={`Board ${board.name}`}
      className={cn(
        "relative flex flex-1 flex-col bg-muted/40 p-3 pb-24 sm:p-5 sm:pb-24",
        filesOver && "ring-2 ring-primary ring-inset",
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearDrop();
      }}
      onDragEnd={clearDrop}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey) return;
        if (!event.altKey || event.shiftKey) return;
        const direction =
          event.key === "ArrowUp" || event.key === "ArrowLeft"
            ? -1
            : event.key === "ArrowDown" || event.key === "ArrowRight"
              ? 1
              : 0;
        const card = (event.target as HTMLElement).closest<HTMLElement>("[data-item-id]");
        if (!direction || !card) return;
        event.preventDefault();
        actions.nudge(card.dataset.itemId!, direction);
      }}
    >
      <div ref={containerRef} className="flex flex-col gap-3">
        {bands.map((band) =>
          band.kind === "wide" ? (
            <div key={band.key} data-band>
              {renderEntry(band.id, width ?? columnWidth)}
            </div>
          ) : (
            <div key={band.key} data-band className="flex items-start gap-3">
              {band.columns.map((column, index) => (
                <div key={index} className="flex min-w-0 flex-1 flex-col gap-3">
                  {column.map((id) => renderEntry(id, columnWidth))}
                </div>
              ))}
            </div>
          ),
        )}
        {!empty && dropTarget?.itemId === null && <div aria-hidden className="h-0.5 rounded-full bg-primary" />}
      </div>

      {empty && (
        <EmptyState
          icon={ImagesIcon}
          title="Start the Board"
          description={
            actions.imagesEnabled
              ? "Drop or paste images here, or add text, color palettes and video links."
              : "Add text, color palettes and video links. Image uploads aren't set up on this server yet."
          }
        >
          <AddMenu
            boardId={board.id}
            trigger={
              <Button>
                <PlusIcon data-icon="inline-start" />
                Add to Board
              </Button>
            }
          />
        </EmptyState>
      )}
    </div>
  );
}
