"use client";

import type { Editor } from "@tiptap/react";
import { cn } from "cn";
import { AlertCircleIcon, ChevronDownIcon, FileDiffIcon, LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { AssistantMessage } from "@/lib/ai/chat";
import { cleanElements } from "@/lib/ai/elements";
import type { ScreenplayElement } from "@/lib/ai/schema";
import { insertionRange, isBlankDoc, sceneRange, wholeDocRange, type BlockRange } from "@/lib/screenplay/editor/ai-ranges";

import type { AiWriter } from "./use-ai-writer";

export type EditPart = Extract<AssistantMessage["parts"][number], { type: "tool-proposeEdit" }>;

const PREVIEW_LINES = 6;

const LINE_CLASSES: Record<ScreenplayElement["type"], string> = {
  sceneHeading: "uppercase font-bold",
  action: "",
  character: "ml-[38%] uppercase",
  parenthetical: "ml-[28%]",
  dialogue: "ml-[17%] mr-[12%]",
  transition: "text-right uppercase",
};

function placementLabel(part: EditPart) {
  const input = part.input;
  if (!input?.placement) return "Edit";
  if (input.placement === "atCursor") return "Insert at your cursor";
  const scene = typeof input.sceneNumber === "number" ? `scene ${input.sceneNumber}` : "a scene";
  return input.placement === "replaceScene" ? `Rewrite ${scene}` : `Add after ${scene}`;
}

/** A change the assistant proposed. "Review in script" shows it in place, to accept or discard. */
export function EditCard({
  part,
  editor,
  writer,
  onReviewed,
}: {
  part: EditPart;
  editor: Editor;
  writer: AiWriter;
  onReviewed?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const writing = part.state === "input-streaming" || part.state === "input-available";
  const elements = cleanElements(part.input?.elements, { final: !writing });
  const failure =
    part.state === "output-error"
      ? part.errorText
      : part.state === "output-available" && !part.output.ok
        ? part.output.error
        : null;
  const shown = expanded ? elements : elements.slice(0, PREVIEW_LINES);

  const review = () => {
    if (part.state !== "output-available" || !part.output.ok) return;
    const doc = editor.state.doc;
    let range: BlockRange | null;
    if (part.input.placement === "atCursor") {
      range = isBlankDoc(doc) ? wholeDocRange(doc) : insertionRange(editor.state);
    } else {
      const scene = part.output.sceneId ? sceneRange(doc, part.output.sceneId) : null;
      range = scene && (part.input.placement === "replaceScene" ? scene : { from: scene.to, to: scene.to });
    }
    if (!range) {
      toast.error("That scene isn't in the script anymore.");
      return;
    }
    writer.preview(range, cleanElements(part.input.elements, { final: true }));
    onReviewed?.();
  };

  return (
    <div className="my-2 overflow-hidden rounded-lg border bg-card text-card-foreground">
      <div className="flex items-start gap-2 border-b px-3 py-2">
        {writing ? (
          <LoaderIcon className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : failure ? (
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
        ) : (
          <FileDiffIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">{placementLabel(part)}</p>
          {part.input?.summary && <p className="text-xs text-muted-foreground">{part.input.summary}</p>}
        </div>
      </div>

      {elements.length > 0 && (
        <div
          className="bg-background px-3 py-2 text-[0.7rem] leading-snug"
          style={{ fontFamily: "var(--font-screenplay), 'Courier Prime', 'Courier New', monospace" }}
        >
          {shown.map((element, index) => (
            <p key={index} className={cn(LINE_CLASSES[element.type], index > 0 && element.type !== "dialogue" && element.type !== "parenthetical" && "mt-2")}>
              {element.text}
            </p>
          ))}
          {elements.length > PREVIEW_LINES && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-2 flex items-center gap-1 font-sans text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDownIcon className={cn("size-3 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Show less" : `Show ${elements.length - PREVIEW_LINES} more line${elements.length - PREVIEW_LINES === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      )}

      {failure ? (
        <p className="px-3 py-2 text-xs text-destructive">{failure}</p>
      ) : (
        !writing && (
          <div className="flex items-center justify-end gap-2 border-t px-2 py-1.5">
            <Button size="xs" disabled={writer.busy || elements.length === 0} onClick={review}>
              Review in script
            </Button>
          </div>
        )
      )}
    </div>
  );
}
