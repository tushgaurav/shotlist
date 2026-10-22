import { useEffect, useState } from "react";
import { toast } from "sonner";

import { newId } from "@/lib/id";
import { ImageTooLargeError, prepareImage } from "@/lib/images/prepare";
import { IMAGE_ERRORS, sendForm } from "@/lib/images/upload";
import { MoodboardStore, type MoodboardApi } from "@/lib/moodboards/board-store";
import type { MoodboardData, MoodboardMutationError, VideoLinkContent } from "@/lib/moodboards/types";
import { BoardUploader } from "@/lib/moodboards/uploads";
import { basicVideoContent } from "@/lib/moodboards/video-links";
import type { ImageUploadApi } from "@/lib/shots/image-uploader";

import {
  confirmBoardImageUploadAction,
  createBoardAction,
  createItemAction,
  deleteBoardAction,
  deleteItemAction,
  duplicateBoardAction,
  moveItemAction,
  restoreBoardAction,
  restoreItemAction,
  startBoardImageUploadAction,
  updateBoardAction,
  updateItemsAction,
} from "./actions";

const SAVE_ERRORS: Record<MoodboardMutationError | "offline", string> = {
  offline: "Couldn't reach the server. Your changes will be retried.",
  unauthorized: "You've been signed out. Sign in again to keep editing.",
  not_found: "A change couldn't be saved. Reload to see the latest boards.",
  invalid: "A change couldn't be saved. Reload to see the latest boards.",
};

function boardApi(projectId: string): MoodboardApi {
  return {
    createBoard: (input) => createBoardAction(projectId, input),
    updateBoard: (id, patch) => updateBoardAction(projectId, id, patch),
    removeBoard: (id) => deleteBoardAction(projectId, id),
    restoreBoard: (id) => restoreBoardAction(projectId, id),
    duplicateBoard: (input) => duplicateBoardAction(projectId, input),
    createItem: (input) => createItemAction(projectId, input),
    updateItems: (changes) => updateItemsAction(projectId, changes),
    moveItem: (input) => moveItemAction(projectId, input),
    removeItem: (id) => deleteItemAction(projectId, id),
    restoreItem: (id) => restoreItemAction(projectId, id),
  };
}

function imageApi(projectId: string): ImageUploadApi {
  return {
    start: (contentType) => startBoardImageUploadAction(projectId, contentType),
    send: sendForm,
    confirm: (input) => confirmBoardImageUploadAction(projectId, input),
  };
}

export type ProjectBoards = { store: MoodboardStore; uploader: BoardUploader };

function create(projectId: string, data: MoodboardData): ProjectBoards {
  const store = new MoodboardStore(boardApi(projectId), data, {
    createId: newId,
    onError: (error) => toast.error(SAVE_ERRORS[error], { id: "moodboard-save-error" }),
  });
  const uploader = new BoardUploader(imageApi(projectId), store, {
    createId: newId,
    prepare: prepareImage,
    isTooLarge: (error) => error instanceof ImageTooLargeError,
    onError: (error) => toast.error(IMAGE_ERRORS[error], { id: "image-upload-error" }),
    createPreview: (blob) => URL.createObjectURL(blob),
    revokePreview: (url) => URL.revokeObjectURL(url),
  });
  return { store, uploader };
}

const loaded = new Map<string, ProjectBoards>();

/**
 * The project's boards for the rest of the visit. The page stays mounted, hidden, after
 * navigating away, and is handed fresh data when shown again; the store takes it unless
 * changes are still waiting to save.
 */
export function useProjectBoards(projectId: string, data: MoodboardData): ProjectBoards {
  const [boards] = useState(() => {
    // Never shared on the server, where one module instance serves every user.
    if (typeof window === "undefined") return create(projectId, data);
    let existing = loaded.get(projectId);
    if (!existing) {
      existing = create(projectId, data);
      loaded.set(projectId, existing);
    }
    return existing;
  });

  useEffect(() => boards.store.receive(data), [boards, data]);

  useEffect(() => {
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (!boards.store.hasUnsavedChanges && !boards.uploader.busy) return;
      boards.store.flush();
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnIfUnsaved);
    return () => {
      window.removeEventListener("beforeunload", warnIfUnsaved);
      boards.store.flush();
    };
  }, [boards]);

  return boards;
}

/** A link's card details from the server, or what the URL alone says if it can't be reached. */
export async function lookupLink(url: URL): Promise<VideoLinkContent> {
  try {
    const response = await fetch(`/api/video-links?url=${encodeURIComponent(url.toString())}`);
    if (response.ok) return (await response.json()) as VideoLinkContent;
  } catch {
    // Offline: the card can be made from the URL.
  }
  return basicVideoContent(url);
}
