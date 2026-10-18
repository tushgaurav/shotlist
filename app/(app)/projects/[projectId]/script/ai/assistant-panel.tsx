"use client";

import { useChat } from "@ai-sdk/react";
import type { Editor } from "@tiptap/react";
import { DefaultChatTransport } from "ai";
import { ArrowUpIcon, MessageSquarePlusIcon, RotateCwIcon, SparklesIcon, SquareIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AssistantMessage } from "@/lib/ai/chat";
import type { ScriptSnapshot } from "@/lib/ai/schema";
import { insertionPoint, insertionRange, isBlankDoc, scriptSnapshot } from "@/lib/screenplay/editor/ai-ranges";
import { committedDoc } from "@/lib/screenplay/editor/ai-suggestion";

import { DetailsChip } from "./details-chip";
import { EditCard } from "./edit-card";
import { ModelSelect } from "./model-select";
import { useAiModel } from "./use-ai-model";
import type { AiWriter } from "./use-ai-writer";

const KEPT_MESSAGES = 60;

type ChatProps = {
  editor: Editor;
  writer: AiWriter;
  projectId: string;
  details: string[];
  onClose: () => void;
  /** Called after an edit is shown in the script, e.g. to get the sheet out of the way. */
  onReviewed?: () => void;
};

/** Docked beside the page when there's room, otherwise a sheet over it. */
export function AssistantPanel({ docked, ...props }: ChatProps & { docked: boolean }) {
  if (docked) {
    return (
      <aside
        aria-label="Assistant"
        className="sticky top-24 flex h-[calc(100svh-6rem)] w-96 shrink-0 flex-col border-l bg-background"
      >
        <AssistantChat {...props} />
      </aside>
    );
  }
  return (
    <Sheet open onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-md">
        <SheetTitle className="sr-only">Assistant</SheetTitle>
        <AssistantChat {...props} onReviewed={props.onClose} />
      </SheetContent>
    </Sheet>
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
  const [transport] = useState(
    () => new DefaultChatTransport<AssistantMessage>({ api: `/api/projects/${projectId}/ai/chat` }),
  );
  // Sent with every request, so the assistant always reads the script as it is now.
  const requestBody = () => ({ body: { model, script: chatSnapshot(editor) } });
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
        <SparklesIcon className="size-4 text-primary" />
        <h2 className="flex-1 text-sm font-medium">Assistant</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="New chat" disabled={messages.length === 0} onClick={newChat}>
              <MessageSquarePlusIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New chat</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon-sm" aria-label="Close assistant" onClick={onClose}>
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
              <p className="text-sm font-medium">Ask about your script</p>
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
            aria-label="Message the assistant"
            className="field-sizing-content block max-h-48 min-h-14 w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-1 px-1.5 pb-1.5">
            <ModelSelect />
            <DetailsChip projectId={projectId} details={details} />
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
