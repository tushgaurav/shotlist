import type { JSONContent } from "@tiptap/core";

/** Note IDs are generated in the browser, so a new note opens without waiting for the server. */
export const NOTE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type NoteDocJSON = { type: "doc"; content?: JSONContent[] };

/** What the notes page gets for each note. */
export type NoteData = {
  id: string;
  content: NoteDocJSON;
  /** Plain-text rendering; see noteText. */
  text: string;
  /** 0 for a note that hasn't been saved yet. */
  revision: number;
  updatedAt: string;
};

export function emptyNote(): NoteDocJSON {
  return { type: "doc", content: [{ type: "paragraph" }] };
}
