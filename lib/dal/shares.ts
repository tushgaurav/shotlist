import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, asc, count, eq, gt, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { db } from "@/lib/db";
import { notes, projects, scripts, shareComments, shares, type ShareComment } from "@/lib/db/schema";
import { newId } from "@/lib/id";
import type { NoteDocJSON } from "@/lib/notes/types";
import { noteTitle } from "@/lib/notes/text";
import type { ScreenplayDocJSON, TitlePage } from "@/lib/screenplay/types";
import type { CommentQuote } from "@/lib/share/quotes";
import {
  SHARE_TOKEN_LENGTH,
  SHARE_TOKEN_PATTERN,
  type SharedComment,
  type ShareKind,
  type ShareSettings,
  type ShareTarget,
} from "@/lib/share/types";

import { getProject } from "./projects";
import { getCurrentUser, requireUser, type CurrentUser } from "./session";

// ── The owner's side ────────────────────────────────────────────────────────────────

const settingsColumns = {
  id: shares.id,
  token: shares.token,
  enabled: shares.enabled,
  hasPassword: sql<boolean>`${shares.passwordHash} is not null`,
  allowComments: shares.allowComments,
  openComments: sql<number>`(
    select count(*) from ${shareComments}
    where ${shareComments.shareId} = ${shares.id}
      and ${shareComments.parentId} is null
      and ${shareComments.resolvedAt} is null
  )`.mapWith(Number),
};

/** The links in a project: the script's, and each note's by note ID. */
export const listShares = cache(async (projectId: string) => {
  await getProject(projectId);
  const rows = await db
    .select({ ...settingsColumns, noteId: shares.noteId })
    .from(shares)
    .where(eq(shares.projectId, projectId));

  let script: ShareSettings | null = null;
  const byNote: Record<string, ShareSettings> = {};
  for (const { noteId, ...settings } of rows) {
    if (noteId) byNote[noteId] = settings;
    else script = settings;
  }
  return { script, notes: byNote };
});

export async function getShareSettings(projectId: string, target: ShareTarget): Promise<ShareSettings | null> {
  await getProject(projectId);
  return selectSettings(and(eq(shares.projectId, projectId), targetIs(target)));
}

/**
 * Turns the document's link on, making it the first time. Null if the note isn't saved
 * yet or was deleted.
 */
export async function enableShare(projectId: string, target: ShareTarget): Promise<ShareSettings | null> {
  await getProject(projectId);

  const document = await findTarget(projectId, target);
  if (!document) return null;

  await db
    .insert(shares)
    .values({ id: newId(), projectId, ...document, token: nanoid(SHARE_TOKEN_LENGTH) })
    .onConflictDoUpdate({ target: "noteId" in document ? shares.noteId : shares.scriptId, set: { enabled: true } });

  return selectSettings(and(eq(shares.projectId, projectId), targetIs(target)));
}

export async function updateShare(shareId: string, patch: { enabled?: boolean; allowComments?: boolean }) {
  return updateOwnedShare(shareId, patch);
}

/** Sets, changes or removes the password. Anyone who unlocked the link has to enter the new one. */
export async function setSharePassword(shareId: string, password: string | null) {
  const passwordHash = password === null ? null : await hashPassword(password);
  return updateOwnedShare(shareId, { passwordHash, failedUnlocks: 0, lockedUntil: null });
}

/** A new link for the same document. The old one stops working; comments stay. */
export async function resetShareLink(shareId: string) {
  return updateOwnedShare(shareId, { token: nanoid(SHARE_TOKEN_LENGTH) });
}

async function updateOwnedShare(shareId: string, values: Partial<typeof shares.$inferInsert>): Promise<ShareSettings> {
  const user = await requireUser();
  const ownedProjects = db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, user.id));
  const updated = await db
    .update(shares)
    .set(values)
    .where(and(eq(shares.id, shareId), inArray(shares.projectId, ownedProjects)))
    .returning({ id: shares.id });
  if (updated.length === 0) notFound();

  const settings = await selectSettings(eq(shares.id, shareId));
  if (!settings) notFound();
  return settings;
}

async function selectSettings(where: SQL | undefined): Promise<ShareSettings | null> {
  const [settings] = await db.select(settingsColumns).from(shares).where(where).limit(1);
  return settings ?? null;
}

function targetIs(target: ShareTarget) {
  return target.kind === "script" ? isNotNull(shares.scriptId) : eq(shares.noteId, target.noteId);
}

/** The row the link points at, if the project has it. */
async function findTarget(projectId: string, target: ShareTarget) {
  if (target.kind === "script") {
    const [script] = await db
      .select({ id: scripts.id })
      .from(scripts)
      .where(eq(scripts.projectId, projectId))
      .limit(1);
    return script ? { scriptId: script.id } : null;
  }

  const [note] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, target.noteId), eq(notes.projectId, projectId), isNull(notes.deletedAt)))
    .limit(1);
  return note ? { noteId: note.id } : null;
}

// ── The shared page ─────────────────────────────────────────────────────────────────

const UNLOCK_DAYS = 30;
const COMMENTER_DAYS = 365;
const MAX_FAILED_UNLOCKS = 10;
const LOCKOUT_MINUTES = 15;
/** Comments a minute from people with the link, across all of them. */
const MAX_COMMENTS_PER_MINUTE = 10;

const COMMENTER_COOKIE = "shotlist_commenter";
const unlockCookie = (shareId: string) => `shotlist_share_${shareId}`;

const cookieOptions = (days: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: days * 24 * 60 * 60,
});

const findShare = cache(async (token: string) => {
  if (!SHARE_TOKEN_PATTERN.test(token)) return null;
  const [share] = await db
    .select({
      id: shares.id,
      projectId: shares.projectId,
      ownerId: projects.ownerId,
      projectTitle: projects.title,
      scriptId: shares.scriptId,
      noteId: shares.noteId,
      enabled: shares.enabled,
      passwordHash: shares.passwordHash,
      failedUnlocks: shares.failedUnlocks,
      lockedUntil: shares.lockedUntil,
      allowComments: shares.allowComments,
    })
    .from(shares)
    .innerJoin(projects, eq(projects.id, shares.projectId))
    .where(eq(shares.token, token))
    .limit(1);
  return share ?? null;
});

type ShareRecord = NonNullable<Awaited<ReturnType<typeof findShare>>>;

type Access =
  | { status: "ok"; share: ShareRecord; owner: CurrentUser | null }
  | { status: "locked"; share: ShareRecord }
  | { status: "not_found" };

/**
 * Who may open a link: its owner always (signed in, no password), and anyone else while
 * it's on, once they've entered its password if it has one.
 */
async function access(token: string): Promise<Access> {
  const share = await findShare(token);
  if (!share) return { status: "not_found" };

  const user = await getCurrentUser();
  if (user?.id === share.ownerId) return { status: "ok", share, owner: user };
  if (!share.enabled) return { status: "not_found" };
  if (share.passwordHash && !(await isUnlocked(share))) return { status: "locked", share };
  return { status: "ok", share, owner: null };
}

export type SharedDocument =
  | { kind: "script"; title: string; draft: ScreenplayDocJSON; titlePage: TitlePage }
  | { kind: "note"; title: string; content: NoteDocJSON };

export type SharedView =
  | { status: "not_found" }
  | { status: "locked"; kind: ShareKind }
  | {
      status: "ok";
      projectTitle: string;
      document: SharedDocument;
      /** Off only when the owner is looking; nobody else gets in. */
      enabled: boolean;
      allowComments: boolean;
      /** When it's the owner looking: their name, and where they edit the document. */
      owner: { name: string; editHref: string } | null;
      /** Empty for everyone but the owner while comments are off. */
      comments: SharedComment[];
    };

/** What a link shows to whoever opened it. */
export const getSharedView = cache(async (token: string): Promise<SharedView> => {
  const result = await access(token);
  if (result.status === "not_found") return result;
  if (result.status === "locked") return { status: "locked", kind: result.share.scriptId ? "script" : "note" };

  const { share, owner } = result;
  const document = await loadDocument(share);
  if (!document) return { status: "not_found" };

  const showComments = share.allowComments || owner !== null;
  return {
    status: "ok",
    projectTitle: share.projectTitle,
    document,
    enabled: share.enabled,
    allowComments: share.allowComments,
    owner: owner && {
      name: owner.name,
      editHref: share.noteId
        ? `/projects/${share.projectId}/notes?note=${encodeURIComponent(share.noteId)}`
        : `/projects/${share.projectId}/script`,
    },
    comments: showComments ? await listComments(share.id, owner !== null) : [],
  };
});

async function loadDocument(share: ShareRecord): Promise<SharedDocument | null> {
  if (share.scriptId) {
    const [script] = await db
      .select({ draft: scripts.draft, titlePage: scripts.titlePage })
      .from(scripts)
      .where(eq(scripts.id, share.scriptId))
      .limit(1);
    if (!script) return null;
    const title = script.titlePage.title?.trim() || share.projectTitle;
    return { kind: "script", title, draft: script.draft, titlePage: script.titlePage };
  }

  if (!share.noteId) return null;
  const [note] = await db
    .select({ content: notes.content, text: notes.text })
    .from(notes)
    .where(and(eq(notes.id, share.noteId), isNull(notes.deletedAt)))
    .limit(1);
  return note ? { kind: "note", title: noteTitle(note.text) || "Untitled Note", content: note.content } : null;
}

export type UnlockResult = "unlocked" | "wrong" | "locked_out" | "not_found";

/**
 * Checks a link's password and, if it's right, remembers that in a cookie for this
 * browser. Ten wrong ones in a row lock the link for 15 minutes, for everyone.
 */
export async function unlockShare(token: string, password: string): Promise<UnlockResult> {
  const share = await findShare(token);
  if (!share || !share.enabled) return "not_found";
  if (!share.passwordHash) return "unlocked";
  if (share.lockedUntil && share.lockedUntil > new Date()) return "locked_out";

  if (!(await verifyPassword({ hash: share.passwordHash, password }))) {
    const failures = sql`${shares.failedUnlocks} + 1`;
    const lockNow = sql`${failures} >= ${MAX_FAILED_UNLOCKS}`;
    await db
      .update(shares)
      .set({
        failedUnlocks: sql`case when ${lockNow} then 0 else ${failures} end`,
        lockedUntil: sql`case when ${lockNow} then now() + make_interval(mins => ${LOCKOUT_MINUTES}) else ${shares.lockedUntil} end`,
        updatedAt: sql`${shares.updatedAt}`,
      })
      .where(eq(shares.id, share.id));
    return "wrong";
  }

  if (share.failedUnlocks > 0) {
    await db
      .update(shares)
      .set({ failedUnlocks: 0, updatedAt: sql`${shares.updatedAt}` })
      .where(eq(shares.id, share.id));
  }
  (await cookies()).set(unlockCookie(share.id), unlockProof(share.id, share.passwordHash), cookieOptions(UNLOCK_DAYS));
  return "unlocked";
}

async function isUnlocked(share: ShareRecord) {
  const value = (await cookies()).get(unlockCookie(share.id))?.value;
  if (!value || !share.passwordHash) return false;
  const expected = Buffer.from(unlockProof(share.id, share.passwordHash));
  const actual = Buffer.from(value);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Signed with the password's hash, so changing or removing the password logs everyone out. */
function unlockProof(shareId: string, passwordHash: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set. Add it to .env.local.");
  return createHmac("sha256", secret).update(`share:${shareId}:${passwordHash}`).digest("base64url");
}

// ── Comments ────────────────────────────────────────────────────────────────────────

const commentColumns = {
  id: shareComments.id,
  parentId: shareComments.parentId,
  authorName: shareComments.authorName,
  byOwner: shareComments.byOwner,
  authorKeyHash: shareComments.authorKeyHash,
  body: shareComments.body,
  quote: shareComments.quote,
  resolvedAt: shareComments.resolvedAt,
  createdAt: shareComments.createdAt,
};

type CommentRow = Omit<ShareComment, "shareId">;

async function listComments(shareId: string, viewerIsOwner: boolean): Promise<SharedComment[]> {
  const [rows, keyHash] = await Promise.all([
    db
      .select(commentColumns)
      .from(shareComments)
      .where(eq(shareComments.shareId, shareId))
      .orderBy(asc(shareComments.createdAt), asc(shareComments.id)),
    commenterKeyHash(),
  ]);
  return rows.map((row) => toSharedComment(row, viewerIsOwner ? row.byOwner : isAuthor(row, keyHash)));
}

// Spelled out, so the author's key hash (or any column added later) never reaches the page.
function toSharedComment(row: CommentRow, mine: boolean): SharedComment {
  return {
    id: row.id,
    parentId: row.parentId,
    authorName: row.authorName,
    byOwner: row.byOwner,
    mine,
    body: row.body,
    quote: row.quote,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function isAuthor(row: { authorKeyHash: string | null }, keyHash: string | null) {
  return keyHash !== null && row.authorKeyHash === keyHash;
}

export type CommentInput = {
  body: string;
  /** Replies have no passage of their own. */
  quote: CommentQuote | null;
  parentId: string | null;
  /** Ignored for the owner, who comments under their account's name. */
  authorName: string;
};

export type CommentResult =
  | { ok: true; comment: SharedComment }
  | { ok: false; error: "not_found" | "closed" | "too_many" };

export async function addComment(token: string, input: CommentInput): Promise<CommentResult> {
  const result = await access(token);
  if (result.status !== "ok") return { ok: false, error: "not_found" };
  const { share, owner } = result;
  if (!share.allowComments) return { ok: false, error: "closed" };

  if (input.parentId) {
    const [parent] = await db
      .select({ id: shareComments.id })
      .from(shareComments)
      .where(
        and(
          eq(shareComments.id, input.parentId),
          eq(shareComments.shareId, share.id),
          isNull(shareComments.parentId),
        ),
      )
      .limit(1);
    if (!parent) return { ok: false, error: "not_found" };
  }

  if (!owner) {
    const [recent] = await db
      .select({ count: count() })
      .from(shareComments)
      .where(
        and(
          eq(shareComments.shareId, share.id),
          eq(shareComments.byOwner, false),
          gt(shareComments.createdAt, sql`now() - interval '1 minute'`),
        ),
      );
    if (recent.count >= MAX_COMMENTS_PER_MINUTE) return { ok: false, error: "too_many" };
  }

  const [row] = await db
    .insert(shareComments)
    .values({
      id: newId(),
      shareId: share.id,
      parentId: input.parentId,
      authorName: owner ? owner.name : input.authorName,
      byOwner: owner !== null,
      authorKeyHash: owner ? null : await commenterKeyHash({ create: true }),
      body: input.body,
      quote: input.parentId ? null : input.quote,
    })
    .returning(commentColumns);
  return { ok: true, comment: toSharedComment(row, true) };
}

/** The owner can delete any comment; anyone else, their own. A thread's first comment takes its replies. */
export async function deleteComment(token: string, commentId: string): Promise<boolean> {
  const comment = await findEditableComment(token, commentId);
  if (!comment) return false;
  await db.delete(shareComments).where(eq(shareComments.id, comment.id));
  return true;
}

/** The owner can resolve any thread; anyone else, threads they started. */
export async function setCommentResolved(token: string, commentId: string, resolved: boolean): Promise<boolean> {
  const comment = await findEditableComment(token, commentId);
  if (!comment || comment.parentId) return false;
  await db
    .update(shareComments)
    .set({ resolvedAt: resolved ? new Date() : null })
    .where(eq(shareComments.id, comment.id));
  return true;
}

async function findEditableComment(token: string, commentId: string) {
  const result = await access(token);
  if (result.status !== "ok") return null;
  const { share, owner } = result;
  if (!owner && !share.allowComments) return null;

  const [comment] = await db
    .select({ id: shareComments.id, parentId: shareComments.parentId, authorKeyHash: shareComments.authorKeyHash })
    .from(shareComments)
    .where(and(eq(shareComments.id, commentId), eq(shareComments.shareId, share.id)))
    .limit(1);
  if (!comment) return null;
  return owner || isAuthor(comment, await commenterKeyHash()) ? comment : null;
}

/**
 * People with the link have no account, so a random key in a cookie stands in for one:
 * it's what lets them delete or resolve their own comments. The database keeps its hash.
 */
async function commenterKeyHash({ create = false } = {}): Promise<string | null> {
  const jar = await cookies();
  let key = jar.get(COMMENTER_COOKIE)?.value;
  if (!key && create) {
    key = nanoid(32);
    jar.set(COMMENTER_COOKIE, key, cookieOptions(COMMENTER_DAYS));
  }
  return key ? createHash("sha256").update(key).digest("base64url") : null;
}
