"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { CheckIcon, SparklesIcon, SquareIcon, XIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { shortcutLabel, useIsMac } from "@/lib/keyboard";
import { AI_BAR_SPACE_CLASS, getAiSuggestion } from "@/lib/screenplay/editor/ai-suggestion";

import type { AiWriter } from "./use-ai-writer";

/** ⌘K focuses this while a suggestion waits for review. */
export const REVISE_INPUT_ID = "ai-revise-input";

/** Below the sticky app header and script toolbar. */
const TOP_INSET = 120;
const BOTTOM_INSET = 16;
/** While streaming, keep the newest line at least this far above the bottom of the window. */
const FOLLOW_MARGIN = 160;

/**
 * Floats under the suggestion while it streams (with Stop) and while it waits for review
 * (Accept, Discard, or ask for changes). It stays on screen when the suggestion scrolls away.
 */
export function SuggestionBar({ editor, writer }: { editor: Editor; writer: AiWriter }) {
  const isMac = useIsMac();
  const suggestion = useEditorState({
    editor,
    selector: ({ editor }) => {
      const value = editor ? getAiSuggestion(editor.state) : null;
      return value ? { status: value.status, replaced: value.replaced } : null;
    },
  });
  const barRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [revision, setRevision] = useState("");
  const follow = useRef(true);
  const active = suggestion !== null;
  const streaming = suggestion?.status === "streaming";

  useEffect(() => {
    if (streaming) follow.current = true;
  }, [streaming]);

  useLayoutEffect(() => {
    if (!active) return;
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const current = getAiSuggestion(editor.state);
        if (!current || editor.isDestroyed) return;
        const view = editor.view;
        const space = view.dom.querySelector(`.${AI_BAR_SPACE_CLASS}`)?.getBoundingClientRect();
        if (!space) return;
        let { top: spaceTop } = space;
        if (current.status === "streaming" && follow.current && space.bottom > window.innerHeight - FOLLOW_MARGIN) {
          const by = space.bottom - (window.innerHeight - FOLLOW_MARGIN);
          window.scrollBy({ top: by });
          spaceTop -= by;
        }
        const page = view.dom.getBoundingClientRect();
        const height = barRef.current?.offsetHeight ?? 40;
        const centred = spaceTop + (space.height - height) / 2;
        const top = Math.min(Math.max(centred, TOP_INSET), window.innerHeight - height - BOTTOM_INSET);
        setPosition({ top, left: page.left + page.width / 2 });
      });
    };
    // Scrolling up while it streams means the writer wants to read something; stop following.
    const unfollow = (event: Event) => {
      if (event instanceof WheelEvent && event.deltaY >= 0) return;
      if (event instanceof KeyboardEvent && !["PageUp", "Home", "ArrowUp"].includes(event.key)) return;
      follow.current = false;
    };

    place();
    editor.on("transaction", place);
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    window.addEventListener("wheel", unfollow, { passive: true });
    window.addEventListener("touchmove", unfollow, { passive: true });
    window.addEventListener("keydown", unfollow);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("transaction", place);
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
      window.removeEventListener("wheel", unfollow);
      window.removeEventListener("touchmove", unfollow);
      window.removeEventListener("keydown", unfollow);
    };
  }, [active, editor]);

  // The editor handles its own keys; these cover focus anywhere else on the page.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || editor.view.dom.contains(event.target as Node)) return;
      const inBar = barRef.current?.contains(event.target as Node) ?? false;
      const typing = event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable=true]");
      if (typing && !inBar) return;

      if (event.key === "Escape") {
        event.preventDefault();
        if (streaming) writer.stop();
        else writer.discard();
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !streaming) {
        event.preventDefault();
        writer.accept();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, streaming, editor, writer]);

  // Escape inside the editor stops a stream (in review the editor handles it itself).
  useEffect(() => {
    if (!streaming) return;
    const dom = editor.view.dom;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) writer.stop();
    };
    dom.addEventListener("keydown", onKeyDown);
    return () => dom.removeEventListener("keydown", onKeyDown);
  }, [streaming, editor, writer]);

  const announcement = !suggestion
    ? ""
    : streaming
      ? writer.label
      : `Suggestion ready. ${shortcutLabel(["Mod", "Enter"], isMac)} to accept, Escape to discard.`;

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {suggestion && position && (
        <div
          ref={barRef}
          role="toolbar"
          aria-label="AI Suggestion"
          style={{ top: position.top, left: position.left }}
          className="fixed z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-popover/95 p-1 text-sm text-popover-foreground shadow-lg backdrop-blur-sm duration-150 animate-in fade-in-0 slide-in-from-top-1"
        >
          {streaming ? (
            <>
              <span className="flex items-center gap-2 pr-1 pl-2 text-muted-foreground">
                <SparklesIcon className="size-3.5 animate-pulse text-primary" />
                {writer.label}
              </span>
              <Button size="sm" variant="ghost" onClick={writer.stop}>
                <SquareIcon data-icon="inline-start" className="fill-current" />
                Stop
                <Kbd className="ml-1">Esc</Kbd>
              </Button>
            </>
          ) : (
            <>
              <form
                className="flex items-center"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = revision.trim();
                  if (!text) return;
                  setRevision("");
                  writer.revise(text);
                  editor.commands.focus();
                }}
              >
                <SparklesIcon className="ml-2 size-3.5 shrink-0 text-primary" />
                <input
                  id={REVISE_INPUT_ID}
                  value={revision}
                  onChange={(event) => setRevision(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      writer.accept();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      if (revision) setRevision("");
                      else editor.commands.focus();
                    }
                  }}
                  placeholder="Ask for changes…"
                  aria-label="Ask for changes to the suggestion"
                  maxLength={4000}
                  className="h-7 w-44 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground sm:w-56"
                />
              </form>
              <div className="mx-0.5 h-5 w-px bg-border" />
              <Button size="sm" variant="ghost" onClick={writer.discard}>
                <XIcon data-icon="inline-start" />
                Discard
              </Button>
              <Button size="sm" onClick={writer.accept}>
                <CheckIcon data-icon="inline-start" />
                Accept
                <Kbd className="ml-1 bg-primary-foreground/20 text-primary-foreground">
                  {shortcutLabel(["Mod", "Enter"], isMac)}
                </Kbd>
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}
