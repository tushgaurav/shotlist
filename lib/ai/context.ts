import type { ScreenplayBlock } from "../screenplay/blocks";
import { ELEMENT_LABELS, type ElementType } from "../screenplay/elements";
import { toFountain } from "../screenplay/fountain";
import { cueName } from "../screenplay/scenes";
import type { ScreenplayDocJSON, TitlePage } from "../screenplay/types";
import type { ScriptSnapshot } from "./schema";

/** What the model is told about the project. Every field but the title is optional. */
export type AiProject = {
  title: string;
  typeName: string | null;
  logline: string | null;
  synopsis: string | null;
  genre: string | null;
  tone: string | null;
  targetRuntimeMinutes: number | null;
  aspectRatio: string | null;
  language: string | null;
  titlePage: TitlePage;
};

export const CURSOR_MARKER = "[[CURSOR]]";
export const REWRITE_START = "[[REWRITE START]]";
export const REWRITE_END = "[[REWRITE END]]";

const VERTICAL_RATIOS = new Set(["9:16", "4:5", "3:4"]);
const WIDE_RATIOS = new Set(["2.39:1", "2.35:1", "2.4:1", "2:1", "2.76:1"]);

export function projectBrief(project: AiProject): string {
  const lines = [`Title: ${project.title}`];
  if (project.typeName) lines.push(`Type: ${project.typeName}`);
  if (project.logline) lines.push(`Logline: ${project.logline}`);
  if (project.genre) lines.push(`Genre: ${project.genre}`);
  if (project.tone) lines.push(`Tone and style: ${project.tone}`);
  if (project.targetRuntimeMinutes) {
    const minutes = project.targetRuntimeMinutes;
    lines.push(
      `Target runtime: ${minutes} minute${minutes === 1 ? "" : "s"} (about ${minutes} page${minutes === 1 ? "" : "s"}; a screenplay page runs about a minute)`,
    );
  }
  if (project.aspectRatio) lines.push(`Aspect ratio: ${project.aspectRatio}${aspectNote(project.aspectRatio)}`);
  if (project.language) lines.push(`Language: ${project.language}${languageNote(project.language)}`);
  if (project.titlePage.author) lines.push(`Written by: ${project.titlePage.author}`);

  const typeNote = project.typeName ? projectTypeNote(project.typeName) : null;
  if (typeNote) lines.push(`Format notes: ${typeNote}`);
  if (project.synopsis) lines.push("", "Synopsis:", project.synopsis);
  return lines.join("\n");
}

/** The details that are filled in, for showing what the AI will take into account. */
export function filledDetails(project: Omit<AiProject, "titlePage" | "title">) {
  const fields: [keyof typeof project, string][] = [
    ["typeName", "Type"],
    ["logline", "Logline"],
    ["synopsis", "Synopsis"],
    ["genre", "Genre"],
    ["tone", "Tone and style"],
    ["targetRuntimeMinutes", "Runtime"],
    ["aspectRatio", "Aspect ratio"],
    ["language", "Language"],
  ];
  return fields.filter(([key]) => project[key] !== null && project[key] !== "").map(([, label]) => label);
}

function aspectNote(ratio: string) {
  const value = ratio.replace(/\s/g, "");
  if (VERTICAL_RATIOS.has(value)) return " (a vertical frame: favour close, simple compositions that read on a phone)";
  if (value === "1:1") return " (a square frame: keep compositions centred and simple)";
  if (WIDE_RATIOS.has(value)) return " (a wide frame: there's room for landscape and for staging across the frame)";
  return "";
}

function languageNote(language: string) {
  if (/^english$/i.test(language.trim())) return "";
  return ` (write action and dialogue in ${language}; keep scene heading prefixes like INT./EXT., times of day and transitions in standard English screenplay form)`;
}

function projectTypeNote(typeName: string) {
  // Types are named by the user, so match whole words: "Radio play" isn't an ad.
  const has = (pattern: string) => new RegExp(`\\b(${pattern})\\b`, "i").test(typeName);
  if (has("music")) return "Music videos are mostly visual. Action lines follow the song's energy and images; little or no dialogue.";
  if (has("commercials?|ads?|adverts?|advertisements?|spots?")) return "Commercials are short. Every line earns its place, and it lands on the product or message.";
  if (has("youtube|social|reels?|tiktok|shorts")) return "Online video: hook the viewer in the first few seconds and keep it moving.";
  if (has("short")) return "Short films work best with few locations, a small cast and one clear turn.";
  if (has("documentary|doc")) return "Documentary: describe real footage, interviews and voice-over plainly; don't invent quotes for real people.";
  return null;
}

export type SceneRef = { number: number; id: string; heading: string; characters: string[] };

export type ScriptContext = {
  /** The script in Fountain with scene numbers (#3#) and the cursor or rewrite markers. */
  fountain: string;
  scenes: SceneRef[];
  cast: string[];
  /** Where new text goes: the scene, and the kind of line the cursor is on. */
  cursor: { scene: SceneRef | null; element: ElementType; emptyLine: boolean; atEnd: boolean } | null;
  /** The Fountain of just the lines being rewritten. */
  selection: string | null;
  omittedScenes: number;
  isEmpty: boolean;
};

type Chunk = { scene: SceneRef | null; blocks: ScreenplayBlock[]; firstIndex: number };

/**
 * Renders the live script for a prompt. Scripts longer than `maxChars` keep the scenes
 * around the cursor in full and cut the rest down to their headings.
 */
export function scriptContext(snapshot: ScriptSnapshot, { maxChars = 150_000 } = {}): ScriptContext {
  const blocks = snapshot.blocks;
  const chunks: Chunk[] = [{ scene: null, blocks: [], firstIndex: 0 }];
  const scenes: SceneRef[] = [];

  blocks.forEach((block, index) => {
    if (block.type === "sceneHeading") {
      const scene: SceneRef = {
        number: scenes.length + 1,
        id: block.sceneId ?? "",
        heading: block.text.trim().toUpperCase(),
        characters: [],
      };
      scenes.push(scene);
      chunks.push({ scene, blocks: [], firstIndex: index });
    }
    const chunk = chunks[chunks.length - 1];
    chunk.blocks.push(block);
    if (block.type === "character" && chunk.scene) {
      const name = cueName(block.text);
      if (name && !chunk.scene.characters.includes(name)) chunk.scene.characters.push(name);
    }
  });

  const cursorIndex = snapshot.cursor ? Math.min(snapshot.cursor.block, blocks.length - 1) : -1;
  const cursorChunk = chunks.findLastIndex((chunk) => chunk.firstIndex <= cursorIndex && chunk.blocks.length > 0);

  const rendered = chunks.map((chunk) => renderChunk(chunk, snapshot));
  let total = rendered.reduce((sum, text) => sum + text.length, 0);
  let omittedScenes = 0;

  if (total > maxChars) {
    // Drop scenes furthest from the cursor first; the cursor's scene always stays.
    const anchor = cursorChunk >= 0 ? cursorChunk : chunks.length - 1;
    const order = rendered
      .map((_, index) => index)
      .filter((index) => index !== anchor && chunks[index].scene)
      .sort((a, b) => Math.abs(b - anchor) - Math.abs(a - anchor));
    for (const index of order) {
      if (total <= maxChars) break;
      const short = headingOnly(chunks[index]);
      total -= rendered[index].length - short.length;
      rendered[index] = short;
      omittedScenes++;
    }
  }

  const fountain = rendered.filter(Boolean).join("\n").trim();

  let cursor: ScriptContext["cursor"] = null;
  if (snapshot.cursor && cursorIndex >= 0) {
    const block = blocks[cursorIndex];
    cursor = {
      scene: chunks[cursorChunk]?.scene ?? null,
      element: block.type,
      emptyLine: block.text.trim() === "",
      atEnd: cursorIndex === blocks.length - 1,
    };
  }

  let selection: string | null = null;
  if (snapshot.selection) {
    const { from, to } = snapshot.selection;
    selection = toFountain(docOf(blocks.slice(from, to + 1))).trim() || null;
  }

  const cast = rankNames(blocks.filter((block) => block.type === "character").map((block) => cueName(block.text)));
  const isEmpty = blocks.every((block) => block.text.trim() === "");

  return { fountain, scenes, cast, cursor, selection, omittedScenes, isEmpty };
}

function renderChunk(chunk: Chunk, snapshot: ScriptSnapshot) {
  if (chunk.blocks.length === 0) return "";
  const marked = chunk.blocks.map((block, i) => {
    const index = chunk.firstIndex + i;
    let text = block.text;
    if (snapshot.cursor?.block === index) {
      const offset = Math.min(snapshot.cursor.offset, text.length);
      text = text.slice(0, offset) + CURSOR_MARKER + text.slice(offset);
    }
    if (snapshot.selection?.from === index) text = REWRITE_START + text;
    if (snapshot.selection?.to === index) text = text + REWRITE_END;
    if (block.type === "sceneHeading" && chunk.scene) text = `${text.trim() || "UNTITLED"} #${chunk.scene.number}#`;
    return { ...block, text };
  });
  // A marker alone on a line looks like Fountain that needs forcing; it doesn't.
  return toFountain(docOf(marked)).replaceAll(`!${CURSOR_MARKER}`, CURSOR_MARKER);
}

function headingOnly(chunk: Chunk) {
  const scene = chunk.scene!;
  const lines = chunk.blocks.length - 1;
  return `${scene.heading || "UNTITLED"} #${scene.number}#\n\n[[${lines} line${lines === 1 ? "" : "s"} not shown]]\n`;
}

function docOf(blocks: ScreenplayBlock[]): ScreenplayDocJSON {
  return {
    type: "doc",
    content: blocks.map((block) => ({
      type: block.type,
      content: block.text ? [{ type: "text", text: block.text }] : [],
    })),
  };
}

function rankNames(names: string[]) {
  const counts = new Map<string, number>();
  for (const name of names) if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);
}

export function describeCursor(cursor: NonNullable<ScriptContext["cursor"]>) {
  const where = cursor.scene ? `scene ${cursor.scene.number} (${cursor.scene.heading || "untitled"})` : "before the first scene";
  const line = `${cursor.emptyLine ? "an empty " : "the end of a "}${ELEMENT_LABELS[cursor.element].toLowerCase()} line`;
  return `The ${CURSOR_MARKER} marker is in ${where}, on ${line}.`;
}
