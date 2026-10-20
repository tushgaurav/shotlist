import { createContext, useContext, type DragEvent } from "react";

import type { ImageUploader } from "@/lib/shots/image-uploader";
import type { ShotStore } from "@/lib/shots/shot-store";
import type { ShotScene } from "@/lib/shots/types";

import type { ImageActions } from "./project-shots";

export type DropTarget = {
  groupKey: string;
  /** null = the end of the group. */
  shotId: string | null;
  side: "before" | "after";
};

/** Stable for the life of the shot list, so memoised rows don't re-render on every change. */
export type ShotListActions = ImageActions & {
  store: ShotStore;
  images: ImageUploader;
  imagesEnabled: boolean;
  /** The add actions render the new row before returning its ID, but don't focus it. */
  add: (sceneId: string | null) => string;
  addAfter: (shotId: string) => string | null;
  duplicate: (shotId: string) => string | null;
  focusShot: (shotId: string | null, field?: string) => void;
  remove: (shotId: string) => void;
  moveTo: (shotId: string, sceneId: string | null) => void;
  nudge: (shotId: string, direction: -1 | 1, field?: string) => void;
  markReviewed: (sceneId: string) => void;
  requestRenumber: (scene: ShotScene) => void;
  viewImage: (shotId: string) => void;
  dragStart: (event: DragEvent<HTMLElement>, shotId: string) => void;
  dragEnd: () => void;
  /** Rows split before/after by height, storyboard cards by width. */
  dragOver: (event: DragEvent<HTMLElement>, groupKey: string, shotId: string | null, axis?: "x" | "y") => void;
  drop: (event: DragEvent<HTMLElement>) => void;
};

export const ShotListContext = createContext<ShotListActions | null>(null);

export function useShotListActions() {
  const actions = useContext(ShotListContext);
  if (!actions) throw new Error("useShotListActions must be used inside the shot list.");
  return actions;
}
