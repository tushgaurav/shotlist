"use client";

import { cn } from "cn";
import { CheckIcon, ImagesIcon } from "lucide-react";
import { useState } from "react";

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
import type { ProjectImage } from "@/lib/moodboards/types";
import { assetUrl } from "@/lib/shots/images";

/** Picks images already in the project (shot images, the header image, other boards). */
export function ProjectImagesDialog({
  open,
  images,
  onBoard,
  onAdd,
  onClose,
}: {
  open: boolean;
  images: ProjectImage[];
  /** Images already on the board being added to. */
  onBoard: ReadonlySet<string>;
  onAdd: (images: ProjectImage[]) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        {open && <Picker images={images} onBoard={onBoard} onAdd={onAdd} />}
      </DialogContent>
    </Dialog>
  );
}

function Picker({
  images,
  onBoard,
  onAdd,
}: {
  images: ProjectImage[];
  onBoard: ReadonlySet<string>;
  onAdd: (images: ProjectImage[]) => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Images from This Project</DialogTitle>
        <DialogDescription>
          Shot images, the header image and images on other boards. Pick any to add them to the board.
        </DialogDescription>
      </DialogHeader>
      {images.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          <ImagesIcon className="size-5" aria-hidden />
          No images in this project yet.
        </div>
      ) : (
        <ul className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto p-0.5 sm:grid-cols-4 md:grid-cols-5">
          {images.map((image) => {
            const isSelected = selected.has(image.id);
            return (
              <li key={image.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={onBoard.has(image.id) ? "Image, already on this board" : "Image"}
                  onClick={() => toggle(image.id)}
                  className={cn(
                    "relative block aspect-square w-full overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    isSelected && "ring-2 ring-primary",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- served through an authenticated redirect, which the image optimizer can't follow */}
                  <img
                    src={assetUrl(image.id, "thumb")}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={cn("size-full object-cover", onBoard.has(image.id) && !isSelected && "opacity-50")}
                  />
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <CheckIcon className="size-3.5" aria-hidden />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button
          disabled={selected.size === 0}
          onClick={() => onAdd(images.filter((image) => selected.has(image.id)))}
        >
          {selected.size > 1 ? `Add ${selected.size} Images` : "Add Image"}
        </Button>
      </DialogFooter>
    </>
  );
}
