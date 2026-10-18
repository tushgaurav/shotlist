import { Fragment } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Command, type EditorState, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import type { ScriptSnapshot } from "../../ai/schema";
import { blocksFromNode } from "../blocks";
import { getAiSuggestion } from "./ai-suggestion";
import { getActiveSuggestion } from "./autocomplete";

/** Asks for the rest of the line at the cursor. Resolves to null when there's nothing to offer. */
export type GhostTextSource = (script: ScriptSnapshot, signal: AbortSignal) => Promise<string | null>;

type Ghost = { pos: number; text: string };
type GhostState = { source: GhostTextSource | null; ghost: Ghost | null };
type GhostMeta = Partial<GhostState>;

export const ghostTextKey = new PluginKey<GhostState>("screenplayGhostText");

/** How long the writer has to pause before a suggestion is requested. */
export const GHOST_DELAY_MS = 700;
const MIN_LINE_LENGTH = 12;
const MAX_GHOST_LENGTH = 140;
const GHOST_TYPES = new Set(["action", "dialogue"]);
/** Blocks of earlier script sent along, at most: enough for the scene and the one before. */
const MAX_CONTEXT_BLOCKS = 150;

/** The suggestion showing at the cursor, if any. */
export function getGhostText(state: EditorState): string | null {
  const ghost = ghostTextKey.getState(state)?.ghost;
  const { selection } = state;
  return ghost && selection.empty && selection.from === ghost.pos ? ghost.text : null;
}

/** Suggestions are only offered at the end of an action or dialogue line with a few words in it. */
export function canSuggest(state: EditorState) {
  const { selection } = state;
  if (!selection.empty) return false;
  const $pos = selection.$from;
  const block = $pos.parent;
  if ($pos.depth !== 1 || $pos.parentOffset !== block.content.size) return false;
  if (!GHOST_TYPES.has(block.type.name) || block.textContent.trim().length < MIN_LINE_LENGTH) return false;
  return !getActiveSuggestion(state) && !getAiSuggestion(state);
}

/** The current scene and the one before it, up to the cursor. */
export function ghostContext(state: EditorState): ScriptSnapshot {
  const { doc } = state;
  const index = state.selection.$from.index(0);
  let start = 0;
  let headings = 0;
  for (let i = index; i >= 0; i--) {
    if (doc.child(i).type.name === "sceneHeading" && ++headings === 2) {
      start = i;
      break;
    }
  }
  start = Math.max(start, index - MAX_CONTEXT_BLOCKS + 1);

  const nodes = [];
  for (let i = start; i <= index; i++) nodes.push(doc.child(i));
  return {
    blocks: blocksFromNode(doc.copy(Fragment.fromArray(nodes))),
    cursor: { block: index - start, offset: doc.child(index).textContent.length },
    selection: null,
  };
}

/** One line of plain text that reads on from `line`, or null. */
export function tidyGhost(raw: string, line: string): string | null {
  let text = (raw.split(/\r?\n/).find((part) => part.trim()) ?? "").replace(/\s+/g, " ");
  const quoted = text.trim().match(/^["“](.*)["”]$/);
  if (quoted) text = (text.startsWith(" ") ? " " : "") + quoted[1];

  if (/\s$/.test(line)) text = text.trimStart();
  else if (/[.!?,;:—]$/.test(line) && /^[\p{L}\p{N}]/u.test(text)) text = ` ${text}`;

  if (text.length > MAX_GHOST_LENGTH) {
    const cut = text.lastIndexOf(" ", MAX_GHOST_LENGTH);
    text = text.slice(0, cut > 0 ? cut : MAX_GHOST_LENGTH);
  }
  text = text.trimEnd();
  return text.trim() ? text : null;
}

/** Typing the suggestion's next characters keeps the rest of it showing. */
function typeThrough(tr: Transaction, ghost: Ghost): Ghost | null {
  if (tr.steps.length !== 1) return null;
  const step = tr.steps[0];
  if (!(step instanceof ReplaceStep) || step.from !== ghost.pos || step.to !== ghost.pos) return null;
  const { content, openStart, openEnd } = step.slice;
  if (openStart || openEnd) return null;
  let typed = "";
  for (let i = 0; i < content.childCount; i++) {
    const node = content.child(i);
    if (!node.isText) return null;
    typed += node.text;
  }
  if (!typed || typed.length >= ghost.text.length || !ghost.text.startsWith(typed)) return null;
  return { pos: ghost.pos + typed.length, text: ghost.text.slice(typed.length) };
}

export const acceptGhostText: Command = (state, dispatch) => {
  const text = getGhostText(state);
  if (!text) return false;
  dispatch?.(state.tr.insertText(text).setMeta(ghostTextKey, { ghost: null } satisfies GhostMeta).scrollIntoView());
  return true;
};

export const dismissGhostText: Command = (state, dispatch) => {
  if (!getGhostText(state)) return false;
  dispatch?.(state.tr.setMeta(ghostTextKey, { ghost: null } satisfies GhostMeta));
  return true;
};

/** Turns suggestions on with a source, or off with null. */
export function setGhostTextSource(view: EditorView, source: GhostTextSource | null) {
  if (ghostTextKey.getState(view.state)?.source === source) return;
  view.dispatch(view.state.tr.setMeta(ghostTextKey, { source } satisfies GhostMeta));
}

export function ghostTextPlugin({ delay = GHOST_DELAY_MS }: { delay?: number } = {}) {
  return new Plugin<GhostState>({
    key: ghostTextKey,
    state: {
      init: () => ({ source: null, ghost: null }),
      apply(tr, value) {
        const meta = tr.getMeta(ghostTextKey) as GhostMeta | undefined;
        if (meta) {
          const next = { ...value, ...meta };
          return next.source ? next : { source: null, ghost: null };
        }
        if (!value.ghost || !tr.docChanged) return value;
        return { ...value, ghost: typeThrough(tr, value.ghost) };
      },
    },

    view() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let pending: AbortController | null = null;
      const cancel = () => {
        clearTimeout(timer);
        timer = undefined;
        pending?.abort();
        pending = null;
      };

      const request = (view: EditorView) => {
        const { state } = view;
        const source = ghostTextKey.getState(state)?.source;
        if (!source || !view.editable || !view.hasFocus() || !canSuggest(state)) return;
        const controller = new AbortController();
        pending = controller;
        const { doc } = state;
        const pos = state.selection.from;
        const line = state.selection.$from.parent.textContent;
        source(ghostContext(state), controller.signal)
          .then((raw) => {
            if (controller.signal.aborted || view.isDestroyed) return;
            const now = view.state;
            if (now.doc !== doc || !now.selection.empty || now.selection.from !== pos) return;
            const text = raw && tidyGhost(raw, line);
            if (text) view.dispatch(now.tr.setMeta(ghostTextKey, { ghost: { pos, text } } satisfies GhostMeta));
          })
          .catch(() => {})
          .finally(() => {
            if (pending === controller) pending = null;
          });
      };

      return {
        update(view, prev) {
          const docChanged = view.state.doc !== prev.doc;
          const source = ghostTextKey.getState(view.state)?.source;
          if (!docChanged && view.state.selection.eq(prev.selection) && source === ghostTextKey.getState(prev)?.source) {
            return;
          }
          cancel();
          // Only typing asks for a suggestion; clicking around doesn't.
          if (!docChanged || !source || getGhostText(view.state) || !canSuggest(view.state)) return;
          timer = setTimeout(() => request(view), delay);
        },
        destroy: cancel,
      };
    },

    props: {
      decorations(state) {
        const text = getGhostText(state);
        if (!text) return null;
        const widget = Decoration.widget(
          state.selection.from,
          () => {
            const element = document.createElement("span");
            element.className = "sp-ghost";
            element.setAttribute("aria-hidden", "true");
            element.textContent = text;
            const hint = document.createElement("kbd");
            hint.className = "sp-ghost-hint";
            hint.textContent = "Tab";
            element.append(hint);
            return element;
          },
          { side: 1, key: `ghost:${text}`, ignoreSelection: true },
        );
        return DecorationSet.create(state.doc, [widget]);
      },
    },
  });
}
