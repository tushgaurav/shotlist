import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";

import { db } from "@/lib/db";
import { projects, scenes, scripts } from "@/lib/db/schema";
import { newId } from "@/lib/id";
import { blocksFromJSON } from "@/lib/screenplay/blocks";
import { extractScenes, type ExtractedScene } from "@/lib/screenplay/scenes";
import { emptyScreenplay, type ScreenplayDocJSON, type TitlePage } from "@/lib/screenplay/types";

import { getProject } from "./projects";
import { getCurrentUser, requireUser } from "./session";

export type ScriptData = {
  id: string;
  projectId: string;
  draft: ScreenplayDocJSON;
  draftRevision: number;
  titlePage: TitlePage;
  updatedAt: Date;
};

const scriptColumns = {
  id: scripts.id,
  projectId: scripts.projectId,
  draft: scripts.draft,
  draftRevision: scripts.draftRevision,
  titlePage: scripts.titlePage,
  updatedAt: scripts.updatedAt,
};

async function findScript(projectId: string) {
  const [script] = await db
    .select(scriptColumns)
    .from(scripts)
    .where(eq(scripts.projectId, projectId))
    .limit(1);
  return script;
}

/** Each project has one script, created the first time it's opened. */
export const getOrCreateScript = cache(async (projectId: string): Promise<ScriptData> => {
  await getProject(projectId);

  const existing = await findScript(projectId);
  if (existing) return existing;

  await db
    .insert(scripts)
    .values({ id: newId(), projectId, draft: emptyScreenplay(newId()) })
    .onConflictDoNothing({ target: scripts.projectId });

  const created = await findScript(projectId);
  if (!created) throw new Error("Couldn't create the script.");
  return created;
});

export type SaveDraftResult =
  | { status: "saved"; revision: number; savedAt: Date }
  | { status: "conflict"; revision: number }
  | { status: "unauthorized" }
  | { status: "not_found" };

/**
 * Saves the working draft if `baseRevision` is still current, then syncs the scenes table
 * from it. A stale revision means another tab saved first; nothing is written.
 */
export async function saveDraft(
  scriptId: string,
  draft: ScreenplayDocJSON,
  baseRevision: number,
): Promise<SaveDraftResult> {
  const user = await getCurrentUser();
  if (!user) return { status: "unauthorized" };

  const extracted = extractScenes(blocksFromJSON(draft));

  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ projectId: scripts.projectId, revision: scripts.draftRevision })
      .from(scripts)
      .innerJoin(projects, eq(projects.id, scripts.projectId))
      .where(and(eq(scripts.id, scriptId), eq(projects.ownerId, user.id)))
      .limit(1);
    if (!owned) return { status: "not_found" } as const;

    // The revision check lives in the WHERE clause so two concurrent saves can't both win.
    const [saved] = await tx
      .update(scripts)
      .set({ draft, draftRevision: sql`${scripts.draftRevision} + 1` })
      .where(and(eq(scripts.id, scriptId), eq(scripts.draftRevision, baseRevision)))
      .returning({ revision: scripts.draftRevision, savedAt: scripts.updatedAt });
    if (!saved) return { status: "conflict", revision: owned.revision } as const;

    await syncScenes(tx, scriptId, extracted);
    await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, owned.projectId));

    return { status: "saved", ...saved } as const;
  });
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const excluded = (column: { name: string }) => sql.raw(`excluded.${column.name}`);

/** Upserts scenes that changed and marks scenes whose heading is gone as removed. */
async function syncScenes(tx: Transaction, scriptId: string, extracted: ExtractedScene[]) {
  const existing = await tx
    .select({
      id: scenes.id,
      position: scenes.position,
      number: scenes.number,
      heading: scenes.heading,
      contentHash: scenes.contentHash,
      removedAt: scenes.removedAt,
    })
    .from(scenes)
    .where(eq(scenes.scriptId, scriptId));
  const byId = new Map(existing.map((scene) => [scene.id, scene]));

  const changed = extracted.filter((scene) => {
    const current = byId.get(scene.id);
    return (
      !current ||
      current.removedAt !== null ||
      current.position !== scene.position ||
      current.number !== scene.number ||
      current.heading !== scene.heading ||
      current.contentHash !== scene.contentHash
    );
  });

  if (changed.length > 0) {
    await tx
      .insert(scenes)
      .values(changed.map((scene) => ({ scriptId, ...scene, removedAt: null })))
      .onConflictDoUpdate({
        target: [scenes.scriptId, scenes.id],
        set: {
          position: excluded(scenes.position),
          number: excluded(scenes.number),
          heading: excluded(scenes.heading),
          intExt: excluded(scenes.intExt),
          location: excluded(scenes.location),
          timeOfDay: excluded(scenes.timeOfDay),
          contentHash: excluded(scenes.contentHash),
          removedAt: sql`null`,
          updatedAt: sql`now()`,
        },
      });
  }

  const live = new Set(extracted.map((scene) => scene.id));
  const removed = existing
    .filter((scene) => scene.removedAt === null && !live.has(scene.id))
    .map((scene) => scene.id);

  if (removed.length > 0) {
    await tx
      .update(scenes)
      .set({ removedAt: new Date() })
      .where(and(eq(scenes.scriptId, scriptId), inArray(scenes.id, removed)));
  }
}

export async function updateTitlePage(scriptId: string, titlePage: TitlePage) {
  const user = await requireUser();
  const ownedProjects = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerId, user.id));

  const updated = await db
    .update(scripts)
    .set({ titlePage })
    .where(and(eq(scripts.id, scriptId), inArray(scripts.projectId, ownedProjects)))
    .returning({ id: scripts.id });

  if (updated.length === 0) notFound();
}
