"use client";

import type { Editor } from "@tiptap/core";
import { cn } from "cn";
import { ArrowUpRightIcon, ImagePlusIcon, PlusIcon, XIcon } from "lucide-react";
import Link from "next/link";
import {
  memo,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DraftSaver, SaveStatus } from "@/lib/screenplay/draft-saver";
import type { ImageUploader } from "@/lib/shots/image-uploader";
import { shotLabel } from "@/lib/shots/numbering";
import type { ShotStore } from "@/lib/shots/shot-store";
import { SHOT_STATUS_LABELS, type ShotRecord } from "@/lib/shots/types";

import { STATUS_DOTS } from "../shots/cells";
import {
  imageActions,
  useIgnoreStrayFileDrops,
  type ImageActions,
  type ProjectShots,
} from "../shots/project-shots";
import {
  ImageViewer,
  pastedImage,
  ShotImg,
  UploadingOverlay,
  useImageDrop,
  useImagePicker,
  useShotImage,
} from "../shots/shot-image";
import { useSceneOutline } from "./scene-outline";

const SAVE_FAILED = new Set<SaveStatus>(["offline", "error", "conflict"]);

type Props = {
  editor: Editor | null;
  projectId: string;
  shots: ProjectShots;
  imagesEnabled: boolean;
  saver: DraftSaver;
  onClose: () => void;
  className?: string;
};

/** The shots planned for the scene the cursor is in. */
export function ShotPanel({ editor, projectId, shots, imagesEnabled, saver, onClose, className }: Props) {
  const { store, images } = shots;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { scenes, activeId } = useSceneOutline(editor);
  const scene = scenes.find((item) => item.id === activeId) ?? null;
  const sceneNumber = scene ? String(scene.number) : null;
  const sceneShots = scene ? state.shots.filter((shot) => shot.sceneId === scene.id) : [];
  const [draft, setDraft] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  useIgnoreStrayFileDrops();

  // A dialog left open shouldn't greet you when you come back to the page.
  useLayoutEffect(() => () => setViewingId(null), []);

  const actions = useMemo(
    () =>
      imageActions(shots, imagesEnabled, (shotId) => {
        const shot = store.getSnapshot().shots.find((s) => s.id === shotId);
        return shot ? shotLabel(sceneNumber, shot.suffix, shot.customLabel) : "";
      }),
    [shots, store, imagesEnabled, sceneNumber],
  );

  const addShot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const description = draft.trim();
    if (!scene || !description) return;
    const sceneId = scene.id;
    setDraft("");

    // A scene typed moments ago may not be saved yet, and shots can only belong to saved scenes.
    await saver.settle();
    const saved = store.getSnapshot().scenes.some((s) => s.id === sceneId && !s.removed);
    if (!saved && SAVE_FAILED.has(saver.currentStatus)) {
      setDraft((current) => current || description);
      toast.error("This scene hasn't been saved yet, so it can't have shots. Try again once the script saves.");
      return;
    }
    store.add(sceneId, { values: { description } });
  };

  const viewing = viewingId ? (state.shots.find((shot) => shot.id === viewingId) ?? null) : null;

  return (
    <aside
      aria-label="Shots in this scene"
      className={cn(
        "sticky top-24 h-[calc(100svh-7rem)] w-80 shrink-0 flex-col border-l bg-background",
        className,
      )}
    >
      <div className="flex items-start gap-1 pt-3 pr-2 pb-2 pl-4">
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {scene ? `Scene ${scene.number} shots` : "Shots"}
          </h2>
          {scene && (
            <p className="mt-1 truncate font-mono text-xs tracking-tight" title={scene.heading}>
              {scene.heading || <span className="font-sans text-muted-foreground italic">Untitled scene</span>}
            </p>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm">
              <Link href={`/projects/${projectId}/shots`} aria-label="Open the shot list">
                <ArrowUpRightIcon />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open the shot list</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon-sm" aria-label="Hide shots" onClick={onClose}>
          <XIcon />
        </Button>
      </div>

      {scene ? (
        <>
          <div className="flex-1 overflow-y-auto px-2">
            {sceneShots.length > 0 ? (
              <ol className="flex flex-col gap-1 pb-2">
                {sceneShots.map((shot) => (
                  <PanelShot
                    key={shot.id}
                    shot={shot}
                    label={shotLabel(sceneNumber, shot.suffix, shot.customLabel)}
                    store={store}
                    images={images}
                    actions={actions}
                    onView={setViewingId}
                  />
                ))}
              </ol>
            ) : (
              <p className="px-2 py-1 text-sm text-muted-foreground">No shots planned for this scene yet.</p>
            )}
          </div>
          <form onSubmit={addShot} className="flex gap-1.5 border-t p-3">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={`New shot for scene ${scene.number}`}
              placeholder="Describe a shot, then press Enter"
              className="h-8 text-sm"
            />
            <Button type="submit" size="icon-sm" variant="outline" aria-label="Add shot" disabled={!draft.trim()}>
              <PlusIcon />
            </Button>
          </form>
        </>
      ) : (
        <p className="px-4 py-1 text-sm text-muted-foreground">
          {scenes.length === 0
            ? "Write a scene heading, like INT. KITCHEN – NIGHT, to start planning its shots."
            : "Put the cursor in a scene to see its shots."}
        </p>
      )}

      <ImageViewer
        shot={viewing}
        label={viewing ? shotLabel(sceneNumber, viewing.suffix, viewing.customLabel) : ""}
        images={images}
        imagesEnabled={imagesEnabled}
        onUpload={actions.uploadImage}
        onRemove={actions.removeImage}
        onClose={() => setViewingId(null)}
      />
    </aside>
  );
}

type PanelShotProps = {
  shot: ShotRecord;
  label: string;
  store: ShotStore;
  images: ImageUploader;
  actions: ImageActions;
  onView: (shotId: string) => void;
};

const PanelShot = memo(function PanelShot({ shot, label, store, images, actions, onView }: PanelShotProps) {
  const { src, uploading } = useShotImage(images, shot.id, shot.imageId);
  const upload = (file: File) => actions.uploadImage(shot.id, file);
  const picker = useImagePicker(upload);
  const drop = useImageDrop(upload);
  const name = `shot ${label || "without a label"}`;
  const specs = [shot.size, shot.shotType, shot.movement, shot.lens].filter(Boolean).join(" · ");

  return (
    <li
      {...drop.props}
      aria-label={name}
      data-status={shot.status}
      onPaste={(event) => {
        const file = pastedImage(event);
        if (!file) return;
        event.preventDefault();
        upload(file);
      }}
      className={cn(
        "flex gap-2.5 rounded-md p-1.5 data-[status=omitted]:opacity-60",
        drop.over && "bg-primary/10 ring-2 ring-primary ring-inset",
      )}
    >
      {picker.input}
      <button
        type="button"
        aria-label={src ? `View image for ${name}` : `Add image for ${name}`}
        aria-busy={uploading || undefined}
        title={src ? undefined : "Click, drop or paste an image"}
        onClick={() => {
          if (uploading) return;
          if (src) onView(shot.id);
          else if (actions.requireImages()) picker.open();
        }}
        className={cn(
          "relative mt-0.5 flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1",
          src
            ? "bg-muted"
            : "border border-dashed border-muted-foreground/25 text-muted-foreground/50 hover:border-muted-foreground/50 hover:text-muted-foreground",
        )}
      >
        {src ? <ShotImg src={src} className="size-full object-cover" /> : <ImagePlusIcon className="size-4" />}
        {uploading && <UploadingOverlay />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-5 items-center gap-1.5 px-1.5">
          <span className="font-mono text-xs font-semibold">{label || "—"}</span>
          <span
            role="img"
            aria-label={SHOT_STATUS_LABELS[shot.status]}
            title={SHOT_STATUS_LABELS[shot.status]}
            className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOTS[shot.status])}
          />
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{specs}</span>
        </div>
        <textarea
          rows={1}
          value={shot.description}
          aria-label={`Description, ${name}`}
          placeholder="What we see"
          onChange={(event) => store.update(shot.id, { description: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape") event.currentTarget.blur();
          }}
          className="block w-full field-sizing-content resize-none rounded-sm bg-transparent px-1.5 py-0.5 text-sm leading-5 outline-none placeholder:text-muted-foreground/50 focus:bg-muted/50 focus:ring-2 focus:ring-ring/60"
        />
      </div>
    </li>
  );
});
