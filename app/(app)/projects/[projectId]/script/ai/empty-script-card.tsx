"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { FilmIcon, PenLineIcon, SparklesIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { shortcutLabel, useIsMac } from "@/lib/keyboard";
import { isBlankDoc } from "@/lib/screenplay/editor/ai-ranges";
import { getAiSuggestion } from "@/lib/screenplay/editor/ai-suggestion";

/** Offered on an empty script; it goes away as soon as there's anything on the page. */
export function EmptyScriptCard({
  editor,
  onDraft,
  onCompose,
}: {
  editor: Editor;
  onDraft: () => void;
  onCompose: () => void;
}) {
  const isMac = useIsMac();
  const [dismissed, setDismissed] = useState(false);
  const blank = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? isBlankDoc(editor.state.doc) && !getAiSuggestion(editor.state) : false),
  });
  if (!blank || dismissed) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[2.25in] flex justify-center px-6 font-sans">
      <div className="pointer-events-auto relative w-full max-w-md rounded-xl border bg-popover p-4 text-popover-foreground shadow-sm duration-300 animate-in fade-in-0 slide-in-from-bottom-1">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss"
          className="absolute top-2 right-2 text-muted-foreground"
          onClick={() => setDismissed(true)}
        >
          <XIcon />
        </Button>
        <p className="flex items-center gap-2 text-sm font-medium">
          <SparklesIcon className="size-4 text-primary" />
          Start with AI
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan and write a first draft from your project details, or let the AI open the story. Or
          just start typing.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={onDraft}>
            <FilmIcon data-icon="inline-start" />
            Draft from details…
          </Button>
          <Button size="sm" variant="outline" onClick={onCompose}>
            <PenLineIcon data-icon="inline-start" />
            Write the opening
            <Kbd className="ml-1">{shortcutLabel(["Mod", "K"], isMac)}</Kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}
