import { createContext, useContext, type DragEvent } from "react";

import type { MoodboardStore } from "@/lib/moodboards/board-store";
import type { TextStyle } from "@/lib/moodboards/types";
import type { BoardUploader } from "@/lib/moodboards/uploads";

export type Dragged = { kind: "item" | "board"; id: string };

export type DropTarget = {
  /** null = the end of the board. */
  itemId: string | null;
  side: "before" | "after";
};

/** Stable for the life of the page, so memoised cards don't re-render on every change. */
export type BoardActions = {
  store: MoodboardStore;
  uploader: BoardUploader;
  imagesEnabled: boolean;
  /** False (and says why) when image uploads aren't set up. */
  requireImages: () => boolean;
  uploadImages: (boardId: string, files: File[], beforeId?: string | null) => void;
  /** Adds an empty text box at the end and renders it. Returns its ID, for focusing. */
  addText: (boardId: string, style: TextStyle) => string | null;
  /** Opens the palette editor for a new palette (no item) or an existing one. */
  editPalette: (boardId: string, itemId?: string) => void;
  addLink: (boardId: string) => void;
  /** Resolves once the link's card is on the board. */
  pasteLink: (boardId: string, url: URL) => Promise<void>;
  addFromProject: (boardId: string) => void;
  view: (itemId: string) => void;
  duplicate: (itemId: string) => void;
  remove: (itemId: string, options?: { quiet?: boolean }) => void;
  moveTo: (itemId: string, boardId: string) => void;
  nudge: (itemId: string, direction: -1 | 1) => void;
  extractPalette: (itemId: string) => void;
  useAsCover: (itemId: string) => void;
  newShot: (itemId: string) => void;
  download: (itemId: string) => void;
  /** Focuses the item's main control, or a field in it. */
  focusItem: (itemId: string, field?: "caption" | "text") => void;
  /** The item or board being dragged, if any. */
  getDragged: () => Dragged | null;
  dragStart: (event: DragEvent<HTMLElement>, itemId: string) => void;
  dragBoardStart: (event: DragEvent<HTMLElement>, boardId: string) => void;
  dragEnd: () => void;
};

export const BoardContext = createContext<BoardActions | null>(null);

export function useBoardActions() {
  const actions = useContext(BoardContext);
  if (!actions) throw new Error("useBoardActions must be used inside a mood board.");
  return actions;
}
