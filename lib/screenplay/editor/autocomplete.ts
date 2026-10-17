import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { cueName, parseHeading } from "../scenes";

type AutocompleteState = { dismissed: boolean };

export const autocompleteKey = new PluginKey<AutocompleteState>("screenplayAutocomplete");

const HEADING_PREFIXES = ["INT. ", "EXT. ", "INT./EXT. ", "EST. "];

export const TIMES_OF_DAY = [
  "DAY",
  "NIGHT",
  "CONTINUOUS",
  "LATER",
  "MORNING",
  "AFTERNOON",
  "EVENING",
  "DAWN",
  "DUSK",
  "MOMENTS LATER",
  "SAME",
];

const cache = new WeakMap<ProseMirrorNode, { pos: number; value: string | null }>();

/**
 * The text that would complete the line at the cursor, or null. Only offered at the end of
 * a character cue (names already used) or a scene heading (prefix, location, time of day).
 */
export function getActiveSuggestion(state: EditorState): string | null {
  const pluginState = autocompleteKey.getState(state);
  if (!pluginState || pluginState.dismissed || !state.selection.empty) return null;

  const pos = state.selection.from;
  const cached = cache.get(state.doc);
  if (cached?.pos === pos) return cached.value;

  const value = computeSuggestion(state);
  cache.set(state.doc, { pos, value });
  return value;
}

/** Text is stored as typed, so a completion follows the case of what's been typed so far. */
function matchCase(typed: string, suggestion: string) {
  const letters = typed.replace(/[^\p{L}]/gu, "");
  return letters && letters === letters.toLowerCase() ? suggestion.toLowerCase() : suggestion;
}

function computeSuggestion(state: EditorState) {
  const $pos = state.selection.$from;
  const block = $pos.parent;
  if ($pos.depth !== 1 || $pos.parentOffset !== block.content.size) return null;

  const typed = block.textContent;
  if (!typed.trim()) return null;
  const index = $pos.index(0);

  let suggestion: string | null = null;
  if (block.type.name === "character") {
    suggestion = complete(typed, rankByUse(collect(state.doc, index, "character", cueName)));
  } else if (block.type.name === "sceneHeading") {
    suggestion = completeHeading(typed, state.doc, index);
  }
  return suggestion && matchCase(typed, suggestion);
}

function completeHeading(typed: string, doc: ProseMirrorNode, skipIndex: number) {
  const upper = typed.toUpperCase();
  const prefix = upper.match(/^(INT\.\/EXT\.|INT\/EXT\.?|EXT\.\/INT\.|I\/E\.?|INT\.|EXT\.|EST\.)\s+/);
  if (!prefix) return complete(upper, HEADING_PREFIXES);

  const rest = upper.slice(prefix[0].length);
  const separator = [...rest.matchAll(/\s+[-–—]\s+/g)].at(-1);
  const headings = collect(doc, skipIndex, "sceneHeading", parseHeading);

  if (separator) {
    const time = rest.slice(separator.index + separator[0].length);
    const used = rankByUse(headings.map((heading) => heading.timeOfDay));
    return time ? complete(time, [...new Set([...used, ...TIMES_OF_DAY])]) : null;
  }
  return rest ? complete(rest, rankByUse(headings.map((heading) => heading.location))) : null;
}

function collect<T>(
  doc: ProseMirrorNode,
  skipIndex: number,
  type: string,
  map: (text: string) => T,
): T[] {
  const values: T[] = [];
  doc.forEach((node, _pos, index) => {
    if (index !== skipIndex && node.type.name === type) values.push(map(node.textContent));
  });
  return values;
}

function rankByUse(values: (string | null)[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);
}

function complete(typed: string, candidates: string[]) {
  const upper = typed.toUpperCase();
  for (const candidate of candidates) {
    if (candidate.length > upper.length && candidate.startsWith(upper)) {
      const rest = candidate.slice(upper.length);
      return rest.trim() ? rest : null;
    }
  }
  return null;
}

export function autocompletePlugin() {
  return new Plugin<AutocompleteState>({
    key: autocompleteKey,
    state: {
      init: () => ({ dismissed: false }),
      apply(tr, value) {
        const meta = tr.getMeta(autocompleteKey) as Partial<AutocompleteState> | undefined;
        if (meta) return { ...value, ...meta };
        if (tr.docChanged && value.dismissed) return { dismissed: false };
        return value;
      },
    },
    props: {
      decorations(state) {
        const suggestion = getActiveSuggestion(state);
        if (!suggestion) return null;
        const widget = Decoration.widget(
          state.selection.from,
          () => {
            const element = document.createElement("span");
            element.className = "sp-suggestion";
            element.textContent = suggestion;
            element.setAttribute("aria-hidden", "true");
            return element;
          },
          { side: 1, key: `suggestion:${suggestion}`, ignoreSelection: true },
        );
        return DecorationSet.create(state.doc, [widget]);
      },
    },
  });
}
