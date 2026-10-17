"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createProject, renameProject, setProjectArchived } from "@/lib/dal/projects";
import { PROJECT_KINDS, PROJECT_TITLE_MAX_LENGTH } from "@/lib/projects";

export type ProjectFormState = { error?: string };

const projectId = z.string().min(1).max(64);

const title = z
  .string()
  .trim()
  .min(1, "Give the project a title.")
  .max(PROJECT_TITLE_MAX_LENGTH, `Keep the title under ${PROJECT_TITLE_MAX_LENGTH} characters.`);

const createInput = z.object({
  title,
  kind: z.enum(PROJECT_KINDS, { error: "Pick a project type." }),
});

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const parsed = createInput.safeParse({
    title: formData.get("title") ?? "",
    kind: formData.get("kind"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const project = await createProject(parsed.data);
  redirect(`/projects/${project.id}/script`);
}

export async function renameProjectAction(
  id: string,
  formData: FormData,
): Promise<ProjectFormState> {
  const parsedTitle = title.safeParse(formData.get("title") ?? "");
  if (!parsedTitle.success) return { error: parsedTitle.error.issues[0].message };

  await renameProject(projectId.parse(id), parsedTitle.data);
  refresh();
  return {};
}

export async function setProjectArchivedAction(id: string, archived: boolean) {
  await setProjectArchived(projectId.parse(id), z.boolean().parse(archived));
  refresh();
}
