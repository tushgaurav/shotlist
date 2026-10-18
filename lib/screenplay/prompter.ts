import { isElementType, UPPERCASE_ELEMENTS, type ElementType } from "./elements";
import { toRuns, type TextRun } from "./pagination";
import { cueName } from "./scenes";
import type { ScreenplayDocJSON } from "./types";

type LineBase = {
  /** The element's index in the document. Stays the same when the character filter changes. */
  block: number;
  /** null before the first scene heading. */
  sceneId: string | null;
  /** Part of the same speech as the line before, so it sits closer to it. */
  continues: boolean;
};

/** One line on the teleprompter. `read` lines are spoken; everything else is a small cue. */
export type PrompterLine = LineBase &
  (
    | { kind: "scene"; number: number; heading: string }
    | { kind: "speaker"; name: string }
    | { kind: "cue"; type: ElementType; runs: TextRun[] }
    | { kind: "read"; runs: TextRun[]; words: number }
  );

export type PrompterScene = { id: string; number: number; heading: string };

export type PrompterScript = {
  lines: PrompterLine[];
  scenes: PrompterScene[];
  /** Everyone with a character cue, in order of first appearance. */
  characters: string[];
  /** Words in `read` lines. */
  words: number;
};

/**
 * Lays a script out for reading aloud. Dialogue is the reading text; scene headings, action,
 * parentheticals and transitions are cues. With `character` set, only that character's dialogue
 * is read, and everyone else's becomes a cue under their name.
 */
export function prompterScript(doc: ScreenplayDocJSON, character: string | null = null): PrompterScript {
  const lines: PrompterLine[] = [];
  const scenes: PrompterScene[] = [];
  const characters: string[] = [];
  let words = 0;
  let sceneId: string | null = null;
  // Set by a character cue and kept through that character's parentheticals and dialogue.
  let speaker: string | null = null;
  let speechLines = 0;

  doc.content.forEach((block, index) => {
    if (!isElementType(block.type)) return;
    const type = block.type;
    const runs = toRuns(block.content ?? [], UPPERCASE_ELEMENTS.has(type));
    const text = runs
      .map((run) => run.text)
      .join("")
      .trim();

    if (type === "sceneHeading") {
      speaker = null;
      speechLines = 0;
      const id = block.attrs?.sceneId;
      if (typeof id === "string") {
        sceneId = id;
        const number = scenes.length + 1;
        scenes.push({ id, number, heading: text });
        lines.push({ kind: "scene", block: index, sceneId, continues: false, number, heading: text });
      } else if (text) {
        lines.push({ kind: "cue", type, runs, block: index, sceneId, continues: false });
      }
      return;
    }

    if (type === "character") {
      speaker = cueName(text) || null;
      speechLines = 0;
      if (speaker && !characters.includes(speaker)) characters.push(speaker);
      if (text && (character === null || speaker !== character)) {
        lines.push({ kind: "speaker", name: text, block: index, sceneId, continues: false });
        speechLines++;
      }
      return;
    }

    if (type !== "dialogue" && type !== "parenthetical") {
      speaker = null;
      speechLines = 0;
      if (text) lines.push({ kind: "cue", type, runs, block: index, sceneId, continues: false });
      return;
    }

    if (!text) return;
    const base = { block: index, sceneId, continues: speechLines > 0 };
    speechLines++;
    if (type === "dialogue" && (character === null || speaker === character)) {
      const count = countWords(text);
      words += count;
      lines.push({ kind: "read", runs, words: count, ...base });
    } else {
      lines.push({ kind: "cue", type, runs, ...base });
    }
  });

  return { lines, scenes, characters, words };
}

/** Counts words with at least one letter or digit, so a lone dash or "..." isn't one. */
export function countWords(text: string) {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}
