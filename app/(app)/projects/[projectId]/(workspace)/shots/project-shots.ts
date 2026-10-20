import { useEffect, useState } from "react";
import { toast } from "sonner";

import { newId } from "@/lib/id";
import { ImageTooLargeError, prepareImage } from "@/lib/images/prepare";
import { IMAGE_ERRORS, sendForm } from "@/lib/images/upload";
import { ImageUploader, type ImageUploadApi } from "@/lib/shots/image-uploader";
import { ShotStore, type ShotApi } from "@/lib/shots/shot-store";
import type { ShotListData, ShotMutationError } from "@/lib/shots/types";

import {
  confirmImageUploadAction,
  createShotAction,
  deleteShotAction,
  markSceneReviewedAction,
  moveShotAction,
  renumberSceneAction,
  restoreShotAction,
  startImageUploadAction,
  updateShotsAction,
} from "./actions";

const SAVE_ERRORS: Record<ShotMutationError | "offline", string> = {
  offline: "Couldn't reach the server. Your edits will be retried.",
  unauthorized: "You've been signed out. Sign in again to keep editing.",
  not_found: "A change couldn't be saved. Reload to see the latest shot list.",
  invalid: "A change couldn't be saved. Reload to see the latest shot list.",
};

function shotApi(projectId: string): ShotApi {
  return {
    create: (input) => createShotAction(projectId, input),
    update: (changes) => updateShotsAction(projectId, changes),
    move: (input) => moveShotAction(projectId, input),
    remove: (id) => deleteShotAction(projectId, id),
    restore: (id) => restoreShotAction(projectId, id),
    renumber: (sceneId) => renumberSceneAction(projectId, sceneId),
    markReviewed: (sceneId) => markSceneReviewedAction(projectId, sceneId),
  };
}

function imageApi(projectId: string): ImageUploadApi {
  return {
    start: (contentType) => startImageUploadAction(projectId, contentType),
    send: sendForm,
    confirm: (input) => confirmImageUploadAction(projectId, input),
  };
}

export type ProjectShots = { store: ShotStore; images: ImageUploader };

function create(projectId: string, data: ShotListData): ProjectShots {
  const store = new ShotStore(shotApi(projectId), data, {
    createId: newId,
    onError: (error) => toast.error(SAVE_ERRORS[error], { id: "shot-save-error" }),
  });
  const images = new ImageUploader(imageApi(projectId), store, {
    prepare: prepareImage,
    isTooLarge: (error) => error instanceof ImageTooLargeError,
    onError: (error) => toast.error(IMAGE_ERRORS[error], { id: "image-upload-error" }),
    createPreview: (blob) => URL.createObjectURL(blob),
    revokePreview: (url) => URL.revokeObjectURL(url),
  });
  return { store, images };
}

const loaded = new Map<string, ProjectShots>();

/**
 * The project's shots for the rest of the visit. The shot list and the script page can both
 * be mounted (one hidden), so they share one store and never show each other stale data.
 */
export function useProjectShots(projectId: string, data: ShotListData): ProjectShots {
  const [shots] = useState(() => {
    // Never shared on the server, where one module instance serves every user.
    if (typeof window === "undefined") return create(projectId, data);
    let existing = loaded.get(projectId);
    if (!existing) {
      existing = create(projectId, data);
      loaded.set(projectId, existing);
    }
    return existing;
  });

  // Pages stay mounted after navigating away, so take fresh data when they're shown again.
  useEffect(() => shots.store.receive(data), [shots, data]);

  useEffect(() => {
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (!shots.store.hasUnsavedChanges && !shots.images.busy) return;
      shots.store.flush();
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnIfUnsaved);
    return () => {
      window.removeEventListener("beforeunload", warnIfUnsaved);
      shots.store.flush();
    };
  }, [shots]);

  return shots;
}

export type ImageActions = {
  /** False (and says why) when image uploads aren't set up. */
  requireImages: () => boolean;
  uploadImage: (shotId: string, file: File) => void;
  removeImage: (shotId: string) => void;
};

export function imageActions(
  { store, images }: ProjectShots,
  enabled: boolean,
  labelOf: (shotId: string) => string,
): ImageActions {
  const requireImages = () => {
    if (!enabled) toast.error(IMAGE_ERRORS.unavailable, { id: "image-upload-error" });
    return enabled;
  };
  return {
    requireImages,
    uploadImage: (shotId, file) => {
      if (requireImages()) void images.upload(shotId, file);
    },
    removeImage: (shotId) => {
      const previous = store.getSnapshot().shots.find((shot) => shot.id === shotId)?.imageId;
      if (!previous) return;
      store.update(shotId, { imageId: null });
      const label = labelOf(shotId);
      toast(label ? `Removed the image from shot ${label}` : "Removed the image", {
        action: { label: "Undo", onClick: () => store.update(shotId, { imageId: previous }) },
      });
    },
  };
}

/** Files dropped outside a drop zone would otherwise replace the page with the file. */
export function useIgnoreStrayFileDrops() {
  useEffect(() => {
    const ignore = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files") || event.defaultPrevented) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", ignore);
    window.addEventListener("drop", ignore);
    return () => {
      window.removeEventListener("dragover", ignore);
      window.removeEventListener("drop", ignore);
    };
  }, []);
}
