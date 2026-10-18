"use client";

import { useObject } from "@ai-sdk/react";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cleanElements } from "@/lib/ai/elements";
import type { AiModelId } from "@/lib/ai/models";
import {
  elementsOutputSchema,
  type OutlineScene,
  type ScreenplayElement,
  type ScriptSnapshot,
  type WriteRequest,
} from "@/lib/ai/schema";
import { blocksFromNode } from "@/lib/screenplay/blocks";
import {
  insertionPoint,
  insertionRange,
  isBlankDoc,
  rewriteRange,
  sceneEndRange,
  scriptSnapshot,
  wholeDocRange,
  type BlockRange,
} from "@/lib/screenplay/editor/ai-ranges";
import {
  acceptAiSuggestion,
  beginAiSuggestion,
  committedDoc,
  discardAiSuggestion,
  finishAiSuggestion,
  getAiSuggestion,
  restartAiSuggestion,
  updateAiSuggestion,
} from "@/lib/screenplay/editor/ai-suggestion";

export type WriteKind = "continue" | "nextScene" | "rewrite";

export type AiWriter = {
  /** A request is streaming. */
  busy: boolean;
  /** What's happening, for the suggestion bar: "Writing…", "Writing scene 2 of 6…". */
  label: string;
  write(kind: WriteKind, instruction: string): void;
  draft(outline: OutlineScene[], direction: string): Promise<void>;
  /** Asks for changes to the suggestion on screen. */
  revise(instruction: string): void;
  /** Shows lines that are already written (from the assistant) as a suggestion to review. */
  preview(range: BlockRange, elements: ScreenplayElement[]): void;
  stop(): void;
  accept(): void;
  discard(): void;
};

type Request = Omit<WriteRequest, "model">;

function friendlyError(error: Error) {
  if (error.message === "Failed to fetch" || error.name === "TypeError") {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return error.message || "Something went wrong while writing. Try again.";
}

export function useAiWriter(editor: Editor | null, projectId: string, model: AiModelId): AiWriter {
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("Writing…");

  const streaming = useRef(false);
  const stopped = useRef(false);
  const failure = useRef<Error | null>(null);
  const base = useRef<ScreenplayElement[]>([]);
  const latest = useRef<unknown>(undefined);
  const finished = useRef<unknown>(undefined);

  const { submit, object, stop: abort } = useObject({
    api: `/api/projects/${projectId}/ai/write`,
    schema: elementsOutputSchema,
    onFinish: ({ object }) => {
      finished.current = object?.elements;
    },
    onError: (error) => {
      failure.current = error;
    },
  });

  // Each chunk of the stream shows up in the script as it arrives.
  useEffect(() => {
    if (!editor || !streaming.current) return;
    latest.current = object?.elements;
    const tr = updateAiSuggestion(editor.state, [...base.current, ...cleanElements(object?.elements)]);
    if (tr) editor.view.dispatch(tr);
  }, [editor, object]);

  useEffect(() => () => abort(), [abort]);

  const request = useCallback(
    async (body: Request) => {
      if (!editor) return;
      failure.current = null;
      finished.current = undefined;
      latest.current = undefined;
      streaming.current = true;
      // submit is typed void but resolves once the stream has ended.
      await (submit({ ...body, model }) as unknown as Promise<void>);
      streaming.current = false;

      const final = cleanElements(finished.current ?? latest.current, { final: true });
      base.current = [...base.current, ...final];
      const tr = updateAiSuggestion(editor.state, base.current);
      if (tr) editor.view.dispatch(tr);
    },
    [editor, submit, model],
  );

  const settle = useCallback(() => {
    if (!editor) return;
    setBusy(false);
    const suggestion = getAiSuggestion(editor.state);
    const error = failure.current;
    if (suggestion?.replaced) {
      editor.view.dispatch(finishAiSuggestion(editor.state)!);
      if (error) toast.error("The AI stopped partway.", { description: friendlyError(error) });
      return;
    }
    discardAiSuggestion(editor.state, editor.view.dispatch);
    if (error) toast.error(friendlyError(error));
    else if (!stopped.current) toast("Nothing came back. Try asking another way.");
  }, [editor]);

  /** Starts a suggestion over `range`, accepting any suggestion still waiting for review. */
  const start = useCallback(
    (nextLabel: string) => {
      if (!editor) return false;
      if (getAiSuggestion(editor.state)) acceptAiSuggestion(editor.view, { keepSelection: true });
      stopped.current = false;
      base.current = [];
      setLabel(nextLabel);
      setBusy(true);
      return true;
    },
    [editor],
  );

  const write = useCallback(
    (kind: WriteKind, instruction: string) => {
      if (!editor || busy) return;
      const state = editor.state;
      if (kind === "rewrite" && !rewriteRange(state)) return;
      if (!start(kind === "rewrite" ? "Rewriting…" : "Writing…")) return;

      const current = editor.state;
      const doc = current.doc;
      let range: BlockRange;
      let snapshot: ScriptSnapshot;
      if (kind === "rewrite") {
        range = rewriteRange(current)!;
        snapshot = scriptSnapshot(doc, { selection: range });
      } else {
        range = isBlankDoc(doc) ? wholeDocRange(doc) : kind === "nextScene" ? sceneEndRange(current) : insertionRange(current);
        snapshot = scriptSnapshot(doc, { cursor: insertionPoint(doc, range) });
      }
      const ask =
        kind === "nextScene" && !instruction.trim()
          ? "Write the scene that comes next, starting with its scene heading."
          : instruction;

      editor.view.dispatch(beginAiSuggestion(current, range.from, range.to));
      void request({ mode: kind === "rewrite" ? "rewrite" : "insert", instruction: ask, script: snapshot }).then(settle);
    },
    [editor, busy, start, request, settle],
  );

  const revise = useCallback(
    (instruction: string) => {
      if (!editor || busy) return;
      const suggestion = getAiSuggestion(editor.state);
      if (!suggestion?.replaced) return;
      stopped.current = false;
      base.current = [];
      setLabel("Revising…");
      setBusy(true);

      const snapshot = scriptSnapshot(editor.state.doc, { selection: suggestion });
      editor.view.dispatch(restartAiSuggestion(editor.state)!);
      void request({ mode: "rewrite", instruction, script: snapshot }).then(settle);
    },
    [editor, busy, request, settle],
  );

  const draft = useCallback(
    async (outline: OutlineScene[], direction: string) => {
      if (!editor || busy || outline.length === 0) return;
      if (!start(`Writing scene 1 of ${outline.length}…`)) return;

      const state = editor.state;
      const blank = isBlankDoc(state.doc);
      const range = blank ? wholeDocRange(state.doc) : { from: state.doc.content.size, to: state.doc.content.size };
      const existing = blank ? [] : blocksFromNode(committedDoc(state));
      editor.view.dispatch(beginAiSuggestion(state, range.from, range.to));

      for (let index = 0; index < outline.length; index++) {
        setLabel(`Writing scene ${index + 1} of ${outline.length}…`);
        const script: ScriptSnapshot = {
          blocks: [...existing, ...base.current.map((element) => ({ ...element, sceneId: null }))],
          cursor: null,
          selection: null,
        };
        await request({ mode: "scene", instruction: direction, script, outline, sceneIndex: index });
        if (stopped.current || failure.current || !getAiSuggestion(editor.state)) break;
      }
      settle();
    },
    [editor, busy, start, request, settle],
  );

  const preview = useCallback(
    (range: BlockRange, elements: ScreenplayElement[]) => {
      if (!editor || busy || elements.length === 0) return;
      // Accepting leaves the document as it looks, so `range` still points at the same lines.
      if (getAiSuggestion(editor.state)) acceptAiSuggestion(editor.view, { keepSelection: true });
      editor.view.dispatch(beginAiSuggestion(editor.state, range.from, range.to));
      const tr = updateAiSuggestion(editor.state, elements);
      if (tr) editor.view.dispatch(tr);
      editor.view.dispatch(finishAiSuggestion(editor.state)!);
      const first = editor.view.nodeDOM(range.from);
      if (first instanceof HTMLElement) first.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [editor, busy],
  );

  const stop = useCallback(() => {
    stopped.current = true;
    abort();
  }, [abort]);

  const accept = useCallback(() => {
    if (!editor) return;
    acceptAiSuggestion(editor.view);
    editor.commands.focus();
  }, [editor]);

  const discard = useCallback(() => {
    if (!editor) return;
    discardAiSuggestion(editor.state, editor.view.dispatch);
    editor.commands.focus();
  }, [editor]);

  return { busy, label, write, draft, revise, preview, stop, accept, discard };
}
