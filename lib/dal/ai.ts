import "server-only";

import { and, eq } from "drizzle-orm";

import type { AiProject } from "@/lib/ai/context";
import { db } from "@/lib/db";
import { projects, projectTypes, scripts } from "@/lib/db/schema";

import { getCurrentUser } from "./session";

export type AiProjectResult =
  | { status: "ok"; project: AiProject }
  | { status: "unauthorized" }
  | { status: "not_found" };

/** The project details the AI writes from, for Route Handlers. */
export async function getAiProject(projectId: string): Promise<AiProjectResult> {
  const user = await getCurrentUser();
  if (!user) return { status: "unauthorized" };

  const [row] = await db
    .select({
      title: projects.title,
      typeName: projectTypes.name,
      logline: projects.logline,
      synopsis: projects.synopsis,
      genre: projects.genre,
      tone: projects.tone,
      targetRuntimeMinutes: projects.targetRuntimeMinutes,
      aspectRatio: projects.aspectRatio,
      language: projects.language,
      titlePage: scripts.titlePage,
    })
    .from(projects)
    .leftJoin(projectTypes, eq(projectTypes.id, projects.typeId))
    .leftJoin(scripts, eq(scripts.projectId, projects.id))
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
    .limit(1);

  if (!row) return { status: "not_found" };
  return { status: "ok", project: { ...row, titlePage: row.titlePage ?? {} } };
}
