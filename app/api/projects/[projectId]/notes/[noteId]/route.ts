import type { NextRequest } from "next/server";
import { z } from "zod";

import { saveNote } from "@/lib/dal/notes";
import { parseNoteDoc } from "@/lib/notes/schema";
import { noteText } from "@/lib/notes/text";
import { NOTE_ID_PATTERN, type NoteDocJSON } from "@/lib/notes/types";
import { readBody } from "@/lib/read-body";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

const bodySchema = z.object({
  revision: z.number().int().nonnegative(),
  draft: z.unknown(),
});

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/notes/[noteId]">) {
  const { projectId, noteId } = await ctx.params;
  if (!NOTE_ID_PATTERN.test(noteId)) return errorResponse(404, "Note not found.");

  const raw = await readBody(request, MAX_BODY_BYTES);
  if (raw === null) return errorResponse(413, "This note is too large to save.");

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(JSON.parse(raw));
  } catch {
    return errorResponse(400, "Invalid request.");
  }

  let doc: ReturnType<typeof parseNoteDoc>;
  try {
    doc = parseNoteDoc(body.draft);
  } catch {
    return errorResponse(400, "The note couldn't be read.");
  }

  const result = await saveNote(projectId, noteId, doc.toJSON() as NoteDocJSON, noteText(doc), body.revision);
  switch (result.status) {
    case "saved":
      return Response.json({ revision: result.revision, savedAt: result.savedAt });
    case "conflict":
      return Response.json(
        { error: "This note was saved somewhere else.", revision: result.revision },
        { status: 409 },
      );
    case "unauthorized":
      return errorResponse(401, "You're signed out.");
    case "not_found":
      return errorResponse(404, "Note not found.");
  }
}

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}
