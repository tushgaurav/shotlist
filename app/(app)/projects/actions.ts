"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { confirmImageUpload, startImageUpload } from "@/lib/dal/assets";
import {
  createProject,
  renameProject,
  setProjectArchived,
  setProjectCover,
  updateProject,
  type ProjectResult,
} from "@/lib/dal/projects";
import {
  PROJECT_DETAIL_MAX_LENGTH,
  PROJECT_RUNTIME_MAX_MINUTES,
  PROJECT_TITLE_MAX_LENGTH,
  PROJECT_TYPE_ICONS,
  PROJECT_TYPE_NAME_MAX_LENGTH,
  type ProjectInput,
  type ProjectTypeChoice,
} from "@/lib/projects";
import { IMAGE_TYPES, VARIANT_MAX_EDGE, type ImageType } from "@/lib/shots/images";
import { SHOT_ID_PATTERN } from "@/lib/shots/types";

export type ProjectFormState = { error?: string };

const projectId = z.string().min(1).max(64);
const typeId = z.string().min(1).max(64);

const title = z
  .string()
  .trim()
  .min(1, "Give the project a title.")
  .max(PROJECT_TITLE_MAX_LENGTH, `Keep the title under ${PROJECT_TITLE_MAX_LENGTH} characters.`);

const newType = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name the new type.")
    .max(PROJECT_TYPE_NAME_MAX_LENGTH, `Keep the type name under ${PROJECT_TYPE_NAME_MAX_LENGTH} characters.`),
  icon: z.enum(PROJECT_TYPE_ICONS),
});

const typeChoice: z.ZodType<ProjectTypeChoice> = z.union([
  z.object({ typeId: typeId.nullable() }).strict(),
  z.object({ newType }).strict(),
]);

const TYPE_NOT_FOUND = "That type was deleted. Pick another one.";

/** The type picker posts `typeId` as "none", "new" (with `newTypeName` and `newTypeIcon`) or an ID. */
function typeFromForm(formData: FormData) {
  const value = formData.get("typeId");
  if (value === "new") {
    return { newType: { name: formData.get("newTypeName") ?? "", icon: formData.get("newTypeIcon") } };
  }
  return { typeId: !value || value === "none" ? null : value };
}

const createInput = z.object({ title, type: typeChoice });

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const parsed = createInput.safeParse({
    title: formData.get("title") ?? "",
    type: typeFromForm(formData),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await createProject(parsed.data);
  if (!result.ok) return { error: TYPE_NOT_FOUND };
  redirect(`/projects/${result.id}/script`);
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

/** Empty text is stored as null. */
const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep the ${label} under ${max} characters.`)
    .transform((value) => value || null)
    .nullable();

const projectPatch: z.ZodType<ProjectInput> = z
  .object({
    title,
    type: typeChoice,
    logline: optionalText("logline", PROJECT_DETAIL_MAX_LENGTH.logline),
    synopsis: optionalText("synopsis", PROJECT_DETAIL_MAX_LENGTH.synopsis),
    genre: optionalText("genre", PROJECT_DETAIL_MAX_LENGTH.genre),
    tone: optionalText("tone", PROJECT_DETAIL_MAX_LENGTH.tone),
    targetRuntimeMinutes: z
      .number()
      .int()
      .min(1, "Enter a runtime of at least a minute.")
      .max(PROJECT_RUNTIME_MAX_MINUTES, `Enter a runtime under ${PROJECT_RUNTIME_MAX_MINUTES} minutes.`)
      .nullable(),
    aspectRatio: optionalText("aspect ratio", PROJECT_DETAIL_MAX_LENGTH.aspectRatio),
    language: optionalText("language", PROJECT_DETAIL_MAX_LENGTH.language),
  })
  .partial()
  .strict();

/** `typeId` is the project's type after the update, when the patch set one. */
export async function updateProjectAction(
  id: string,
  patch: ProjectInput,
): Promise<ProjectFormState & { typeId?: string | null }> {
  const parsed = z.object({ id: projectId, patch: projectPatch }).safeParse({ id, patch });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (Object.keys(parsed.data.patch).length === 0) return {};

  const result: ProjectResult = await updateProject(parsed.data.id, parsed.data.patch);
  if (!result.ok) return { error: TYPE_NOT_FOUND };
  refresh();
  return { typeId: result.typeId };
}

const invalid = { ok: false, error: "invalid" } as const;
const imageType = z.enum(IMAGE_TYPES);

export async function startCoverUploadAction(project: string, contentType: ImageType) {
  const parsed = z.object({ project: projectId, contentType: imageType }).safeParse({ project, contentType });
  if (!parsed.success) return invalid;
  return startImageUpload(parsed.data.project, parsed.data.contentType);
}

/** Records the uploaded image and makes it the project's header image. */
export async function confirmCoverUploadAction(
  project: string,
  input: { assetId: string; contentType: ImageType; width: number; height: number },
) {
  const edge = z.number().int().min(1).max(VARIANT_MAX_EDGE.full);
  const parsed = z
    .object({
      project: projectId,
      assetId: z.string().regex(SHOT_ID_PATTERN),
      contentType: imageType,
      width: edge,
      height: edge,
    })
    .safeParse({ project, ...input });
  if (!parsed.success) return invalid;

  const { project: parsedProject, ...image } = parsed.data;
  const result = await confirmImageUpload(parsedProject, image);
  if (result.ok) {
    await setProjectCover(parsedProject, image.assetId);
    refresh();
  }
  return result;
}

export async function removeCoverAction(project: string) {
  await setProjectCover(projectId.parse(project), null);
  refresh();
}
