"use server";

import { z } from "zod";

import { ATTACHMENT_TYPES, type AttachmentType } from "@/lib/ai/attachments";
import { startAttachmentUpload } from "@/lib/dal/ai";

export async function startAttachmentUploadAction(projectId: string, contentType: AttachmentType) {
  const parsed = z
    .object({ projectId: z.string().min(1).max(64), contentType: z.enum(ATTACHMENT_TYPES) })
    .safeParse({ projectId, contentType });
  if (!parsed.success) return { ok: false, error: "invalid" } as const;
  return startAttachmentUpload(parsed.data.projectId, parsed.data.contentType);
}
