import "server-only";

import { and, count, eq, max, ne, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";

import { db } from "@/lib/db";
import { projects, projectTypes } from "@/lib/db/schema";
import { newId } from "@/lib/id";
import { lastUsedTypeId, type ProjectTypeIcon, type ProjectTypeOption } from "@/lib/projects";

import { requireUser } from "./session";

export type ProjectTypeItem = ProjectTypeOption & {
  projectCount: number;
  /** When the newest project of this type was created. */
  lastUsedAt: Date | null;
};

export type ProjectTypeResult = { ok: true } | { ok: false; error: "taken" };

const sameName = (name: string) => sql`lower(${projectTypes.name}) = lower(${name})`;

/** The signed-in user's types, alphabetically. */
export const listProjectTypes = cache(async (): Promise<ProjectTypeItem[]> => {
  const user = await requireUser();
  return db
    .select({
      id: projectTypes.id,
      name: projectTypes.name,
      icon: projectTypes.icon,
      projectCount: count(projects.id),
      lastUsedAt: max(projects.createdAt),
    })
    .from(projectTypes)
    .leftJoin(projects, eq(projects.typeId, projectTypes.id))
    .where(eq(projectTypes.ownerId, user.id))
    .groupBy(projectTypes.id)
    .orderBy(sql`lower(${projectTypes.name})`);
});

/** The types to offer for a new project, with the newest project's type picked. */
export async function getNewProjectOptions() {
  const types = await listProjectTypes();
  return { types: types.map(({ id, name, icon }) => ({ id, name, icon })), defaultTypeId: lastUsedTypeId(types) };
}

export async function createProjectType(input: { name: string; icon: ProjectTypeIcon }): Promise<ProjectTypeResult> {
  const user = await requireUser();
  const inserted = await db
    .insert(projectTypes)
    .values({ id: newId(), ownerId: user.id, ...input })
    .onConflictDoNothing()
    .returning({ id: projectTypes.id });
  return inserted.length > 0 ? { ok: true } : { ok: false, error: "taken" };
}

/**
 * The owner's type with this name (in any case), created if there isn't one yet. For picking a
 * type by typing its name.
 */
export async function findOrCreateProjectType(
  ownerId: string,
  input: { name: string; icon: ProjectTypeIcon },
): Promise<string> {
  const [inserted] = await db
    .insert(projectTypes)
    .values({ id: newId(), ownerId, ...input })
    .onConflictDoNothing()
    .returning({ id: projectTypes.id });
  if (inserted) return inserted.id;

  const [existing] = await db
    .select({ id: projectTypes.id })
    .from(projectTypes)
    .where(and(eq(projectTypes.ownerId, ownerId), sameName(input.name)))
    .limit(1);
  if (!existing) throw new Error("Project type vanished while it was being picked.");
  return existing.id;
}

export async function updateProjectType(
  typeId: string,
  input: { name: string; icon: ProjectTypeIcon },
): Promise<ProjectTypeResult> {
  const user = await requireUser();
  const owned = and(eq(projectTypes.id, typeId), eq(projectTypes.ownerId, user.id));

  const [clash] = await db
    .select({ id: projectTypes.id })
    .from(projectTypes)
    .where(and(eq(projectTypes.ownerId, user.id), ne(projectTypes.id, typeId), sameName(input.name)))
    .limit(1);
  if (clash) return { ok: false, error: "taken" };

  const updated = await db.update(projectTypes).set(input).where(owned).returning({ id: projectTypes.id });
  if (updated.length === 0) notFound();
  return { ok: true };
}

/** Projects of this type are left without one. */
export async function deleteProjectType(typeId: string) {
  const user = await requireUser();
  await db.delete(projectTypes).where(and(eq(projectTypes.id, typeId), eq(projectTypes.ownerId, user.id)));
}
