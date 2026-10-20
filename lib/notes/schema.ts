import { getSchema, type Extensions } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";

/** Everything that shapes a note's document. Safe to use on the server for validating saves. */
export function noteSchemaExtensions(): Extensions {
  return [
    // A trailing paragraph would be added on the first click into a note ending in a list,
    // which counts as an edit.
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, trailingNode: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ];
}

let schema: Schema | undefined;

export function noteSchema() {
  return (schema ??= getSchema(noteSchemaExtensions()));
}

const SAFE_HREF = /^(https?:|mailto:|tel:)/i;

/** Parses untrusted JSON into a note. Throws if it doesn't fit the schema or links anywhere unsafe. */
export function parseNoteDoc(json: unknown): ProseMirrorNode {
  const doc = noteSchema().nodeFromJSON(json);
  if (doc.type.name !== "doc") throw new Error("Expected a document.");
  doc.check();

  doc.descendants((node) => {
    for (const mark of node.marks) {
      if (mark.type.name === "link" && !SAFE_HREF.test(String(mark.attrs.href))) {
        throw new Error("Links must be web, email or phone links.");
      }
    }
  });

  return doc;
}
