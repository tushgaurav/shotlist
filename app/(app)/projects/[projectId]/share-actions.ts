"use server";

import { z } from "zod";

import { enableShare, getShareSettings, resetShareLink, setSharePassword, updateShare } from "@/lib/dal/shares";
import { NOTE_ID_PATTERN } from "@/lib/notes/types";
import {
  SHARE_PASSWORD_MAX_LENGTH,
  SHARE_PASSWORD_MIN_LENGTH,
  type ShareSettings,
  type ShareTarget,
} from "@/lib/share/types";

const projectId = z.string().min(1).max(64);
const shareId = z.string().min(1).max(64);

const shareTarget: z.ZodType<ShareTarget> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("script") }).strict(),
  z.object({ kind: z.literal("note"), noteId: z.string().regex(NOTE_ID_PATTERN) }).strict(),
]);

const sharePatch = z.object({ enabled: z.boolean(), allowComments: z.boolean() }).partial().strict();

// Recipients type it in, so spaces either side would only trip them up.
const password = z
  .string()
  .trim()
  .min(SHARE_PASSWORD_MIN_LENGTH, `Use at least ${SHARE_PASSWORD_MIN_LENGTH} characters.`)
  .max(SHARE_PASSWORD_MAX_LENGTH, `Keep the password under ${SHARE_PASSWORD_MAX_LENGTH} characters.`)
  .nullable();

export async function getShareAction(project: string, target: ShareTarget) {
  return getShareSettings(projectId.parse(project), shareTarget.parse(target));
}

/** Null if the note isn't saved yet or was deleted. */
export async function enableShareAction(project: string, target: ShareTarget) {
  return enableShare(projectId.parse(project), shareTarget.parse(target));
}

export async function updateShareAction(id: string, patch: z.infer<typeof sharePatch>) {
  return updateShare(shareId.parse(id), sharePatch.parse(patch));
}

export async function setSharePasswordAction(
  id: string,
  value: string | null,
): Promise<{ error: string } | { settings: ShareSettings }> {
  const parsed = password.safeParse(value);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return { settings: await setSharePassword(shareId.parse(id), parsed.data) };
}

export async function resetShareLinkAction(id: string) {
  return resetShareLink(shareId.parse(id));
}
