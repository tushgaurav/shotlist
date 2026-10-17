import "server-only";

import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects, scenes, scripts, shots } from "@/lib/db/schema";
import { blocksFromJSON } from "@/lib/screenplay/blocks";
import { sceneCharacters } from "@/lib/screenplay/scenes";
import { nextSuffix, suffixAt } from "@/lib/shots/numbering";
import {
  compareShots,
  type ShotListData,
  type ShotMutation,
  type ShotPatch,
} from "@/lib/shots/types";

import { getOrCreateScript } from "./scripts";
import { getCurrentUser } from "./session";

const shotColumns = {
  id: shots.id,
  sceneId: shots.sceneId,
  position: shots.position,
  suffix: shots.suffix,
  customLabel: shots.customLabel,
  description: shots.description,
  size: shots.size,
  shotType: shots.shotType,
  angle: shots.angle,
  movement: shots.movement,
  lens: shots.lens,
  camera: shots.camera,
  frameRate: shots.frameRate,
  subjects: shots.subjects,
  equipment: shots.equipment,
  sound: shots.sound,
  locationNote: shots.locationNote,
  vfx: shots.vfx,
  estShootMinutes: shots.estShootMinutes,
  status: shots.status,
  notes: shots.notes,
};

export async function getShotList(projectId: string): Promise<ShotListData> {
  const script = await getOrCreateScript(projectId);

  const [sceneRows, shotRows] = await Promise.all([
    db
      .select({
        id: scenes.id,
        position: scenes.position,
        number: scenes.number,
        heading: scenes.heading,
        contentHash: scenes.contentHash,
        reviewedHash: scenes.shotsReviewedHash,
        removedAt: scenes.removedAt,
      })
      .from(scenes)
      .where(eq(scenes.scriptId, script.id)),
    db
      .select(shotColumns)
      .from(shots)
      .where(and(eq(shots.projectId, projectId), isNull(shots.deletedAt))),
  ]);

  const characters = sceneCharacters(blocksFromJSON(script.draft));
  const withShots = new Set(shotRows.map((shot) => shot.sceneId));

  return {
    scenes: sceneRows
      // Removed scenes only matter while shots still point at them.
      .filter((scene) => scene.removedAt === null || withShots.has(scene.id))
      .sort((a, b) => a.position - b.position)
      .map(({ removedAt, ...scene }) => ({
        ...scene,
        removed: removedAt !== null,
        characters: characters.get(scene.id) ?? [],
      })),
    shots: shotRows.sort(compareShots),
  };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const unauthorized = { ok: false, error: "unauthorized" } as const;
const notFound = { ok: false, error: "not_found" } as const;
const invalid = { ok: false, error: "invalid" } as const;

/**
 * Runs `work` in a transaction with the project row locked, so label assignment can't race
 * within a project. Returns not_found unless the signed-in user owns the project.
 */
async function withProject<T extends object>(
  projectId: string,
  work: (tx: Transaction, scriptId: string) => Promise<ShotMutation<T>>,
): Promise<ShotMutation<T>> {
  const user = await getCurrentUser();
  if (!user) return unauthorized;

  return db.transaction(async (tx) => {
    // Touching updated_at takes the row lock and keeps the projects list in recent order.
    const [project] = await tx
      .update(projects)
      .set({ updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
      .returning({ id: projects.id });
    if (!project) return notFound;

    const [script] = await tx
      .select({ id: scripts.id })
      .from(scripts)
      .where(eq(scripts.projectId, projectId))
      .limit(1);
    if (!script) return notFound;

    return work(tx, script.id);
  });
}

async function isLiveScene(tx: Transaction, scriptId: string, sceneId: string) {
  const [scene] = await tx
    .select({ id: scenes.id })
    .from(scenes)
    .where(and(eq(scenes.scriptId, scriptId), eq(scenes.id, sceneId), isNull(scenes.removedAt)))
    .limit(1);
  return Boolean(scene);
}

async function nextSuffixInScene(
  tx: Transaction,
  projectId: string,
  sceneId: string,
  excludeShotId?: string,
) {
  const rows = await tx
    .select({ suffix: shots.suffix })
    .from(shots)
    .where(
      and(
        eq(shots.projectId, projectId),
        eq(shots.sceneId, sceneId),
        isNull(shots.deletedAt),
        excludeShotId ? ne(shots.id, excludeShotId) : undefined,
      ),
    );
  return nextSuffix(rows.map((row) => row.suffix));
}

/** Editing a scene's shots counts as reviewing them against the scene's current text. */
async function markReviewed(tx: Transaction, scriptId: string, sceneIds: string[]) {
  if (sceneIds.length === 0) return;
  await tx
    .update(scenes)
    .set({ shotsReviewedHash: sql`${scenes.contentHash}` })
    .where(and(eq(scenes.scriptId, scriptId), inArray(scenes.id, sceneIds)));
}

/** Idempotent: the browser picks the ID, so a retried create returns the first result. */
export async function createShot(
  projectId: string,
  input: { id: string; sceneId: string | null; position: string },
): Promise<ShotMutation<{ suffix: string | null }>> {
  return withProject<{ suffix: string | null }>(projectId, async (tx, scriptId) => {
    const [existing] = await tx
      .select({ projectId: shots.projectId, suffix: shots.suffix })
      .from(shots)
      .where(eq(shots.id, input.id))
      .limit(1);
    if (existing) return existing.projectId === projectId ? { ok: true, suffix: existing.suffix } : invalid;

    let suffix: string | null = null;
    if (input.sceneId) {
      if (!(await isLiveScene(tx, scriptId, input.sceneId))) return notFound;
      suffix = await nextSuffixInScene(tx, projectId, input.sceneId);
      await markReviewed(tx, scriptId, [input.sceneId]);
    }

    await tx.insert(shots).values({
      id: input.id,
      projectId,
      scriptId,
      sceneId: input.sceneId,
      position: input.position,
      suffix,
    });
    return { ok: true, suffix };
  });
}

/** Shots that were deleted in the meantime are skipped. */
export async function updateShots(
  projectId: string,
  changes: { id: string; patch: ShotPatch }[],
): Promise<ShotMutation> {
  return withProject(projectId, async (tx, scriptId) => {
    const touched = new Set<string>();
    for (const { id, patch } of changes) {
      const [row] = await tx
        .update(shots)
        .set(patch)
        .where(and(eq(shots.id, id), eq(shots.projectId, projectId), isNull(shots.deletedAt)))
        .returning({ sceneId: shots.sceneId });
      if (row?.sceneId) touched.add(row.sceneId);
    }
    await markReviewed(tx, scriptId, [...touched]);
    return { ok: true };
  });
}

/** A shot that changes scene gets the next letter there; within a scene it keeps its label. */
export async function moveShot(
  projectId: string,
  input: { id: string; sceneId: string | null; position: string },
): Promise<ShotMutation<{ suffix: string | null }>> {
  return withProject<{ suffix: string | null }>(projectId, async (tx, scriptId) => {
    const [shot] = await tx
      .select({ sceneId: shots.sceneId, suffix: shots.suffix })
      .from(shots)
      .where(and(eq(shots.id, input.id), eq(shots.projectId, projectId), isNull(shots.deletedAt)))
      .limit(1);
    if (!shot) return notFound;

    let suffix = shot.suffix;
    if (shot.sceneId !== input.sceneId) {
      if (input.sceneId && !(await isLiveScene(tx, scriptId, input.sceneId))) return notFound;
      suffix = input.sceneId ? await nextSuffixInScene(tx, projectId, input.sceneId, input.id) : null;
    }

    await tx
      .update(shots)
      .set({ sceneId: input.sceneId, position: input.position, suffix })
      .where(eq(shots.id, input.id));
    if (input.sceneId) await markReviewed(tx, scriptId, [input.sceneId]);
    return { ok: true, suffix };
  });
}

export async function deleteShot(projectId: string, id: string): Promise<ShotMutation> {
  return withProject(projectId, async (tx) => {
    await tx
      .update(shots)
      .set({ deletedAt: new Date() })
      .where(and(eq(shots.id, id), eq(shots.projectId, projectId), isNull(shots.deletedAt)));
    return { ok: true };
  });
}

/** Undo for delete. If a new shot took the letter in the meantime, this one gets the next. */
export async function restoreShot(
  projectId: string,
  id: string,
): Promise<ShotMutation<{ suffix: string | null }>> {
  return withProject<{ suffix: string | null }>(projectId, async (tx) => {
    const [shot] = await tx
      .select({ sceneId: shots.sceneId, suffix: shots.suffix })
      .from(shots)
      .where(and(eq(shots.id, id), eq(shots.projectId, projectId), isNotNull(shots.deletedAt)))
      .limit(1);
    if (!shot) return notFound;

    let suffix = shot.suffix;
    if (shot.sceneId && suffix) {
      const [taken] = await tx
        .select({ id: shots.id })
        .from(shots)
        .where(
          and(
            eq(shots.projectId, projectId),
            eq(shots.sceneId, shot.sceneId),
            eq(shots.suffix, suffix),
            isNull(shots.deletedAt),
          ),
        )
        .limit(1);
      if (taken) suffix = await nextSuffixInScene(tx, projectId, shot.sceneId);
    }

    await tx.update(shots).set({ deletedAt: null, suffix }).where(eq(shots.id, id));
    return { ok: true, suffix };
  });
}

/** Relabels a scene's shots A, B, C… in their current order. */
export async function renumberScene(
  projectId: string,
  sceneId: string,
): Promise<ShotMutation<{ suffixes: Record<string, string> }>> {
  return withProject<{ suffixes: Record<string, string> }>(projectId, async (tx) => {
    const rows = await tx
      .select({ id: shots.id, position: shots.position, suffix: shots.suffix })
      .from(shots)
      .where(
        and(eq(shots.projectId, projectId), eq(shots.sceneId, sceneId), isNull(shots.deletedAt)),
      );

    const suffixes: Record<string, string> = {};
    for (const [index, row] of rows.sort(compareShots).entries()) {
      const suffix = suffixAt(index);
      suffixes[row.id] = suffix;
      if (row.suffix !== suffix) await tx.update(shots).set({ suffix }).where(eq(shots.id, row.id));
    }
    return { ok: true, suffixes };
  });
}

export async function markSceneReviewed(projectId: string, sceneId: string): Promise<ShotMutation> {
  return withProject(projectId, async (tx, scriptId) => {
    await markReviewed(tx, scriptId, [sceneId]);
    return { ok: true };
  });
}
