"use client";

import { cn } from "cn";
import { ImagePlusIcon, LoaderCircleIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import {
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { firstImageFile, hasFiles } from "@/lib/images/prepare";
import type { ImageUploader } from "@/lib/shots/image-uploader";
import { assetUrl } from "@/lib/shots/images";
import type { ShotRecord } from "@/lib/shots/types";

import { useShotListActions } from "./context";

/** The local preview while an upload runs, then the stored thumbnail. */
export function useShotImage(images: ImageUploader, shotId: string, imageId: string | null) {
  const uploading = useSyncExternalStore(
    images.subscribe,
    () => images.getSnapshot().get(shotId),
    () => undefined,
  );
  const src = uploading ?? (imageId ? (images.previewFor(imageId) ?? assetUrl(imageId, "thumb")) : null);
  return { src, uploading: uploading !== undefined };
}

export function ShotImg({
  src,
  alt = "",
  className,
  style,
}: {
  src: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served through an authenticated redirect, which the image optimizer can't follow
    <img src={src} alt={alt} draggable={false} decoding="async" className={className} style={style} />
  );
}

/** A hidden file input and a function that opens it. */
export function useImagePicker(onFile: (file: File) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      hidden
      tabIndex={-1}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) onFile(file);
      }}
    />
  );
  return { input, open: () => inputRef.current?.click() };
}

/** Handlers that accept an image file dropped on an element, plus whether one is over it. */
export function useImageDrop(onFile: (file: File) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!hasFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!hasFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const file = firstImageFile(event.dataTransfer.files) ?? event.dataTransfer.files[0];
        if (file) onFile(file);
      },
    },
  };
}

/** An image pasted onto a shot, unless it comes with text being pasted into a text field. */
export function pastedImage(event: ClipboardEvent<HTMLElement>) {
  const file = firstImageFile(event.clipboardData.files);
  if (!file) return null;
  const target = event.target;
  const typing =
    target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type === "text");
  return typing && event.clipboardData.types.includes("text/plain") ? null : file;
}

export function UploadingOverlay() {
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-background/50">
      <LoaderCircleIcon className="size-4 animate-spin text-foreground" aria-hidden />
      <span className="sr-only">Uploading image</span>
    </span>
  );
}

/** Thumbnail in the table. Empty: opens the file picker. With an image: opens the viewer. */
export function ImageCell({ shot, name }: { shot: ShotRecord; name: string }) {
  const actions = useShotListActions();
  const { src, uploading } = useShotImage(actions.images, shot.id, shot.imageId);
  const upload = (file: File) => actions.uploadImage(shot.id, file);
  const picker = useImagePicker(upload);
  const drop = useImageDrop(upload);

  return (
    <div
      {...drop.props}
      className={cn("flex w-full items-center px-1.5 py-1", drop.over && "bg-primary/10 ring-2 ring-primary ring-inset")}
    >
      {picker.input}
      <button
        type="button"
        data-cell-control
        aria-label={src ? `View image for ${name}` : `Add image for ${name}`}
        aria-busy={uploading || undefined}
        title={src ? undefined : "Click, drop or paste an image"}
        onClick={() => {
          if (uploading) return;
          if (src) actions.viewImage(shot.id);
          else if (actions.requireImages()) picker.open();
        }}
        className={cn(
          "relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1",
          src ? "bg-muted" : "border border-dashed border-muted-foreground/25 text-muted-foreground/50 hover:border-muted-foreground/50 hover:text-muted-foreground",
        )}
      >
        {src ? <ShotImg src={src} className="size-full object-cover" /> : <ImagePlusIcon className="size-4" />}
        {uploading && <UploadingOverlay />}
      </button>
    </div>
  );
}

/** The image area of a storyboard card. */
export function ImageFrame({ shot, name }: { shot: ShotRecord; name: string }) {
  const actions = useShotListActions();
  const { src, uploading } = useShotImage(actions.images, shot.id, shot.imageId);
  const upload = (file: File) => actions.uploadImage(shot.id, file);
  const picker = useImagePicker(upload);
  const drop = useImageDrop(upload);

  return (
    <div
      {...drop.props}
      data-col="imageId"
      className={cn(
        "group/frame relative aspect-video overflow-hidden rounded-t-lg border-b bg-muted",
        drop.over && "ring-2 ring-primary ring-inset",
      )}
    >
      {picker.input}
      {src ? (
        <button
          type="button"
          aria-label={`View image for ${name}`}
          aria-busy={uploading || undefined}
          onClick={() => !uploading && actions.viewImage(shot.id)}
          className="size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
        >
          <ShotImg src={src} className="size-full object-contain" />
        </button>
      ) : (
        <button
          type="button"
          aria-label={`Add image for ${name}`}
          onClick={() => actions.requireImages() && picker.open()}
          className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground/70 transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
        >
          <ImagePlusIcon className="size-5" aria-hidden />
          <span className="text-xs">
            {actions.imagesEnabled ? "Drop, paste or click to add an image" : "Image uploads aren't set up"}
          </span>
        </button>
      )}
      {uploading && <UploadingOverlay />}
      {src && !uploading && (
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover/frame:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          {actions.imagesEnabled && (
            <Button size="icon-xs" variant="secondary" aria-label={`Replace image for ${name}`} onClick={picker.open}>
              <RefreshCwIcon />
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="secondary"
            aria-label={`Remove image for ${name}`}
            onClick={() => actions.removeImage(shot.id)}
          >
            <Trash2Icon />
          </Button>
        </div>
      )}
    </div>
  );
}

type ImageViewerProps = {
  shot: ShotRecord | null;
  label: string;
  images: ImageUploader;
  imagesEnabled: boolean;
  onUpload: (shotId: string, file: File) => void;
  onRemove: (shotId: string) => void;
  onClose: () => void;
};

/** The full-size image, with the thumbnail shown underneath while it loads. */
export function ImageViewer({ shot, label, images, imagesEnabled, onUpload, onRemove, onClose }: ImageViewerProps) {
  const imageId = shot?.imageId ?? null;
  const uploading = useSyncExternalStore(
    images.subscribe,
    () => (shot ? images.getSnapshot().get(shot.id) : undefined),
    () => undefined,
  );
  const picker = useImagePicker((file) => shot && onUpload(shot.id, file));
  const placeholder = imageId ? (images.previewFor(imageId) ?? assetUrl(imageId, "thumb")) : null;
  const src = uploading ?? (imageId ? assetUrl(imageId, "full") : null);

  return (
    <Dialog open={shot !== null && src !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{label ? `Shot ${label}` : "Shot"}</DialogTitle>
          <DialogDescription className="line-clamp-3">
            {shot?.description || "No description yet."}
          </DialogDescription>
        </DialogHeader>
        {picker.input}
        <div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {src && (
            <ShotImg
              key={src}
              src={src}
              alt={label ? `Image for shot ${label}` : "Shot image"}
              className="max-h-[70vh] w-auto bg-contain bg-center bg-no-repeat object-contain"
              style={placeholder ? { backgroundImage: `url("${placeholder}")` } : undefined}
            />
          )}
          {uploading && <UploadingOverlay />}
        </div>
        <DialogFooter>
          {imagesEnabled && (
            <Button variant="outline" disabled={Boolean(uploading)} onClick={picker.open}>
              <RefreshCwIcon data-icon="inline-start" />
              Replace
            </Button>
          )}
          <Button
            variant="outline"
            disabled={Boolean(uploading)}
            onClick={() => {
              if (shot) onRemove(shot.id);
              onClose();
            }}
          >
            <Trash2Icon data-icon="inline-start" />
            Remove
          </Button>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
