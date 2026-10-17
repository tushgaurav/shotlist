import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";

import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { newId } from "@/lib/id";
import type { ProjectKind } from "@/lib/projects";

import { requireUser } from "./session";

export type ProjectSummary = {
  id: string;
  title: string;
  kind: ProjectKind;
  updatedAt: Date;
  archivedAt: Date | null;
};

const summaryColumns = {
  id: projects.id,
  title: projects.title,
  kind: projects.kind,
  updatedAt: projects.updatedAt,
  archivedAt: projects.archivedAt,
};

export async function listProjects(): Promise<ProjectSummary[]> {
  const user = await requireUser();
  return db
    .select(summaryColumns)
    .from(projects)
    .where(eq(projects.ownerId, user.id))
    .orderBy(desc(projects.updatedAt));
}

export const getProject = cache(async (projectId: string): Promise<ProjectSummary> => {
  const user = await requireUser();
  const [project] = await db
    .select(summaryColumns)
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
    .limit(1);

  if (!project) notFound();
  return project;
});

export async function createProject(input: { title: string; kind: ProjectKind }) {
  const user = await requireUser();
  const [project] = await db
    .insert(projects)
    .values({ id: newId(), ownerId: user.id, title: input.title, kind: input.kind })
    .returning({ id: projects.id });

  return project;
}

export async function renameProject(projectId: string, title: string) {
  await updateOwnedProject(projectId, { title });
}

export async function setProjectArchived(projectId: string, archived: boolean) {
  await updateOwnedProject(projectId, { archivedAt: archived ? new Date() : null });
}

async function updateOwnedProject(
  projectId: string,
  values: Partial<Pick<typeof projects.$inferInsert, "title" | "archivedAt">>,
) {
  const user = await requireUser();
  const updated = await db
    .update(projects)
    .set(values)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
    .returning({ id: projects.id });

  if (updated.length === 0) notFound();
}
