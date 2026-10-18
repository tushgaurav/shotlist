"use client";

import type { Editor } from "@tiptap/react";
import { useEffect } from "react";

import { completeResponseSchema } from "@/lib/ai/schema";
import { setGhostTextSource, type GhostTextSource } from "@/lib/screenplay/editor/ghost-text";

/** After a failed request, suggestions rest for a while instead of failing on every pause. */
const BACKOFF_MS = 30_000;

/** Offers the rest of the line as you type, while `enabled`. Failures stay quiet. */
export function useGhostText(editor: Editor | null, projectId: string, enabled: boolean) {
  useEffect(() => {
    if (!editor || !enabled) return;
    let restUntil = 0;
    const source: GhostTextSource = async (script, signal) => {
      if (Date.now() < restUntil) return null;
      const response = await fetch(`/api/projects/${projectId}/ai/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
        signal,
      });
      if (!response.ok) {
        restUntil = Date.now() + BACKOFF_MS;
        return null;
      }
      const parsed = completeResponseSchema.safeParse(await response.json());
      return parsed.success ? parsed.data.text : null;
    };
    setGhostTextSource(editor.view, source);
    return () => {
      if (!editor.isDestroyed) setGhostTextSource(editor.view, null);
    };
  }, [editor, projectId, enabled]);
}
