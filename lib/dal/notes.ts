import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { notes, projects } from "@/lib/db/schema";
import type { NoteDocJSON } from "@/lib/notes/types";

import { getProject } from "./projects";
import type { SaveDraftResult } from "./scripts";
import { getCurrentUser, requireUser } from "./session";

/** The project's notes, most recently edited first. */
export const listNotes = cache(async (projectId: string) => {
  await getProject(projectId);
  return db
    .select({
      id: notes.id,
      content: notes.content,
      text: notes.text,
      revision: notes.revision,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(and(eq(notes.projectId, projectId), isNull(notes.deletedAt)))
    .orderBy(desc(notes.updatedAt));
});

/**
 * Saves a note if `baseRevision` is still current. Revision 0 is a new note, which this
 * creates. A stale revision means another tab saved first; nothing is written.
 */
export async function saveNote(
  projectId: string,
  noteId: string,
  content: NoteDocJSON,
  text: string,
  baseRevision: number,
): Promise<SaveDraftResult> {
  const user = await getCurrentUser();
  if (!user) return { status: "unauthorized" };

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
    .limit(1);
  if (!project) return { status: "not_found" };

  const saved = { revision: notes.revision, savedAt: notes.updatedAt };
  const [result] =
    baseRevision === 0
      ? await db.insert(notes).values({ id: noteId, projectId, content, text }).onConflictDoNothing().returning(saved)
      : // The revision check lives in the WHERE clause so two concurrent saves can't both win.
        await db
          .update(notes)
          .set({ content, text, revision: sql`${notes.revision} + 1` })
          .where(
            and(
              eq(notes.id, noteId),
              eq(notes.projectId, projectId),
              eq(notes.revision, baseRevision),
              isNull(notes.deletedAt),
            ),
          )
          .returning(saved);
  if (result) return { status: "saved", ...result };

  const [current] = await db
    .select({ revision: notes.revision })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.projectId, projectId), isNull(notes.deletedAt)))
    .limit(1);
  return current ? { status: "conflict", revision: current.revision } : { status: "not_found" };
}

/** Deletes a note, or brings it back. Doesn't count as an edit. */
export async function setNoteDeleted(projectId: string, noteId: string, deleted: boolean) {
  const user = await requireUser();
  const ownedProjects = db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, user.id));

  await db
    .update(notes)
    .set({ deletedAt: deleted ? new Date() : null, updatedAt: sql`${notes.updatedAt}` })
    .where(and(eq(notes.id, noteId), eq(notes.projectId, projectId), inArray(notes.projectId, ownedProjects)));
}
