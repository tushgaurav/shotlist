import { createContext, useContext, type DragEvent } from "react";

import type { ShotStore } from "@/lib/shots/shot-store";
import type { ShotScene } from "@/lib/shots/types";

export type DropTarget = {
  groupKey: string;
  /** null = the end of the group. */
  shotId: string | null;
  side: "before" | "after";
};

/** Stable for the life of the shot list, so memoised rows don't re-render on every change. */
export type ShotListActions = {
  store: ShotStore;
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
  dragStart: (event: DragEvent<HTMLElement>, shotId: string) => void;
  dragEnd: () => void;
  dragOver: (event: DragEvent<HTMLElement>, groupKey: string, shotId: string | null) => void;
  drop: (event: DragEvent<HTMLElement>) => void;
};

export const ShotListContext = createContext<ShotListActions | null>(null);

export function useShotListActions() {
  const actions = useContext(ShotListContext);
  if (!actions) throw new Error("useShotListActions must be used inside the shot list.");
  return actions;
}
