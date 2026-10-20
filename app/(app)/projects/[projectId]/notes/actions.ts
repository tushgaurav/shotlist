"use server";

import { z } from "zod";

import { setNoteDeleted } from "@/lib/dal/notes";
import { NOTE_ID_PATTERN } from "@/lib/notes/types";

const projectId = z.string().min(1).max(64);
const noteId = z.string().regex(NOTE_ID_PATTERN);

// The notes page keeps its own list, so there's nothing to refresh.
export async function deleteNoteAction(project: string, note: string) {
  await setNoteDeleted(projectId.parse(project), noteId.parse(note), true);
}

export async function restoreNoteAction(project: string, note: string) {
  await setNoteDeleted(projectId.parse(project), noteId.parse(note), false);
}
