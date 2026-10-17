import { isElementType, UPPERCASE_ELEMENTS, type ElementType } from "./elements";
import { isFountainSceneHeading } from "./scenes";
import type { ScreenplayDocJSON, TextJSON, TitlePage } from "./types";

const TITLE_PAGE_KEYS: [keyof TitlePage, string][] = [
  ["title", "Title"],
  ["credit", "Credit"],
  ["author", "Author"],
  ["source", "Source"],
  ["draftDate", "Draft date"],
  ["contact", "Contact"],
];

/** Converts a screenplay to Fountain (https://fountain.io/syntax). */
export function toFountain(doc: ScreenplayDocJSON, titlePage: TitlePage = {}): string {
  const sections: string[] = [];

  const titleLines = TITLE_PAGE_KEYS.flatMap(([key, label]) => {
    const value = titlePage[key]?.trim();
    if (!value) return [];
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.length === 1
      ? [`${label}: ${lines[0]}`]
      : [`${label}:`, ...lines.map((line) => `   ${line}`)];
  });
  if (titleLines.length > 0) sections.push(titleLines.join("\n"));

  // Each paragraph is separated by a blank line. Dialogue (character, parentheticals,
  // dialogue) must stay on consecutive lines, so it shares one paragraph.
  let dialogue: string[] | null = null;

  for (const block of doc.content) {
    if (!isElementType(block.type)) continue;
    const type = block.type;
    const nodes = block.content ?? [];
    const plain = nodes.map((node) => node.text).join("");
    if (!plain.trim()) continue;

    const text = formatInline(nodes, UPPERCASE_ELEMENTS.has(type));

    if (type === "character") {
      dialogue = [forceCharacter(plain, text)];
      sections.push(dialogue[0]);
      continue;
    }
    if ((type === "parenthetical" || type === "dialogue") && dialogue) {
      dialogue.push(type === "parenthetical" ? wrapParens(text) : text);
      sections[sections.length - 1] = dialogue.join("\n");
      continue;
    }

    dialogue = null;
    sections.push(formatBlock(type, plain, text));
  }

  return sections.join("\n\n") + "\n";
}

function formatBlock(type: ElementType, plain: string, text: string) {
  switch (type) {
    case "sceneHeading":
      return isFountainSceneHeading(plain.trim()) ? text : `.${text}`;
    case "transition":
      return /TO:$/.test(plain.trim().toUpperCase()) ? text : `> ${text}`;
    case "parenthetical":
      return `!${wrapParens(text)}`;
    case "action":
    case "dialogue":
      return needsActionForcing(plain) ? `!${text}` : text;
    case "character":
      return text;
  }
}

function needsActionForcing(plain: string) {
  const trimmed = plain.trim();
  return (
    isFountainSceneHeading(trimmed) ||
    /^[.!@~=#>]/.test(trimmed) ||
    trimmed.startsWith("[[") ||
    (trimmed === trimmed.toUpperCase() && /TO:$/.test(trimmed))
  );
}

function forceCharacter(plain: string, text: string) {
  // Fountain needs at least one letter to recognise a character cue.
  return /\p{L}/u.test(plain) ? text : `@${text}`;
}

function wrapParens(text: string) {
  const trimmed = text.trim();
  return `${trimmed.startsWith("(") ? "" : "("}${trimmed}${trimmed.endsWith(")") ? "" : ")"}`;
}

function formatInline(nodes: TextJSON[], uppercase: boolean) {
  return nodes
    .map((node) => {
      let text = (uppercase ? node.text.toUpperCase() : node.text).replace(/([*_\\])/g, "\\$1");
      const marks = new Set((node.marks ?? []).map((mark) => mark.type));
      if (marks.has("bold") && marks.has("italic")) text = `***${text}***`;
      else if (marks.has("bold")) text = `**${text}**`;
      else if (marks.has("italic")) text = `*${text}*`;
      if (marks.has("underline")) text = `_${text}_`;
      return text;
    })
    .join("");
}
