"use server";

import { z } from "zod";

import { confirmImageUpload, startImageUpload } from "@/lib/dal/assets";
import {
  createBoard,
  createItem,
  duplicateBoard,
  moveItem,
  setBoardDeleted,
  setItemDeleted,
  updateBoard,
  updateItems,
} from "@/lib/dal/moodboards";
import { setProjectCover } from "@/lib/dal/projects";
import { getOrCreateScript } from "@/lib/dal/scripts";
import { createStandaloneShot } from "@/lib/dal/shots";
import {
  BOARD_NAME_MAX_LENGTH,
  CAPTION_MAX_LENGTH,
  ITEM_KINDS,
  MAX_BOARD_COLUMNS,
  MOODBOARD_ID_PATTERN,
  type BoardPatch,
  type ItemPatch,
  type MoodboardMutation,
  type NewItem,
} from "@/lib/moodboards/types";
import { IMAGE_TYPES, VARIANT_MAX_EDGE, type ImageType } from "@/lib/shots/images";
import { isValidPosition } from "@/lib/shots/positions";
import { SHOT_ID_PATTERN } from "@/lib/shots/types";

const id = z.string().regex(MOODBOARD_ID_PATTERN);
const assetId = z.string().regex(SHOT_ID_PATTERN);
const projectId = z.string().min(1).max(64);
const position = z.string().refine(isValidPosition);
const name = z.string().trim().min(1).max(BOARD_NAME_MAX_LENGTH);
const columns = z.number().int().min(1).max(MAX_BOARD_COLUMNS);
const caption = z
  .string()
  .max(CAPTION_MAX_LENGTH)
  .transform((value) => (value.trim() ? value : null))
  .nullable();
// Checked against the item's kind in the data access layer.
const content = z.unknown();

const invalid = { ok: false, error: "invalid" } as const;

export async function createBoardAction(
  project: string,
  input: { id: string; name: string; columns: number; position: string },
): Promise<MoodboardMutation> {
  const parsed = z.object({ project: projectId, id, name, columns, position }).safeParse({ project, ...input });
  if (!parsed.success) return invalid;
  const { project: parsedProject, ...board } = parsed.data;
  return createBoard(parsedProject, board);
}

export async function updateBoardAction(project: string, board: string, patch: BoardPatch): Promise<MoodboardMutation> {
  const parsed = z
    .object({
      project: projectId,
      board: id,
      patch: z.object({ name, columns, archived: z.boolean(), position }).partial().strict(),
    })
    .safeParse({ project, board, patch });
  if (!parsed.success) return invalid;
  if (Object.keys(parsed.data.patch).length === 0) return { ok: true };
  return updateBoard(parsed.data.project, parsed.data.board, parsed.data.patch);
}

export async function deleteBoardAction(project: string, board: string) {
  const parsed = z.object({ project: projectId, board: id }).safeParse({ project, board });
  if (!parsed.success) return invalid;
  return setBoardDeleted(parsed.data.project, parsed.data.board, true);
}

export async function restoreBoardAction(project: string, board: string) {
  const parsed = z.object({ project: projectId, board: id }).safeParse({ project, board });
  if (!parsed.success) return invalid;
  return setBoardDeleted(parsed.data.project, parsed.data.board, false);
}

export async function duplicateBoardAction(
  project: string,
  input: { sourceId: string; id: string; name: string; position: string; items: { sourceId: string; id: string }[] },
): Promise<MoodboardMutation> {
  const parsed = z
    .object({
      project: projectId,
      sourceId: id,
      id,
      name,
      position,
      items: z.array(z.object({ sourceId: id, id }).strict()).max(5000),
    })
    .safeParse({ project, ...input });
  if (!parsed.success) return invalid;
  const { project: parsedProject, ...copy } = parsed.data;
  return duplicateBoard(parsedProject, copy);
}

export async function createItemAction(project: string, item: NewItem): Promise<MoodboardMutation> {
  const parsed = z
    .object({
      project: projectId,
      id,
      boardId: id,
      position,
      kind: z.enum(ITEM_KINDS),
      wide: z.boolean(),
      assetId: assetId.nullable(),
      caption,
      content,
    })
    .safeParse({ project, ...item });
  if (!parsed.success) return invalid;
  const { project: parsedProject, ...values } = parsed.data;
  return createItem(parsedProject, { ...values, content: values.content as NewItem["content"] });
}

export async function updateItemsAction(
  project: string,
  changes: { id: string; patch: ItemPatch }[],
): Promise<MoodboardMutation> {
  const parsed = z
    .object({
      project: projectId,
      changes: z
        .array(z.object({ id, patch: z.object({ wide: z.boolean(), caption, content }).partial().strict() }))
        .min(1)
        .max(200),
    })
    .safeParse({ project, changes });
  if (!parsed.success) return invalid;

  const nonEmpty = parsed.data.changes.filter(({ patch }) => Object.keys(patch).length > 0);
  if (nonEmpty.length === 0) return { ok: true };
  return updateItems(parsed.data.project, nonEmpty as { id: string; patch: ItemPatch }[]);
}

export async function moveItemAction(project: string, input: { id: string; boardId: string; position: string }) {
  const parsed = z.object({ project: projectId, id, boardId: id, position }).safeParse({ project, ...input });
  if (!parsed.success) return invalid;
  const { project: parsedProject, ...move } = parsed.data;
  return moveItem(parsedProject, move);
}

export async function deleteItemAction(project: string, item: string) {
  const parsed = z.object({ project: projectId, item: id }).safeParse({ project, item });
  if (!parsed.success) return invalid;
  return setItemDeleted(parsed.data.project, parsed.data.item, true);
}

export async function restoreItemAction(project: string, item: string) {
  const parsed = z.object({ project: projectId, item: id }).safeParse({ project, item });
  if (!parsed.success) return invalid;
  return setItemDeleted(parsed.data.project, parsed.data.item, false);
}

const imageType = z.enum(IMAGE_TYPES);

export async function startBoardImageUploadAction(project: string, contentType: ImageType) {
  const parsed = z.object({ project: projectId, contentType: imageType }).safeParse({ project, contentType });
  if (!parsed.success) return invalid;
  return startImageUpload(parsed.data.project, parsed.data.contentType);
}

export async function confirmBoardImageUploadAction(
  project: string,
  input: { assetId: string; contentType: ImageType; width: number; height: number },
) {
  const edge = z.number().int().min(1).max(VARIANT_MAX_EDGE.full);
  const parsed = z
    .object({ project: projectId, assetId, contentType: imageType, width: edge, height: edge })
    .safeParse({ project, ...input });
  if (!parsed.success) return invalid;
  const { project: parsedProject, ...image } = parsed.data;
  return confirmImageUpload(parsedProject, image);
}

export async function setCoverFromBoardAction(project: string, image: string) {
  const parsed = z.object({ project: projectId, image: assetId }).safeParse({ project, image });
  if (!parsed.success) return invalid;
  await setProjectCover(parsed.data.project, parsed.data.image);
  return { ok: true } as const;
}

/** A standalone shot with the image, and the caption as its description. */
export async function createShotFromImageAction(project: string, image: string, description: string | null) {
  const parsed = z
    .object({ project: projectId, image: assetId, description: z.string().max(5000).nullable() })
    .safeParse({ project, image, description });
  if (!parsed.success) return invalid;
  // A project that's only had mood boards may not have its script (which shots hang off) yet.
  await getOrCreateScript(parsed.data.project);
  return createStandaloneShot(parsed.data.project, {
    imageId: parsed.data.image,
    description: parsed.data.description ?? "",
  });
}
