import type { TextSpan } from "./quotes";

/**
 * A rendered document's text as one string, mapped back to its DOM text nodes. Blocks
 * (elements with `data-textblock`, see renderDoc) and hard breaks are separated by a line
 * break, so passages read as they look. Browser only.
 */
export type TextIndex = {
  text: string;
  nodes: Text[];
  /** Where each node's text starts in `text`. */
  starts: number[];
};

export function indexText(root: Element): TextIndex {
  let text = "";
  const nodes: Text[] = [];
  const starts: number[] = [];
  let block: Element | null = null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeName === "BR") {
      text += "\n";
      continue;
    }
    if (!(node instanceof Text) || node.data.length === 0) continue;

    const owner = node.parentElement?.closest("[data-textblock]") ?? null;
    if (owner !== block) {
      if (text) text += "\n";
      block = owner;
    }
    nodes.push(node);
    starts.push(text.length);
    text += node.data;
  }
  return { text, nodes, starts };
}

/**
 * The offset in the index's text of a DOM point, e.g. one end of a selection. Points
 * between elements, or outside the document, snap to the next text after them.
 */
export function offsetAt(index: TextIndex, container: Node, offset: number): number {
  if (container instanceof Text) {
    const at = index.nodes.indexOf(container);
    if (at !== -1) return index.starts[at] + offset;
  }
  const point = document.createRange();
  point.setStart(container, offset);
  const next = index.nodes.findIndex((node) => point.comparePoint(node, 0) >= 0);
  return next === -1 ? index.text.length : index.starts[next];
}

/** The text under a point on screen, e.g. a click. */
export function offsetAtPoint(index: TextIndex, x: number, y: number): number | null {
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    return position ? offsetAt(index, position.offsetNode, position.offset) : null;
  }
  // Older Safari only has the WebKit version.
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? offsetAt(index, range.startContainer, range.startOffset) : null;
}

/** A DOM range over a span of the index's text. */
export function rangeOf(index: TextIndex, { start, end }: TextSpan): Range | null {
  if (index.nodes.length === 0) return null;
  const from = locate(index, start, "start");
  const to = locate(index, end, "end");
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}

/** The node an offset falls in. On a boundary, starts take the next node and ends the previous one. */
function locate({ nodes, starts }: TextIndex, offset: number, edge: "start" | "end") {
  // The last node that starts at or before the offset (before it, for ends).
  let low = 0;
  let high = nodes.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (edge === "start" ? starts[middle] <= offset : starts[middle] < offset) low = middle;
    else high = middle - 1;
  }

  const node = nodes[low];
  const within = offset - starts[low];
  // A start just past a node's end (on a block break) moves to the next node.
  if (edge === "start" && within >= node.length && low + 1 < nodes.length) return { node: nodes[low + 1], offset: 0 };
  return { node, offset: Math.max(0, Math.min(node.length, within)) };
}

/** The block (see renderDoc) the text at an offset is in. */
export function blockAt(index: TextIndex, offset: number): Element | null {
  if (index.nodes.length === 0) return null;
  return locate(index, offset, "start").node.parentElement?.closest("[data-textblock]") ?? null;
}
