"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { addComment, deleteComment, setCommentResolved, unlockShare, type CommentInput } from "@/lib/dal/shares";
import { QUOTE_CONTEXT, QUOTE_MAX_LENGTH } from "@/lib/share/quotes";
import {
  COMMENT_MAX_LENGTH,
  COMMENTER_NAME_MAX_LENGTH,
  SHARE_PASSWORD_MAX_LENGTH,
  SHARE_TOKEN_PATTERN,
  type SharedComment,
} from "@/lib/share/types";

const token = z.string().regex(SHARE_TOKEN_PATTERN);
const commentId = z.string().min(1).max(64);

export type UnlockState = { error?: string };

export async function unlockAction(shareToken: string, _prev: UnlockState, formData: FormData): Promise<UnlockState> {
  const parsedToken = token.safeParse(shareToken);
  if (!parsedToken.success) return { error: "This link isn't available." };
  // Trimmed like the owner's copy, so stray spaces from pasting don't count.
  const password = String(formData.get("password") ?? "").trim();
  if (!password) return { error: "Enter the password." };
  if (password.length > SHARE_PASSWORD_MAX_LENGTH) return { error: "That password isn't right." };

  switch (await unlockShare(parsedToken.data, password)) {
    case "unlocked":
      refresh();
      return {};
    case "wrong":
      return { error: "That password isn't right." };
    case "locked_out":
      return { error: "Too many wrong passwords. Try again in 15 minutes." };
    case "not_found":
      return { error: "This link isn't available anymore." };
  }
}

const commentInput: z.ZodType<CommentInput> = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, "Write a comment first.")
      .max(COMMENT_MAX_LENGTH, `Keep comments under ${COMMENT_MAX_LENGTH} characters.`),
    quote: z
      .object({
        exact: z.string().min(1).max(QUOTE_MAX_LENGTH, "Select a shorter passage to comment on."),
        prefix: z.string().max(QUOTE_CONTEXT),
        suffix: z.string().max(QUOTE_CONTEXT),
      })
      .strict()
      .nullable(),
    parentId: commentId.nullable(),
    authorName: z
      .string()
      .trim()
      .min(1, "Add your name, so they know who's commenting.")
      .max(COMMENTER_NAME_MAX_LENGTH, `Keep your name under ${COMMENTER_NAME_MAX_LENGTH} characters.`),
  })
  .strict();

const COMMENT_ERRORS = {
  not_found: "This link or comment isn't available anymore. Reload the page.",
  closed: "Comments were turned off.",
  too_many: "Lots of comments are coming in. Wait a minute and try again.",
} as const;

export async function addCommentAction(
  shareToken: string,
  input: CommentInput,
): Promise<{ comment: SharedComment } | { error: string }> {
  const parsed = z.object({ token, input: commentInput }).safeParse({ token: shareToken, input });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await addComment(parsed.data.token, parsed.data.input);
  return result.ok ? { comment: result.comment } : { error: COMMENT_ERRORS[result.error] };
}

export async function deleteCommentAction(shareToken: string, id: string): Promise<boolean> {
  return deleteComment(token.parse(shareToken), commentId.parse(id));
}

export async function setCommentResolvedAction(shareToken: string, id: string, resolved: boolean): Promise<boolean> {
  return setCommentResolved(token.parse(shareToken), commentId.parse(id), z.boolean().parse(resolved));
}
