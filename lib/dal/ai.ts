import "server-only";

import { and, eq } from "drizzle-orm";

import {
  ATTACHMENT_MAX_BYTES,
  attachmentFile,
  attachmentUrl,
  type AttachmentType,
} from "@/lib/ai/attachments";
import type { AttachmentStore } from "@/lib/ai/chat-attachments";
import type { AiProject } from "@/lib/ai/context";
import { db } from "@/lib/db";
import { projects, projectTypes, scripts } from "@/lib/db/schema";
import { newId } from "@/lib/id";
import type { UploadForm, UploadResult } from "@/lib/shots/images";
import { presignUpload, readObject, signedDownloadUrl, statObject, storageEnabled } from "@/lib/storage/s3";

import { ownsProject } from "./assets";
import { getCurrentUser } from "./session";

export type AiProjectResult =
  | { status: "ok"; project: AiProject }
  | { status: "unauthorized" }
  | { status: "not_found" };

/** The project details the AI writes from, for Route Handlers. */
export async function getAiProject(projectId: string): Promise<AiProjectResult> {
  const user = await getCurrentUser();
  if (!user) return { status: "unauthorized" };

  const [row] = await db
    .select({
      title: projects.title,
      typeName: projectTypes.name,
      logline: projects.logline,
      synopsis: projects.synopsis,
      genre: projects.genre,
      tone: projects.tone,
      targetRuntimeMinutes: projects.targetRuntimeMinutes,
      aspectRatio: projects.aspectRatio,
      language: projects.language,
      titlePage: scripts.titlePage,
    })
    .from(projects)
    .leftJoin(projectTypes, eq(projectTypes.id, projects.typeId))
    .leftJoin(scripts, eq(scripts.projectId, projects.id))
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
    .limit(1);

  if (!row) return { status: "not_found" };
  return { status: "ok", project: { ...row, titlePage: row.titlePage ?? {} } };
}

/** Under its own prefix, so a lifecycle rule can expire chat files without touching anything else. */
function attachmentKey(projectId: string, file: string) {
  return `chat/${projectId}/${file}`;
}

/** An upload form for a file attached in the assistant's chat, and the URL the message keeps. */
export async function startAttachmentUpload(
  projectId: string,
  contentType: AttachmentType,
): Promise<UploadResult<{ url: string; form: UploadForm }>> {
  if (!storageEnabled()) return { ok: false, error: "unavailable" };
  const denied = await ownsProject(projectId);
  if (denied) return denied;

  const file = attachmentFile(newId(), contentType);
  const form = await presignUpload(attachmentKey(projectId, file), contentType, ATTACHMENT_MAX_BYTES[contentType]);
  return { ok: true, url: attachmentUrl(projectId, file), form };
}

/** A temporary S3 URL for one of the signed-in user's chat attachments, or null. */
export async function getAttachmentDownload(projectId: string, file: string) {
  if (!storageEnabled()) return null;
  if (await ownsProject(projectId)) return null;
  return signedDownloadUrl(attachmentKey(projectId, file));
}

/** One project's attachments, for the chat route once getAiProject has found the project. */
export function attachmentStore(projectId: string): AttachmentStore | null {
  if (!storageEnabled()) return null;
  return {
    stat: (file) => statObject(attachmentKey(projectId, file)),
    read: (file) => readObject(attachmentKey(projectId, file)),
    url: async (file) => (await signedDownloadUrl(attachmentKey(projectId, file))).url,
  };
}
