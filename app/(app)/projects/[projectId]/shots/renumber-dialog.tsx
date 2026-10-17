"use client";

import { ArrowRightIcon } from "lucide-react";

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
import { shotLabel, suffixAt } from "@/lib/shots/numbering";
import type { ShotRecord, ShotScene } from "@/lib/shots/types";

const PREVIEW_LIMIT = 8;

export function RenumberDialog({
  scene,
  shots,
  onClose,
  onConfirm,
}: {
  scene: ShotScene | null;
  shots: ShotRecord[];
  onClose: () => void;
  onConfirm: (scene: ShotScene) => void;
}) {
  const changes = scene
    ? shots
        .filter((shot) => shot.sceneId === scene.id)
        .map((shot, index) => ({
          id: shot.id,
          from: shotLabel(scene.number, shot.suffix, null),
          to: shotLabel(scene.number, suffixAt(index), null),
        }))
        .filter((change) => change.from !== change.to)
    : [];

  return (
    <Dialog open={scene !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renumber shots in scene {scene?.number}?</DialogTitle>
          <DialogDescription>
            Shots get letters A, B, C… in their current order. Slates and notes that use the old
            labels won&apos;t match anymore.
          </DialogDescription>
        </DialogHeader>

        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">The labels already follow the shot order.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm" aria-label="Label changes">
            {changes.slice(0, PREVIEW_LIMIT).map((change) => (
              <li key={change.id} className="flex items-center gap-2">
                <span className="text-muted-foreground">{change.from}</span>
                <ArrowRightIcon className="size-3.5 text-muted-foreground" aria-label="becomes" />
                <span className="font-semibold">{change.to}</span>
              </li>
            ))}
            {changes.length > PREVIEW_LIMIT && (
              <li className="col-span-2 font-sans text-muted-foreground">
                and {changes.length - PREVIEW_LIMIT} more
              </li>
            )}
          </ul>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={changes.length === 0} onClick={() => scene && onConfirm(scene)}>
            Renumber
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
