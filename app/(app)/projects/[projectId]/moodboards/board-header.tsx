"use client";

import { cn } from "cn";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SaveStatusIndicator, type SaveTone } from "@/components/save-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MoodboardSaveStatus } from "@/lib/moodboards/board-store";
import { BOARD_NAME_MAX_LENGTH, MAX_BOARD_COLUMNS, type BoardRecord } from "@/lib/moodboards/types";

import { AddMenu } from "./add-menu";

const STATUS: Record<MoodboardSaveStatus, { tone: SaveTone; label: string }> = {
  saved: { tone: "saved", label: "Saved" },
  saving: { tone: "saving", label: "Saving…" },
  offline: { tone: "warning", label: "Offline — retrying" },
  error: { tone: "error", label: "Some changes weren't saved" },
};

type Props = {
  board: BoardRecord;
  imageCount: number;
  itemCount: number;
  status: MoodboardSaveStatus;
  /** Changes when the name should be focused and selected, e.g. for a new board. */
  nameFocusRequest: number;
  onRename: (name: string) => void;
  onColumnsChange: (columns: number) => void;
  onDuplicate: () => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
  onDownloadPdf: () => void;
  onBack: () => void;
};

export function BoardHeader({
  board,
  imageCount,
  itemCount,
  status,
  nameFocusRequest,
  onRename,
  onColumnsChange,
  onDuplicate,
  onArchive,
  onDelete,
  onDownloadPdf,
  onBack,
}: Props) {
  const nameRef = useRef<HTMLInputElement>(null);
  const focusName = () => {
    nameRef.current?.focus();
    nameRef.current?.select();
  };

  // Also when the board changes: a new board is shown and asked for in the same render.
  useEffect(() => {
    if (nameFocusRequest > 0) focusName();
  }, [nameFocusRequest, board.id]);

  return (
    <div className="sticky top-12 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
      <Button variant="ghost" size="icon-sm" aria-label="All Boards" className="md:hidden" onClick={onBack}>
        <ArrowLeftIcon />
      </Button>
      <BoardName key={board.id} ref={nameRef} name={board.name} onRename={onRename} />
      {board.archived && <Badge variant="outline">Archived</Badge>}
      <p className="truncate text-sm text-muted-foreground max-lg:hidden">
        {imageCount > 0 ? (
          <>
            <span className="font-medium text-foreground tabular-nums">{imageCount}</span>{" "}
            {imageCount === 1 ? "image" : "images"}
          </>
        ) : (
          <>
            <span className="font-medium text-foreground tabular-nums">{itemCount}</span>{" "}
            {itemCount === 1 ? "item" : "items"}
          </>
        )}
      </p>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <SaveStatusIndicator status={status} {...STATUS[status]} />
        <Separator orientation="vertical" className="mx-1.5 data-vertical:h-5 data-vertical:self-auto" />
        <AddMenu boardId={board.id} />
        <div role="group" aria-label="Columns" className="flex rounded-lg border p-0.5 max-sm:hidden">
          {Array.from({ length: MAX_BOARD_COLUMNS }, (_, index) => index + 1).map((count) => (
            <Tooltip key={count}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-pressed={board.columns === count}
                  aria-label={count === 1 ? "1 Column" : `${count} Columns`}
                  onClick={() => onColumnsChange(count)}
                  className="w-6 px-0 tabular-nums aria-pressed:bg-muted aria-pressed:text-foreground"
                >
                  {count}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{count === 1 ? "1 Column" : `${count} Columns`}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Download PDF"
              disabled={itemCount === 0}
              onClick={onDownloadPdf}
            >
              <DownloadIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download PDF</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Board Actions">
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44"
            // Renaming focuses the name; the menu would take focus back to its button.
            onCloseAutoFocus={(event) => {
              if (document.activeElement === nameRef.current) event.preventDefault();
            }}
          >
            <DropdownMenuItem onSelect={() => requestAnimationFrame(focusName)}>
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <CopyIcon />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onArchive(!board.archived)}>
              {board.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {board.archived ? "Unarchive" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2Icon />
              Delete Board
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** The board's name, edited in place. Enter or leaving saves; Esc puts it back. */
function BoardName({
  ref,
  name,
  onRename,
}: {
  ref: React.Ref<HTMLInputElement>;
  name: string;
  onRename: (name: string) => void;
}) {
  // null while not editing, so a rename from elsewhere shows.
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  return (
    <input
      ref={ref}
      value={draft ?? name}
      aria-label="Board Name"
      maxLength={BOARD_NAME_MAX_LENGTH}
      spellCheck={false}
      onFocus={() => setDraft(name)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft?.trim();
        setDraft(null);
        if (cancelled.current) cancelled.current = false;
        else if (next && next !== name) onRename(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "field-sizing-content min-w-12 max-w-[min(24rem,50vw)] truncate rounded-md bg-transparent px-1.5 py-1 text-sm font-medium outline-none",
        "hover:bg-muted focus:bg-background focus:ring-2 focus:ring-ring/60",
      )}
    />
  );
}
