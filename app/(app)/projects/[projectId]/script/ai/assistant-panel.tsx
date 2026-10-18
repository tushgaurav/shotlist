"use client";

import { useChat } from "@ai-sdk/react";
import type { Editor } from "@tiptap/react";
import { DefaultChatTransport } from "ai";
import { ArrowUpIcon, MessageSquarePlusIcon, RotateCwIcon, SquareIcon, XIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AssistantMessage } from "@/lib/ai/chat";
import type { ScriptSnapshot } from "@/lib/ai/schema";
import { insertionPoint, insertionRange, isBlankDoc, scriptSnapshot } from "@/lib/screenplay/editor/ai-ranges";
import { committedDoc } from "@/lib/screenplay/editor/ai-suggestion";
import { useLocalStorage, writeLocalStorage } from "@/lib/use-local-storage";

import { DetailsChip } from "./details-chip";
import { EditCard } from "./edit-card";
import { ModelSelect } from "./model-select";
import { useAiModel, useProjectDetails } from "./use-ai-model";
import type { AiWriter } from "./use-ai-writer";

const KEPT_MESSAGES = 60;

type ChatProps = {
  editor: Editor;
  writer: AiWriter;
  projectId: string;
  details: string[];
  onClose: () => void;
  /** Called after an edit is shown in the script, e.g. to uncover the page. */
  onReviewed?: () => void;
};

/**
 * A sidebar beside the page, so the script stays usable while it's open. Where the page
 * wouldn't fit beside it, it covers the page instead; the toolbar and app stay usable.
 * Its parent must be positioned.
 */
export function AssistantPanel({ docked, ...props }: ChatProps & { docked: boolean }) {
  if (docked) return <DockedAssistant {...props} />;
  return (
    <aside aria-label="Assistant" className="absolute inset-0 z-20 bg-background">
      <div className="sticky top-24 flex h-[calc(100svh-6rem)] flex-col">
        <AssistantChat {...props} onReviewed={props.onClose} />
      </div>
    </aside>
  );
}

const WIDTH_KEY = "shotlist:assistant-width";
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
/** How much room the page keeps when the assistant is dragged wider (24rem; see the aside's max width). */
const PAGE_ROOM = 384;

/** The width the writer dragged the assistant to, remembered in this browser. */
function useAssistantWidth() {
  const stored = Number(useLocalStorage(WIDTH_KEY));
  const width = stored >= MIN_WIDTH ? stored : null;
  return [width, (next: number | null) => writeLocalStorage(WIDTH_KEY, next === null ? null : String(next))] as const;
}

/** The other panels in the row (scenes, shots) are asides; hidden ones measure 0. */
function clampWidth(width: number, panel: HTMLElement) {
  const row = panel.parentElement;
  let room = row ? row.clientWidth - PAGE_ROOM : Infinity;
  for (const sibling of row?.children ?? []) {
    if (sibling !== panel && sibling instanceof HTMLElement && sibling.tagName === "ASIDE") room -= sibling.offsetWidth;
  }
  return Math.round(Math.max(MIN_WIDTH, Math.min(width, MAX_WIDTH, room)));
}

/** Beside the page, with a handle on its left edge to drag it wider or narrower. */
function DockedAssistant(props: ChatProps) {
  const aside = useRef<HTMLElement>(null);
  const [width, setWidth] = useAssistantWidth();
  const drag = useRef<{ startX: number; startWidth: number; inline: string; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panel = aside.current;
    if (!panel || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: panel.offsetWidth, inline: panel.style.width, width: panel.offsetWidth };
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // Moves straight to the DOM; the width is saved once, when the drag ends.
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panel = aside.current;
    const current = drag.current;
    if (!panel || !current) return;
    current.width = clampWidth(current.startWidth + current.startX - event.clientX, panel);
    panel.style.width = `${current.width}px`;
  };

  const endDrag = () => {
    const panel = aside.current;
    const current = drag.current;
    drag.current = null;
    setDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (!panel || !current) return;
    if (current.width === current.startWidth) panel.style.width = current.inline;
    else setWidth(current.width);
  };

  const resizeWithKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const panel = aside.current;
    const step = event.shiftKey ? 64 : 16;
    const by = event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0;
    if (!panel || by === 0) return;
    event.preventDefault();
    setWidth(clampWidth(panel.offsetWidth + by, panel));
  };

  return (
    <aside
      ref={aside}
      aria-label="Assistant"
      style={width ? { width } : undefined}
      className="sticky top-24 flex h-[calc(100svh-6rem)] w-80 max-w-[calc(100%-24rem)] shrink-0 flex-col border-l bg-background @5xl:max-w-[calc(100%-40rem)] @7xl:w-96"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the Assistant"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width ?? undefined}
        tabIndex={0}
        title="Drag to resize. Double-click to reset."
        data-dragging={dragging || undefined}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={resizeWithKeys}
        onDoubleClick={() => setWidth(null)}
        className="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none outline-none"
      >
        <div className="mx-auto h-full w-0.5 transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary group-data-dragging:bg-primary" />
      </div>
      <AssistantChat {...props} />
    </aside>
  );
}

function historyKey(projectId: string) {
  return `shotlist:assistant:${projectId}`;
}

function readHistory(projectId: string): AssistantMessage[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(historyKey(projectId)) ?? "[]");
    return Array.isArray(parsed) ? (parsed as AssistantMessage[]) : [];
  } catch {
    return [];
  }
}

/** The script as it is right now, with the cursor where an edit "at the cursor" would go. */
function chatSnapshot(editor: Editor): ScriptSnapshot {
  const doc = committedDoc(editor.state);
  const cursor = isBlankDoc(doc) ? null : insertionPoint(doc, insertionRange(editor.state));
  return scriptSnapshot(doc, { cursor });
}

function starters(blank: boolean) {
  if (blank) {
    return [
      "Help me find the story in my project details",
      "Suggest three ways to open the film",
      "Who are the main characters, and what do they want?",
    ];
  }
  return [
    "What's working, and what isn't?",
    "Give me three ideas for what happens next",
    "Does each character have a distinct voice?",
    "Tighten the scene I'm in",
  ];
}

function AssistantChat({ editor, writer, projectId, details, onClose, onReviewed }: ChatProps) {
  const [model] = useAiModel();
  const [projectDetails] = useProjectDetails();
  const [transport] = useState(
    () => new DefaultChatTransport<AssistantMessage>({ api: `/api/projects/${projectId}/ai/chat` }),
  );
  // Sent with every request, so the assistant always reads the script as it is now.
  const requestBody = () => ({ body: { model, projectDetails, script: chatSnapshot(editor) } });
  const [initialMessages] = useState(() => readHistory(projectId));
  const { messages, sendMessage, status, stop, error, regenerate, setMessages, clearError } = useChat<AssistantMessage>({
    id: `assistant-${projectId}`,
    messages: initialMessages,
    transport,
    throttle: 40,
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (busy) return;
    try {
      if (messages.length === 0) window.localStorage.removeItem(historyKey(projectId));
      else window.localStorage.setItem(historyKey(projectId), JSON.stringify(messages.slice(-KEPT_MESSAGES)));
    } catch {
      // Storage full or blocked: the conversation just isn't remembered.
    }
  }, [messages, busy, projectId]);

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Follow new text unless the writer scrolled up to read.
  useEffect(() => {
    const element = scroller.current;
    if (element && stick.current) element.scrollTop = element.scrollHeight;
  }, [messages, status]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    clearError();
    stick.current = true;
    setInput("");
    void sendMessage({ text: trimmed }, requestBody());
  };

  const newChat = () => {
    stop();
    setMessages([]);
    clearError();
    inputRef.current?.focus();
  };

  const blank = isBlankDoc(editor.state.doc);
  const last = messages.at(-1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b py-2 pr-2 pl-4">
        <h2 className="flex-1 text-sm font-medium">Assistant</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="New Chat" disabled={messages.length === 0} onClick={newChat}>
              <MessageSquarePlusIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New Chat</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon-sm" aria-label="Close Assistant" onClick={onClose}>
          <XIcon />
        </Button>
      </div>

      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        aria-live="polite"
        aria-busy={busy}
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-end gap-3 pb-2">
            <div>
              <p className="text-sm font-medium">Ask About Your Script</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The assistant reads the whole script and your project details. Ask for notes or
                ideas, or ask it to write; edits show up in the script for you to accept.
              </p>
            </div>
            <div className="flex flex-col items-start gap-1.5">
              {starters(blank).map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => send(starter)}
                  className="rounded-lg border bg-card px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="ml-8 self-end rounded-2xl rounded-br-md bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">
                  {message.parts.map((part) => (part.type === "text" ? part.text : "")).join("")}
                </div>
              ) : (
                <div key={message.id} className="text-sm">
                  {message.parts.map((part, index) => {
                    if (part.type === "text") {
                      return (
                        <Streamdown
                          key={index}
                          isAnimating={status === "streaming" && message.id === last?.id}
                          className="[&_li]:my-0.5 [&_ol]:my-2 [&_p]:my-2 [&_ul]:my-2"
                        >
                          {part.text}
                        </Streamdown>
                      );
                    }
                    if (part.type === "tool-proposeEdit") {
                      return <EditCard key={part.toolCallId} part={part} editor={editor} writer={writer} onReviewed={onReviewed} />;
                    }
                    return null;
                  })}
                </div>
              ),
            )}
            {status === "submitted" && (
              <p className="animate-pulse text-sm text-muted-foreground">Reading the script…</p>
            )}
            {error && !busy && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                <p className="flex-1 text-destructive">{error.message || "Something went wrong. Try again."}</p>
                <Button size="xs" variant="outline" onClick={() => void regenerate(requestBody())}>
                  <RotateCwIcon data-icon="inline-start" />
                  Retry
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <form
        className="border-t p-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        <div className="rounded-xl border bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send(input);
              }
            }}
            rows={2}
            maxLength={8000}
            placeholder={blank ? "Ask anything about the project…" : "Ask about the script, or ask for a change…"}
            aria-label="Message the Assistant"
            className="field-sizing-content block max-h-48 min-h-14 w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="@container/ai-controls flex items-center gap-1 px-1.5 pb-1.5">
            <ModelSelect />
            <DetailsChip details={details} />
            {busy ? (
              <Button type="button" size="icon-sm" variant="secondary" className="ml-auto" aria-label="Stop" onClick={() => void stop()}>
                <SquareIcon className="fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon-sm" className="ml-auto" aria-label="Send" disabled={!input.trim()}>
                <ArrowUpIcon />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
