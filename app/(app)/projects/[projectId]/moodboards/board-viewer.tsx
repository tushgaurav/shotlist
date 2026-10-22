"use client";

import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ExternalLinkIcon } from "lucide-react";

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
import { videoContent, type BoardItem } from "@/lib/moodboards/types";
import type { BoardUploader } from "@/lib/moodboards/uploads";
import { embedUrl, parseLink, parseVideo, PROVIDER_NAMES, videoAspect } from "@/lib/moodboards/video-links";
import { assetUrl } from "@/lib/shots/images";

/** Images and videos that can be shown in the viewer. */
export function isViewable(item: BoardItem) {
  return item.kind === "image" || (item.kind === "video_link" && videoContent(item)?.provider != null);
}

/** One image or video at a time, with arrows to the board's others. */
export function BoardViewer({
  item,
  items,
  uploader,
  onNavigate,
  onDownload,
  onClose,
}: {
  item: BoardItem | null;
  /** The board's viewable items, in order. */
  items: BoardItem[];
  uploader: BoardUploader;
  onNavigate: (itemId: string) => void;
  onDownload: (itemId: string) => void;
  onClose: () => void;
}) {
  const index = item ? items.findIndex((i) => i.id === item.id) : -1;
  const previous = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
  const video = item ? videoContent(item) : null;
  const url = video ? parseLink(video.url) : null;
  const parsed = url ? parseVideo(url) : null;
  const title = item?.caption || video?.title || (item?.kind === "image" ? "Image" : "Video");

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-5xl"
        onKeyDown={(event) => {
          if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
          if (event.key === "ArrowLeft" && previous) onNavigate(previous.id);
          if (event.key === "ArrowRight" && next) onNavigate(next.id);
        }}
      >
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{title}</DialogTitle>
          <DialogDescription className={item?.caption && video?.title ? "line-clamp-2" : "sr-only"}>
            {item?.caption && video?.title ? video.title : `${index + 1} of ${items.length}`}
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {item?.kind === "image" && item.assetId && (
            // eslint-disable-next-line @next/next/no-img-element -- served through an authenticated redirect, which the image optimizer can't follow
            <img
              key={item.id}
              src={assetUrl(item.assetId, "full")}
              alt={item.caption ?? ""}
              className="max-h-[70vh] w-auto bg-contain bg-center bg-no-repeat object-contain"
              style={{
                backgroundImage: `url("${uploader.previewFor(item.assetId) ?? assetUrl(item.assetId, "thumb")}")`,
              }}
            />
          )}
          {video && parsed && (
            <iframe
              key={item!.id}
              src={embedUrl(parsed)}
              title={video.title ?? `${PROVIDER_NAMES[parsed.provider]} video`}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              className="max-h-[70vh] w-full border-0"
              style={{ aspectRatio: videoAspect(video), maxWidth: `calc(70vh * ${videoAspect(video)})` }}
            />
          )}
          {previous && (
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous"
              className="absolute left-2 shadow-sm"
              onClick={() => onNavigate(previous.id)}
            >
              <ChevronLeftIcon />
            </Button>
          )}
          {next && (
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next"
              className="absolute right-2 shadow-sm"
              onClick={() => onNavigate(next.id)}
            >
              <ChevronRightIcon />
            </Button>
          )}
        </div>

        <DialogFooter className="sm:items-center">
          {items.length > 1 && (
            <p className="mr-auto text-xs text-muted-foreground tabular-nums max-sm:hidden">
              {index + 1} of {items.length}
            </p>
          )}
          {item?.kind === "image" && (
            <Button variant="outline" onClick={() => onDownload(item.id)}>
              <DownloadIcon data-icon="inline-start" />
              Download
            </Button>
          )}
          {video && (
            <Button variant="outline" asChild>
              <a href={video.url} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon data-icon="inline-start" />
                Open on {parsed ? PROVIDER_NAMES[parsed.provider] : "Site"}
              </a>
            </Button>
          )}
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
