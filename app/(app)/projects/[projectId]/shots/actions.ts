"use server";

import { z } from "zod";

import {
  createShot,
  deleteShot,
  markSceneReviewed,
  moveShot,
  renumberScene,
  restoreShot,
  updateShots,
} from "@/lib/dal/shots";
import { SCENE_ID_PATTERN } from "@/lib/screenplay/types";
import { isValidPosition } from "@/lib/shots/positions";
import {
  SHOT_ID_PATTERN,
  SHOT_STATUSES,
  type ShotMutation,
  type ShotPatch,
} from "@/lib/shots/types";

const id = z.string().regex(SHOT_ID_PATTERN);
const projectId = z.string().min(1).max(64);
const sceneId = z.string().regex(SCENE_ID_PATTERN);
const position = z.string().refine(isValidPosition);

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => (value.trim() ? value : null))
    .nullable();
const short = optionalText(200);

const patchSchema = z
  .object({
    customLabel: optionalText(40),
    description: z.string().max(5000),
    size: short,
    shotType: short,
    angle: short,
    movement: short,
    lens: short,
    camera: short,
    frameRate: short,
    subjects: optionalText(1000),
    equipment: optionalText(1000),
    sound: short,
    locationNote: optionalText(1000),
    notes: optionalText(5000),
    vfx: z.boolean(),
    estShootMinutes: z.number().int().min(0).max(100_000).nullable(),
    status: z.enum(SHOT_STATUSES),
  })
  .partial()
  .strict();

const invalid = { ok: false, error: "invalid" } as const;

export async function createShotAction(
  project: string,
  input: { id: string; sceneId: string | null; position: string },
) {
  const parsed = z
    .object({ project: projectId, id, sceneId: sceneId.nullable(), position })
    .safeParse({ project, ...input });
  if (!parsed.success) return invalid;
  const { project: parsedProject, ...shot } = parsed.data;
  return createShot(parsedProject, shot);
}

export async function updateShotsAction(
  project: string,
  changes: { id: string; patch: ShotPatch }[],
): Promise<ShotMutation> {
  const parsed = z
    .object({
      project: projectId,
      changes: z.array(z.object({ id, patch: patchSchema })).min(1).max(200),
    })
    .safeParse({ project, changes });
  if (!parsed.success) return invalid;

  const nonEmpty = parsed.data.changes.filter(({ patch }) => Object.keys(patch).length > 0);
  if (nonEmpty.length === 0) return { ok: true };
  return updateShots(parsed.data.project, nonEmpty);
}

export async function moveShotAction(
  project: string,
  input: { id: string; sceneId: string | null; position: string },
) {
  const parsed = z
    .object({ project: projectId, id, sceneId: sceneId.nullable(), position })
    .safeParse({ project, ...input });
  if (!parsed.success) return invalid;
  const { project: parsedProject, ...move } = parsed.data;
  return moveShot(parsedProject, move);
}

export async function deleteShotAction(project: string, shotId: string) {
  const parsed = z.object({ project: projectId, shotId: id }).safeParse({ project, shotId });
  if (!parsed.success) return invalid;
  return deleteShot(parsed.data.project, parsed.data.shotId);
}

export async function restoreShotAction(project: string, shotId: string) {
  const parsed = z.object({ project: projectId, shotId: id }).safeParse({ project, shotId });
  if (!parsed.success) return invalid;
  return restoreShot(parsed.data.project, parsed.data.shotId);
}

export async function renumberSceneAction(project: string, scene: string) {
  const parsed = z.object({ project: projectId, scene: sceneId }).safeParse({ project, scene });
  if (!parsed.success) return invalid;
  return renumberScene(parsed.data.project, parsed.data.scene);
}

export async function markSceneReviewedAction(project: string, scene: string) {
  const parsed = z.object({ project: projectId, scene: sceneId }).safeParse({ project, scene });
  if (!parsed.success) return invalid;
  return markSceneReviewed(parsed.data.project, parsed.data.scene);
}
