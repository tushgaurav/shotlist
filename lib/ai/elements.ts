import { isElementType } from "../screenplay/elements";
import type { ScreenplayElement } from "./schema";

/**
 * Turns model output (possibly still streaming) into lines the editor can show. Lines whose
 * type hasn't fully arrived are skipped, stray Fountain symbols are dropped, and a line with
 * blank lines in it becomes several lines of the same type.
 */
export function cleanElements(raw: unknown, { final = false } = {}): ScreenplayElement[] {
  if (!Array.isArray(raw)) return [];
  const result: ScreenplayElement[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { type, text } = item as { type?: unknown; text?: unknown };
    if (typeof type !== "string" || !isElementType(type) || typeof text !== "string") continue;

    const paragraphs = text.replace(/\r/g, "").split(/\n[ \t]*\n/);
    for (const paragraph of paragraphs) {
      let line = cleanLine(type, paragraph.replace(/\s*\n\s*/g, " ").replace(/^\s+/, ""), final);
      if (final) line = line.trimEnd();
      if (final && !line) continue;
      result.push({ type, text: line });
    }
  }

  // While streaming, an empty last line would only flash its placeholder.
  if (!final && result.at(-1)?.text === "") result.pop();
  return result;
}

function cleanLine(type: ScreenplayElement["type"], text: string, final: boolean) {
  switch (type) {
    case "sceneHeading":
      return text.replace(/^\.(?=[^.])/, "");
    case "character":
      return text.replace(/^@/, "").replace(/:\s*$/, "");
    case "transition":
      return text.replace(/^>\s*/, "");
    case "action":
      return text.replace(/^!(?=\S)/, "");
    case "parenthetical": {
      const opened = text.startsWith("(") ? text : `(${text}`;
      return final && !opened.trimEnd().endsWith(")") ? `${opened.trimEnd()})` : opened;
    }
    case "dialogue":
      return text;
  }
}
