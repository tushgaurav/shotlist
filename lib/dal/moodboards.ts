import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { assets, moodboardItems, moodboards, projects } from "@/lib/db/schema";
import { parseContent } from "@/lib/moodboards/schema";
import {
  compareOrdered,
  type BoardPatch,
  type ItemPatch,
  type MoodboardData,
  type MoodboardMutation,
  type NewItem,
  type ProjectImage,
} from "@/lib/moodboards/types";

import { getProject } from "./projects";
import { getCurrentUser } from "./session";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const unauthorized = { ok: false, error: "unauthorized" } as const;
const notFound = { ok: false, error: "not_found" } as const;
const invalid = { ok: false, error: "invalid" } as const;
const ok = { ok: true } as const;

/** The project's boards (archived ones too) and their items. */
export async function getMoodboards(projectId: string): Promise<MoodboardData> {
  await getProject(projectId);

  // Read before the boards, so they're at least as new as the version says.
  const [project] = await db
    .select({ updatedAt: projects.updatedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const [boards, items] = await Promise.all([
    db
      .select({
        id: moodboards.id,
        name: moodboards.name,
        columns: moodboards.columns,
        position: moodboards.position,
        archivedAt: moodboards.archivedAt,
      })
      .from(moodboards)
      .where(and(eq(moodboards.projectId, projectId), isNull(moodboards.deletedAt))),
    db
      .select({
        id: moodboardItems.id,
        boardId: moodboardItems.boardId,
        position: moodboardItems.position,
        kind: moodboardItems.kind,
        wide: moodboardItems.wide,
        assetId: moodboardItems.assetId,
        caption: moodboardItems.caption,
        content: moodboardItems.content,
        width: assets.width,
        height: assets.height,
      })
      .from(moodboardItems)
      .innerJoin(moodboards, eq(moodboards.id, moodboardItems.boardId))
      .leftJoin(assets, eq(assets.id, moodboardItems.assetId))
      .where(
        and(
          eq(moodboards.projectId, projectId),
          isNull(moodboards.deletedAt),
          isNull(moodboardItems.deletedAt),
        ),
      ),
  ]);

  return {
    boards: boards
      .map(({ archivedAt, ...board }) => ({ ...board, archived: archivedAt !== null }))
      .sort(compareOrdered),
    items: items.sort(compareOrdered),
    version: project.updatedAt.getTime(),
  };
}

/** Every image uploaded to the project, newest first, for reusing on a board. */
export const listProjectImages = cache(async (projectId: string): Promise<ProjectImage[]> => {
  await getProject(projectId);
  return db
    .select({ id: assets.id, width: assets.width, height: assets.height })
    .from(assets)
    .where(eq(assets.projectId, projectId))
    .orderBy(desc(assets.createdAt));
});

/**
 * Runs `work` in a transaction with the project row locked, so changes from two tabs apply
 * one after the other. Returns not_found unless the signed-in user owns the project.
 */
async function withProject(
  projectId: string,
  work: (tx: Transaction) => Promise<MoodboardMutation>,
): Promise<MoodboardMutation> {
  const user = await getCurrentUser();
  if (!user) return unauthorized;

  return db.transaction(async (tx) => {
    // Touching updated_at takes the row lock, keeps the projects list in recent order and
    // versions the boards. clock_timestamp() is read after the lock is taken.
    const [project] = await tx
      .update(projects)
      .set({ updatedAt: sql`clock_timestamp()` })
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
      .returning({ updatedAt: projects.updatedAt });
    if (!project) return notFound;

    const result = await work(tx);
    return result.ok ? { ...result, version: project.updatedAt.getTime() } : result;
  });
}

async function liveBoard(tx: Transaction, projectId: string, boardId: string) {
  const [board] = await tx
    .select({ id: moodboards.id, columns: moodboards.columns })
    .from(moodboards)
    .where(and(eq(moodboards.id, boardId), eq(moodboards.projectId, projectId), isNull(moodboards.deletedAt)))
    .limit(1);
  return board ?? null;
}

/** The project's live boards, as a subquery. */
function boardsOf(tx: Transaction, projectId: string) {
  return tx
    .select({ id: moodboards.id })
    .from(moodboards)
    .where(and(eq(moodboards.projectId, projectId), isNull(moodboards.deletedAt)));
}

async function touchBoards(tx: Transaction, boardIds: string[]) {
  if (boardIds.length === 0) return;
  await tx.update(moodboards).set({ updatedAt: new Date() }).where(inArray(moodboards.id, boardIds));
}

async function ownsAssets(tx: Transaction, projectId: string, assetIds: string[]) {
  if (assetIds.length === 0) return true;
  const found = await tx
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), inArray(assets.id, assetIds)));
  return found.length === new Set(assetIds).size;
}

/** Idempotent: the browser picks the ID, so a retried create succeeds again. */
export async function createBoard(
  projectId: string,
  input: { id: string; name: string; columns: number; position: string },
): Promise<MoodboardMutation> {
  return withProject(projectId, async (tx) => {
    const [existing] = await tx
      .select({ projectId: moodboards.projectId })
      .from(moodboards)
      .where(eq(moodboards.id, input.id))
      .limit(1);
    if (existing) return existing.projectId === projectId ? ok : invalid;

    await tx.insert(moodboards).values({ ...input, projectId });
    return ok;
  });
}

export async function updateBoard(projectId: string, id: string, patch: BoardPatch): Promise<MoodboardMutation> {
  return withProject(projectId, async (tx) => {
    const { archived, ...values } = patch;
    const [row] = await tx
      .update(moodboards)
      .set({ ...values, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
      .where(and(eq(moodboards.id, id), eq(moodboards.projectId, projectId), isNull(moodboards.deletedAt)))
      .returning({ id: moodboards.id });
    return row ? ok : notFound;
  });
}

export async function setBoardDeleted(projectId: string, id: string, deleted: boolean): Promise<MoodboardMutation> {
  return withProject(projectId, async (tx) => {
    const [row] = await tx
      .update(moodboards)
      .set({ deletedAt: deleted ? new Date() : null })
      .where(and(eq(moodboards.id, id), eq(moodboards.projectId, projectId)))
      .returning({ id: moodboards.id });
    return row ? ok : notFound;
  });
}

/**
 * Copies a board and the listed items under the IDs the browser picked. The copies point at
 * the same images, so nothing is copied in S3. A retry finds the copy already made.
 */
export async function duplicateBoard(
  projectId: string,
  input: { sourceId: string; id: string; name: string; position: string; items: { sourceId: string; id: string }[] },
): Promise<MoodboardMutation> {
  return withProject(projectId, async (tx) => {
    const [existing] = await tx
      .select({ projectId: moodboards.projectId })
      .from(moodboards)
      .where(eq(moodboards.id, input.id))
      .limit(1);
    if (existing) return existing.projectId === projectId ? ok : invalid;

    const source = await liveBoard(tx, projectId, input.sourceId);
    if (!source) return notFound;
    await tx.insert(moodboards).values({
      id: input.id,
      projectId,
      name: input.name,
      columns: source.columns,
      position: input.position,
    });

    const copyIds = new Map(input.items.map((item) => [item.sourceId, item.id]));
    if (copyIds.size === 0) return ok;
    const rows = await tx
      .select({
        id: moodboardItems.id,
        position: moodboardItems.position,
        kind: moodboardItems.kind,
        wide: moodboardItems.wide,
        assetId: moodboardItems.assetId,
        caption: moodboardItems.caption,
        content: moodboardItems.content,
      })
      .from(moodboardItems)
      .where(
        and(
          eq(moodboardItems.boardId, input.sourceId),
          inArray(moodboardItems.id, [...copyIds.keys()]),
          isNull(moodboardItems.deletedAt),
        ),
      );
    if (rows.length > 0) {
      await tx
        .insert(moodboardItems)
        .values(rows.map(({ id, ...row }) => ({ ...row, id: copyIds.get(id)!, boardId: input.id })));
    }
    return ok;
  });
}

/** Idempotent, like createBoard. Images must belong to the project. */
export async function createItem(projectId: string, item: NewItem): Promise<MoodboardMutation> {
  return withProject(projectId, async (tx) => {
    const [existing] = await tx
      .select({ boardId: moodboardItems.boardId })
      .from(moodboardItems)
      .where(eq(moodboardItems.id, item.id))
      .limit(1);
    if (existing) {
      const [board] = await tx
        .select({ projectId: moodboards.projectId })
        .from(moodboards)
        .where(eq(moodboards.id, existing.boardId))
        .limit(1);
      return board?.projectId === projectId ? ok : invalid;
    }

    if (!(await liveBoard(tx, projectId, item.boardId))) return notFound;
    const content = parseContent(item.kind, item.content);
    if (content === undefined || (item.kind === "image") !== (item.assetId !== null)) return invalid;
    if (item.assetId && !(await ownsAssets(tx, projectId, [item.assetId]))) return invalid;

    await tx.insert(moodboardItems).values({ ...item, content });
    await touchBoards(tx, [item.boardId]);
    return ok;
  });
}

/** Items deleted in the meantime are skipped. Content has to fit the item's kind. */
export async function updateItems(
  projectId: string,
  changes: { id: string; patch: ItemPatch }[],
): Promise<MoodboardMutation> {
  return withProject(projectId, async (tx) => {
    const rows = await tx
      .select({ id: moodboardItems.id, kind: moodboardItems.kind, boardId: moodboardItems.boardId })
      .from(moodboardItems)
      .where(
        and(
          inArray(
            moodboardItems.id,
            changes.map((change) => change.id),
          ),
          inArray(moodboardItems.boardId, boardsOf(tx, projectId)),
          isNull(moodboardItems.deletedAt),
        ),
      );
    const found = new Map(rows.map((row) => [row.id, row]));

    for (const { id, patch } of changes) {
      const row = found.get(id);
      if (!row) continue;
      const values = { ...patch };
      if (patch.content !== undefined) {
        const content = parseContent(row.kind, patch.content);
        if (content === undefined) return invalid;
        values.content = content;
      }
      await tx.update(moodboardItems).set(values).where(eq(moodboardItems.id, id));
    }
    await touchBoards(tx, [...new Set(rows.map((row) => row.boardId))]);
    return ok;
  });
}

export async function moveItem(
  projectId: string,
  input: { id: string; boardId: string; position: string },
): Promise<MoodboardMutation> {
  return withProject(projectId, async (tx) => {
    if (!(await liveBoard(tx, projectId, input.boardId))) return notFound;
    const [row] = await tx
      .update(moodboardItems)
      .set({ boardId: input.boardId, position: input.position })
      .where(
        and(
          eq(moodboardItems.id, input.id),
          inArray(moodboardItems.boardId, boardsOf(tx, projectId)),
          isNull(moodboardItems.deletedAt),
        ),
      )
      .returning({ id: moodboardItems.id });
    if (!row) return notFound;
    await touchBoards(tx, [input.boardId]);
    return ok;
  });
}

export async function setItemDeleted(projectId: string, id: string, deleted: boolean): Promise<MoodboardMutation> {
  return withProject(projectId, async (tx) => {
    const [row] = await tx
      .update(moodboardItems)
      .set({ deletedAt: deleted ? new Date() : null })
      .where(and(eq(moodboardItems.id, id), inArray(moodboardItems.boardId, boardsOf(tx, projectId))))
      .returning({ boardId: moodboardItems.boardId });
    if (!row) return notFound;
    await touchBoards(tx, [row.boardId]);
    return ok;
  });
}
