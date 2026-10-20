import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * The note as plain text, one line per block, for the notes list, search and the AI.
 * Headings, lists, checklists and quotes keep Markdown-style markers so they still read
 * as such.
 */
export function noteText(doc: ProseMirrorNode): string {
  const lines: string[] = [];

  const textLines = (node: ProseMirrorNode, first: string, rest: string) => {
    node
      .textBetween(0, node.content.size, "\n", "\n")
      .split("\n")
      .forEach((line, index) => lines.push((index === 0 ? first : rest) + line));
  };

  const block = (node: ProseMirrorNode, prefix: string) => {
    switch (node.type.name) {
      case "heading":
        textLines(node, `${prefix}${"#".repeat(node.attrs.level)} `, prefix);
        break;
      case "codeBlock":
        textLines(node, prefix, prefix);
        break;
      case "horizontalRule":
        lines.push(`${prefix}---`);
        break;
      case "blockquote":
        node.forEach((child) => block(child, `${prefix}> `));
        break;
      case "bulletList":
      case "orderedList":
      case "taskList":
        node.forEach((item, _, index) => {
          const marker =
            node.type.name === "orderedList"
              ? `${(node.attrs.start ?? 1) + index}. `
              : node.type.name === "taskList"
                ? item.attrs.checked
                  ? "[x] "
                  : "[ ] "
                : "- ";
          const indent = prefix + " ".repeat(marker.length);
          item.forEach((child, _, childIndex) => {
            if (childIndex > 0) return block(child, indent);
            if (child.isTextblock) return textLines(child, prefix + marker, indent);
            lines.push(prefix + marker.trimEnd());
            block(child, indent);
          });
        });
        break;
      default:
        if (node.isTextblock) textLines(node, prefix, prefix);
        else node.forEach((child) => block(child, prefix));
    }
  };

  doc.forEach((child) => block(child, ""));
  return lines
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MARKERS = /^\s*(?:(?:#{1,6}|[-*]|\d+\.|\[[ x]\]|>)\s+)*/;

/** A line of noteText without its Markdown-style markers. */
function bareLine(line: string) {
  return line.trim() === "---" ? "" : line.replace(MARKERS, "").trim();
}

/** The first line is the note's title, as in most notes apps. Empty if the note is. */
export function noteTitle(text: string): string {
  for (const line of text.split("\n")) {
    const bare = bareLine(line);
    if (bare) return bare;
  }
  return "";
}

/** What follows the title, on one line, for the notes list. */
export function notePreview(text: string, maxLength = 160): string {
  const rest = text.split("\n").map(bareLine).filter(Boolean).slice(1).join(" ");
  return rest.length > maxLength ? `${rest.slice(0, maxLength - 1).trimEnd()}…` : rest;
}
