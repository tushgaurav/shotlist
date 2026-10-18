import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";

import { db } from "@/lib/db";
import { assets, projects, projectTypes } from "@/lib/db/schema";
import { newId } from "@/lib/id";
import type { ProjectDetails, ProjectInput, ProjectTypeChoice, ProjectTypeOption } from "@/lib/projects";

import { findOrCreateProjectType } from "./project-types";
import { requireUser } from "./session";

export type ProjectSummary = {
  id: string;
  title: string;
  type: ProjectTypeOption | null;
  coverImageId: string | null;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type ProjectRecord = ProjectSummary & ProjectDetails;

/**
 * `typeId` is the project's type when the input set one. `type_not_found`: the chosen type was
 * deleted meanwhile, e.g. in another tab.
 */
export type ProjectResult = { ok: true; typeId?: string | null } | { ok: false; error: "type_not_found" };

const summaryColumns = {
  id: projects.id,
  title: projects.title,
  type: { id: projectTypes.id, name: projectTypes.name, icon: projectTypes.icon },
  coverImageId: projects.coverImageId,
  updatedAt: projects.updatedAt,
  archivedAt: projects.archivedAt,
};

const recordColumns = {
  ...summaryColumns,
  logline: projects.logline,
  synopsis: projects.synopsis,
  genre: projects.genre,
  tone: projects.tone,
  targetRuntimeMinutes: projects.targetRuntimeMinutes,
  aspectRatio: projects.aspectRatio,
  language: projects.language,
};

export const listProjects = cache(async (): Promise<ProjectSummary[]> => {
  const user = await requireUser();
  return db
    .select(summaryColumns)
    .from(projects)
    .leftJoin(projectTypes, eq(projectTypes.id, projects.typeId))
    .where(eq(projects.ownerId, user.id))
    .orderBy(desc(projects.updatedAt));
});

export const getProject = cache(async (projectId: string): Promise<ProjectRecord> => {
  const user = await requireUser();
  const [project] = await db
    .select(recordColumns)
    .from(projects)
    .leftJoin(projectTypes, eq(projectTypes.id, projects.typeId))
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
    .limit(1);

  if (!project) notFound();
  return project;
});

/** The type's ID, null for none, or undefined if the user has no such type. */
async function resolveType(ownerId: string, choice: ProjectTypeChoice) {
  if ("newType" in choice) return findOrCreateProjectType(ownerId, choice.newType);
  if (choice.typeId === null) return null;

  const [owned] = await db
    .select({ id: projectTypes.id })
    .from(projectTypes)
    .where(and(eq(projectTypes.id, choice.typeId), eq(projectTypes.ownerId, ownerId)))
    .limit(1);
  return owned?.id;
}

export async function createProject(input: {
  title: string;
  type: ProjectTypeChoice;
}): Promise<{ ok: true; id: string } | { ok: false; error: "type_not_found" }> {
  const user = await requireUser();
  const typeId = await resolveType(user.id, input.type);
  if (typeId === undefined) return { ok: false, error: "type_not_found" };

  const [project] = await db
    .insert(projects)
    .values({ id: newId(), ownerId: user.id, title: input.title, typeId })
    .returning({ id: projects.id });
  return { ok: true, id: project.id };
}

export async function updateProject(projectId: string, input: ProjectInput): Promise<ProjectResult> {
  const user = await requireUser();
  const { type, ...values } = input;

  let typeId: string | null | undefined;
  if (type) {
    typeId = await resolveType(user.id, type);
    if (typeId === undefined) return { ok: false, error: "type_not_found" };
  }

  await updateOwnedProject(user.id, projectId, typeId === undefined ? values : { ...values, typeId });
  return { ok: true, typeId };
}

export async function renameProject(projectId: string, title: string) {
  const user = await requireUser();
  await updateOwnedProject(user.id, projectId, { title });
}

export async function setProjectArchived(projectId: string, archived: boolean) {
  const user = await requireUser();
  await updateOwnedProject(user.id, projectId, { archivedAt: archived ? new Date() : null });
}

/** Sets or clears the header image. It has to be one of the project's own images. */
export async function setProjectCover(projectId: string, assetId: string | null) {
  const user = await requireUser();
  if (assetId) {
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.projectId, projectId)))
      .limit(1);
    if (!asset) notFound();
  }
  await updateOwnedProject(user.id, projectId, { coverImageId: assetId });
}

async function updateOwnedProject(
  ownerId: string,
  projectId: string,
  values: Partial<Omit<typeof projects.$inferInsert, "id" | "ownerId" | "createdAt" | "updatedAt">>,
) {
  const updated = await db
    .update(projects)
    .set(values)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .returning({ id: projects.id });

  if (updated.length === 0) notFound();
}
