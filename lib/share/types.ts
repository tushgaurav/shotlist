import type { CommentQuote } from "./quotes";

/** Tokens are random, 24 characters from nanoid's URL-safe alphabet. */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
export const SHARE_TOKEN_LENGTH = 24;

export const SHARE_PASSWORD_MIN_LENGTH = 4;
export const SHARE_PASSWORD_MAX_LENGTH = 128;

export const COMMENT_MAX_LENGTH = 5000;
export const COMMENTER_NAME_MAX_LENGTH = 60;

export type ShareKind = "script" | "note";

/** What can be shared: the project's script, or one of its notes. */
export type ShareTarget = { kind: "script" } | { kind: "note"; noteId: string };

/** A link as its owner sees it. */
export type ShareSettings = {
  id: string;
  token: string;
  enabled: boolean;
  hasPassword: boolean;
  allowComments: boolean;
  /** Comment threads that aren't resolved. */
  openComments: number;
};

/** A comment as the shared page shows it. */
export type SharedComment = {
  id: string;
  /** The thread's first comment, for replies. */
  parentId: string | null;
  authorName: string;
  byOwner: boolean;
  /** Written by whoever is looking: from this browser, or by the owner when it's them. */
  mine: boolean;
  body: string;
  quote: CommentQuote | null;
  resolvedAt: string | null;
  createdAt: string;
};

export function sharePath(token: string) {
  return `/s/${token}`;
}
