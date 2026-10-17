import { getSchema, type Extensions } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import Italic from "@tiptap/extension-italic";
import Text from "@tiptap/extension-text";
import Underline from "@tiptap/extension-underline";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

import { SCENE_ID_PATTERN } from "../types";
import { elementNodes } from "./nodes";

/** Just the schema: safe to use on the server for validating saved documents. */
export function screenplaySchemaExtensions(): Extensions {
  return [Document, Text, ...elementNodes, Bold, Italic, Underline];
}

let schema: Schema | undefined;

export function screenplaySchema() {
  return (schema ??= getSchema(screenplaySchemaExtensions()));
}

/**
 * Parses untrusted JSON into a screenplay document. Throws if it doesn't fit the schema or
 * any scene heading lacks a unique, valid ID.
 */
export function parseScreenplayDoc(json: unknown): ProseMirrorNode {
  const doc = screenplaySchema().nodeFromJSON(json);
  if (doc.type.name !== "doc") throw new Error("Expected a document.");
  doc.check();

  const seen = new Set<string>();
  doc.forEach((node) => {
    if (node.type.name !== "sceneHeading") return;
    const id = node.attrs.sceneId;
    if (typeof id !== "string" || !SCENE_ID_PATTERN.test(id) || seen.has(id)) {
      throw new Error("Every scene heading needs a unique ID.");
    }
    seen.add(id);
  });

  return doc;
}
