"use client";

import { useObject } from "@ai-sdk/react";
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, FilmIcon, PlusIcon, RotateCwIcon, Trash2Icon } from "lucide-react";
import { nanoid } from "nanoid";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { outlineOutputSchema, type OutlineScene } from "@/lib/ai/schema";

import { DetailsChip } from "./details-chip";
import { ModelSelect } from "./model-select";
import { useAiModel, useProjectDetails } from "./use-ai-model";
import type { AiWriter } from "./use-ai-writer";

type Scene = OutlineScene & { key: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  writer: AiWriter;
  projectId: string;
  details: string[];
  targetRuntimeMinutes: number | null;
  /** The script already has lines, so the draft goes after them. */
  appending: boolean;
};

export function DraftDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(52rem,calc(100svh-2rem))] flex-col gap-0 p-0 sm:max-w-2xl">
        {open && <DraftFlow {...props} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function toScenes(raw: unknown): Scene[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { heading, summary, estimatedPages } = item as Partial<OutlineScene>;
    if (typeof heading !== "string" || !heading.trim()) return [];
    return {
      key: nanoid(),
      heading: heading.trim().slice(0, 200),
      summary: typeof summary === "string" ? summary.trim().slice(0, 2000) : "",
      estimatedPages: typeof estimatedPages === "number" ? Math.min(Math.max(estimatedPages, 0), 30) : 1,
    };
  });
}

function pagesLabel(pages: number) {
  const rounded = Math.round(pages * 2) / 2;
  return `${rounded} page${rounded === 1 ? "" : "s"}`;
}

function DraftFlow({
  writer,
  projectId,
  details,
  targetRuntimeMinutes,
  appending,
  onClose,
}: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
  const [model] = useAiModel();
  const [projectDetails] = useProjectDetails();
  const [step, setStep] = useState<"brief" | "plan">("brief");
  const [direction, setDirection] = useState("");
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const latest = useRef<unknown>(undefined);

  const outline = useObject({
    api: `/api/projects/${projectId}/ai/outline`,
    schema: outlineOutputSchema,
    onFinish: ({ object }) => {
      const planned = toScenes(object?.scenes ?? latest.current);
      if (planned.length === 0) setFailed("The AI didn't come back with any scenes. Try again, maybe with some direction.");
      setScenes(planned);
    },
    onError: (error) => {
      setFailed(error.message || "Couldn't plan the scenes. Try again.");
      const partial = toScenes(latest.current);
      if (partial.length > 0) setScenes(partial);
    },
  });

  useEffect(() => {
    latest.current = outline.object?.scenes;
  }, [outline.object]);

  const { stop } = outline;
  useEffect(() => () => stop(), [stop]);

  const plan = () => {
    setStep("plan");
    setScenes(null);
    setFailed(null);
    outline.submit({ model, projectDetails, direction });
  };

  const update = (key: string, patch: Partial<OutlineScene>) =>
    setScenes((current) => current?.map((scene) => (scene.key === key ? { ...scene, ...patch } : scene)) ?? null);

  const move = (index: number, by: number) =>
    setScenes((current) => {
      if (!current) return current;
      const next = [...current];
      const [scene] = next.splice(index, 1);
      next.splice(index + by, 0, scene);
      return next;
    });

  const write = () => {
    const ready = (scenes ?? []).filter((scene) => scene.heading.trim());
    if (ready.length === 0) return;
    onClose();
    void writer.draft(
      ready.map(({ heading, summary, estimatedPages }) => ({ heading, summary, estimatedPages })),
      direction.trim(),
    );
  };

  if (step === "brief") {
    return (
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          plan();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilmIcon className="size-4 text-primary" />
            Draft from your project details
          </DialogTitle>
          <DialogDescription>
            The AI plans the scenes first. You can change the plan before anything is written
            {appending ? ", and the draft goes after what you've already written." : "."}
          </DialogDescription>
        </DialogHeader>

        {details.length === 0 && (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
            This project has no details yet, so the AI will have to improvise.{" "}
            <Link href={`/projects/${projectId}/details`} className="font-medium text-foreground underline-offset-4 hover:underline">
              Add a logline and synopsis
            </Link>{" "}
            for a draft that&rsquo;s more yours.
          </p>
        )}

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Direction <span className="sr-only">(optional)</span>
          <Textarea
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
            maxLength={4000}
            rows={3}
            autoFocus
            placeholder="Optional. e.g. Open on the funeral. Keep it under ten pages. End on an open question."
            className="font-normal"
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                plan();
              }
            }}
          />
        </label>

        <DialogFooter className="items-center sm:justify-between">
          <div className="flex items-center gap-1">
            <ModelSelect />
            <DetailsChip details={details} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Plan scenes</Button>
          </div>
        </DialogFooter>
      </form>
    );
  }

  const streaming = outline.isLoading;
  const shown: (Partial<OutlineScene> & { key: string })[] =
    scenes ?? toScenes(outline.object?.scenes).map((scene, index) => ({ ...scene, key: String(index) }));
  const total = shown.reduce((sum, scene) => sum + (scene.estimatedPages ?? 0), 0);

  return (
    <>
      <DialogHeader className="border-b px-6 pt-6 pb-4">
        <DialogTitle>{streaming ? "Planning scenes…" : "The plan"}</DialogTitle>
        <DialogDescription>
          {shown.length > 0
            ? `${shown.length} scene${shown.length === 1 ? "" : "s"}, about ${pagesLabel(total)}${
                targetRuntimeMinutes ? ` for a ${targetRuntimeMinutes}-minute target` : ""
              }. Edit, reorder or remove scenes, then write the draft.`
            : "Working out the shape of the story."}
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4" aria-busy={streaming}>
        <ol className="flex flex-col gap-3">
          {shown.map((scene, index) =>
            scenes ? (
              <li key={scene.key} className="group flex gap-3 rounded-lg border bg-card p-3">
                <span className="mt-1.5 w-5 shrink-0 text-right text-xs font-medium text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex gap-2">
                    <Input
                      value={scene.heading}
                      onChange={(event) => update(scene.key, { heading: event.target.value })}
                      maxLength={200}
                      aria-label={`Scene ${index + 1} heading`}
                      className="font-mono text-xs uppercase"
                    />
                    <Input
                      type="number"
                      min={0.5}
                      max={30}
                      step={0.5}
                      value={scene.estimatedPages}
                      onChange={(event) => update(scene.key, { estimatedPages: Math.min(Math.max(Number(event.target.value) || 0, 0), 30) })}
                      aria-label={`Scene ${index + 1} length in pages`}
                      title="Pages"
                      className="w-20 shrink-0"
                    />
                  </div>
                  <Textarea
                    value={scene.summary}
                    onChange={(event) => update(scene.key, { summary: event.target.value })}
                    maxLength={2000}
                    aria-label={`Scene ${index + 1} summary`}
                    className="min-h-12 text-sm"
                  />
                </div>
                <div className="flex shrink-0 flex-col gap-0.5 opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUpIcon />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="Move down" disabled={index === shown.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove scene ${index + 1}`}
                    onClick={() => setScenes((current) => current?.filter((item) => item.key !== scene.key) ?? null)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </li>
            ) : (
              <li key={scene.key} className="flex gap-3 rounded-lg border bg-card p-3 duration-200 animate-in fade-in-0">
                <span className="w-5 shrink-0 text-right text-xs font-medium text-muted-foreground tabular-nums">{index + 1}</span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-mono text-xs uppercase">{scene.heading}</p>
                  <p className="text-sm text-muted-foreground">{scene.summary}</p>
                </div>
              </li>
            ),
          )}
          {streaming && (
            <li className="flex gap-3 rounded-lg border border-dashed p-3">
              <span className="w-5" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3.5 w-full" />
              </div>
            </li>
          )}
        </ol>

        {scenes && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() =>
              setScenes((current) => [...(current ?? []), { key: nanoid(), heading: "", summary: "", estimatedPages: 1 }])
            }
          >
            <PlusIcon data-icon="inline-start" />
            Add scene
          </Button>
        )}

        {failed && !streaming && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {failed}
          </p>
        )}
      </div>

      <DialogFooter className="border-t px-6 py-4 sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            outline.stop();
            setStep("brief");
          }}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={streaming} onClick={plan}>
            <RotateCwIcon data-icon="inline-start" />
            Plan again
          </Button>
          <Button type="button" disabled={streaming || !scenes?.some((scene) => scene.heading.trim())} onClick={write}>
            Write the draft
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
