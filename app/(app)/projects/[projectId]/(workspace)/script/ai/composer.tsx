"use client";

import type { EditorState } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import {
  ArrowRightIcon,
  ClapperboardIcon,
  EyeIcon,
  FilmIcon,
  FlameIcon,
  HistoryIcon,
  MessageSquareTextIcon,
  PenLineIcon,
  ScissorsIcon,
  SparklesIcon,
  WandSparklesIcon,
  type LucideIcon,
} from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { blockSpan, isBlankDoc, rewriteRange } from "@/lib/screenplay/editor/ai-ranges";
import type { ElementType } from "@/lib/screenplay/elements";
import { isElementType } from "@/lib/screenplay/elements";
import { useLocalStorage, writeLocalStorage } from "@/lib/use-local-storage";

import { DetailsChip } from "./details-chip";
import { ModelSelect } from "./model-select";
import type { AiWriter, WriteKind } from "./use-ai-writer";

const RECENTS_KEY = "shotlist:ai-prompts";
const MAX_RECENTS = 20;

type ComposerContext =
  | { kind: "start" }
  | { kind: "rewrite"; lines: number }
  | { kind: "continue"; element: ElementType; emptyLine: boolean };

/** What the composer was opened on, captured when it opens. */
export type ComposerSession = { id: number; context: ComposerContext; pos: number };

let sessions = 0;

export function composerSession(state: EditorState): ComposerSession {
  const id = ++sessions;
  if (isBlankDoc(state.doc)) return { id, context: { kind: "start" }, pos: state.selection.head };
  const range = rewriteRange(state);
  if (range) {
    const span = blockSpan(state.doc, range);
    return { id, context: { kind: "rewrite", lines: span.to - span.from + 1 }, pos: state.selection.to };
  }
  const $pos = state.selection.$head;
  const emptyLine = $pos.parent.textContent.trim() === "";
  // An empty line takes its cue from the line before it.
  const lineBefore = emptyLine && $pos.index(0) > 0 ? state.doc.child($pos.index(0) - 1) : $pos.parent;
  const type = lineBefore.type.name;
  return {
    id,
    context: { kind: "continue", element: isElementType(type) ? type : "action", emptyLine },
    pos: state.selection.head,
  };
}

type Item = { label: string; instruction: string; kind: WriteKind | "draft"; icon: LucideIcon; group: string };

function presets(context: ComposerContext): Item[] {
  const group = "Suggestions";
  if (context.kind === "start") {
    return [
      { group, icon: PenLineIcon, kind: "continue", label: "Write the Opening Scene", instruction: "Write the opening scene of this project." },
      { group, icon: FilmIcon, kind: "draft", label: "Draft the Whole Script…", instruction: "" },
    ];
  }
  if (context.kind === "rewrite") {
    return [
      { group, icon: ScissorsIcon, kind: "rewrite", label: "Tighten", instruction: "Tighten these lines. Cut anything that isn't doing work and keep the meaning." },
      { group, icon: MessageSquareTextIcon, kind: "rewrite", label: "Punch Up the Dialogue", instruction: "Punch up the dialogue: sharper, more specific, with more subtext." },
      { group, icon: EyeIcon, kind: "rewrite", label: "Make It More Visual", instruction: "Make the action more visual and cinematic. Show, don't tell." },
      { group, icon: FlameIcon, kind: "rewrite", label: "Raise the Tension", instruction: "Raise the tension and the stakes." },
      { group, icon: WandSparklesIcon, kind: "rewrite", label: "Fix the Formatting", instruction: "Keep the words as they are, but fix the screenplay formatting and element types." },
    ];
  }
  if (context.element === "sceneHeading" && !context.emptyLine) {
    return [
      { group, icon: PenLineIcon, kind: "continue", label: "Write This Scene", instruction: "Write this scene in full, about a page." },
      { group, icon: ClapperboardIcon, kind: "nextScene", label: "Write the Next Scene", instruction: "" },
    ];
  }
  if (context.element === "character" || context.element === "dialogue" || context.element === "parenthetical") {
    return [
      { group, icon: MessageSquareTextIcon, kind: "continue", label: "Continue the Conversation", instruction: "Continue the conversation for a few more exchanges." },
      { group, icon: SparklesIcon, kind: "continue", label: "Add a Reaction", instruction: "Add a short reaction: a beat of action or a line from another character." },
      { group, icon: ArrowRightIcon, kind: "continue", label: "Write What Happens Next", instruction: "Write what happens next, about half a page." },
    ];
  }
  return [
    { group, icon: ArrowRightIcon, kind: "continue", label: "Continue the Scene", instruction: "Continue the scene for a few beats." },
    { group, icon: MessageSquareTextIcon, kind: "continue", label: "Add Dialogue", instruction: "Bring in dialogue between the characters in the scene." },
    { group, icon: ScissorsIcon, kind: "continue", label: "End the Scene", instruction: "Bring the scene to a strong close." },
    { group, icon: ClapperboardIcon, kind: "nextScene", label: "Write the Next Scene", instruction: "" },
  ];
}

function title(context: ComposerContext) {
  if (context.kind === "start") return "Start Your Script";
  if (context.kind === "rewrite") return `Rewrite ${context.lines === 1 ? "This Line" : `These ${context.lines} Lines`}`;
  return context.emptyLine ? "Write Here" : "Continue after This Line";
}

function placeholder(context: ComposerContext) {
  if (context.kind === "rewrite") return "How should it change?";
  if (context.kind === "start") return "Describe the opening, or pick a suggestion…";
  return "What should happen next?";
}

function useRecentPrompts() {
  const raw = useLocalStorage(RECENTS_KEY);
  const recents = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(raw ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }, [raw]);
  const remember = (prompt: string) => {
    const next = [prompt, ...recents.filter((item) => item !== prompt)].slice(0, MAX_RECENTS);
    writeLocalStorage(RECENTS_KEY, JSON.stringify(next));
  };
  return [recents, remember] as const;
}

type Props = {
  editor: Editor;
  writer: AiWriter;
  session: ComposerSession | null;
  onClose: () => void;
  onDraft: () => void;
  details: string[];
};

/** ⌘K: ask the AI to write at the cursor or rewrite the selection. */
export function Composer({ session, onClose, ...props }: Props) {
  return (
    <Popover open={session !== null} onOpenChange={(open) => !open && onClose()}>
      {session && <ComposerBody key={session.id} session={session} onClose={onClose} {...props} />}
    </Popover>
  );
}

function ComposerBody({ editor, writer, session, onClose, onDraft, details }: Props & { session: ComposerSession }) {
  const listId = useId();
  const [text, setText] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const [recents, remember] = useRecentPrompts();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const anchor = useRef({
    getBoundingClientRect: () => {
      const view = editor.view;
      const coords = view.coordsAtPos(Math.min(session.pos, view.state.doc.content.size));
      const page = view.dom.getBoundingClientRect();
      return new DOMRect(page.left, coords.top, page.width, coords.bottom - coords.top);
    },
  });

  const { context } = session;
  const defaultKind: WriteKind = context.kind === "rewrite" ? "rewrite" : "continue";
  const items: Item[] = text.trim()
    ? []
    : [
        ...presets(context),
        ...recents.slice(0, 3).map((prompt) => ({
          group: "Recent",
          icon: HistoryIcon,
          kind: defaultKind,
          label: prompt,
          instruction: prompt,
        })),
      ];

  const run = (item?: Item) => {
    onClose();
    if (item?.kind === "draft") {
      onDraft();
      return;
    }
    const instruction = item ? item.instruction : text.trim();
    if (!item && instruction) remember(instruction);
    writer.write(item?.kind === undefined ? defaultKind : item.kind, instruction);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      run(active === null ? undefined : items[active]);
    } else if (event.key === "ArrowDown" && items.length > 0) {
      event.preventDefault();
      setActive((current) => Math.min(items.length - 1, (current ?? -1) + 1));
    } else if (event.key === "ArrowUp" && active !== null) {
      event.preventDefault();
      setActive(active === 0 ? null : active - 1);
    }
  };

  return (
    <>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={8}
        collisionPadding={16}
        aria-label="Write with AI"
        className="w-[min(34rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          textarea.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          editor.commands.focus();
        }}
      >
        <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
          <SparklesIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">{title(context)}</p>
            <textarea
              ref={textarea}
              value={text}
              rows={1}
              maxLength={4000}
              placeholder={placeholder(context)}
              aria-label="Instructions for the AI"
              aria-controls={items.length > 0 ? listId : undefined}
              aria-activedescendant={active === null ? undefined : `${listId}-${active}`}
              onChange={(event) => {
                setText(event.target.value);
                setActive(null);
              }}
              onKeyDown={onKeyDown}
              className="field-sizing-content max-h-40 min-h-6 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {items.length > 0 && (
          <div id={listId} role="listbox" aria-label="Suggestions" className="max-h-72 overflow-y-auto border-t p-1">
            {items.map((item, index) => (
              <div key={`${item.group}-${item.label}`}>
                {(index === 0 || items[index - 1].group !== item.group) && (
                  <p className="px-2 pt-1.5 pb-1 text-[0.7rem] font-medium text-muted-foreground">{item.group}</p>
                )}
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={active === index}
                  tabIndex={-1}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => run(item)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm aria-selected:bg-muted"
                >
                  <item.icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{item.label}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 border-t bg-muted/40 px-1.5 py-1">
          <ModelSelect />
          <DetailsChip details={details} />
          <span className="ml-auto flex shrink-0 items-center gap-1 pr-1.5 text-xs text-muted-foreground">
            <Kbd>↵</Kbd>
            {context.kind === "rewrite" ? "Rewrite" : "Write"}
          </span>
        </div>
      </PopoverContent>
    </>
  );
}
