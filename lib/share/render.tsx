import type { DOMOutputSpec, Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { createElement, type ReactNode } from "react";

const SAFE_HREF = /^(https?:|mailto:|tel:)/i;

/**
 * A document as read-only React elements, built from its schema's own toDOM specs so it
 * comes out as the editor shows it, with no editor needed. Textblocks get
 * `data-textblock`, which comment anchoring uses to put line breaks between blocks.
 */
export function renderDoc(doc: ProseMirrorNode): ReactNode {
  return renderChildren(doc);
}

function renderChildren(node: ProseMirrorNode): ReactNode[] {
  const children: ReactNode[] = [];
  node.forEach((child, _, index) => children.push(renderNode(child, index)));
  return children;
}

function renderNode(node: ProseMirrorNode, key: number): ReactNode {
  if (node.isText) {
    return node.marks.reduceRight<ReactNode>(
      (inner, mark, index) => renderMark(mark, inner, index === 0 ? key : 0),
      node.text,
    );
  }
  const spec = node.type.spec.toDOM?.(node);
  if (!spec) return null;
  return fromSpec(spec, renderChildren(node), key, node.isTextblock ? { "data-textblock": "" } : undefined);
}

function renderMark(mark: Mark, inner: ReactNode, key: number): ReactNode {
  const spec = mark.type.spec.toDOM?.(mark, true);
  return spec ? fromSpec(spec, [inner], key) : inner;
}

/** A toDOM spec as a React element, with `content` in its hole (the 0). */
function fromSpec(spec: DOMOutputSpec, content: ReactNode[], key: number, extra?: Record<string, string>): ReactNode {
  if (typeof spec === "string") return spec;
  if (!Array.isArray(spec)) return null;

  const [tag, ...rest] = spec as readonly [string, ...unknown[]];
  const attrs = isAttrs(rest[0]) ? (rest.shift() as Record<string, unknown>) : {};
  const children = rest.flatMap((child, index) =>
    child === 0 ? content : [fromSpec(child as DOMOutputSpec, content, index)],
  );
  return createElement(tag, { key, ...toProps(tag, attrs), ...extra }, ...children);
}

function isAttrs(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toProps(tag: string, attrs: Record<string, unknown>) {
  const props: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === "class") props.className = value;
    else if (name === "style") continue;
    // Checklists can't be ticked by readers.
    else if (name === "checked") props.defaultChecked = true;
    else if (name === "href") {
      if (SAFE_HREF.test(String(value))) props.href = value;
    } else props[name] = typeof value === "string" ? value : String(value);
  }
  if (tag === "input") props.disabled = true;
  return props;
}
