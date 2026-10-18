import { z } from "zod";

import { ELEMENT_TYPES } from "../screenplay/elements";
import { SCENE_ID_PATTERN } from "../screenplay/types";
import { AI_MODEL_IDS } from "./models";

/** One screenplay line as the model writes it. */
export const screenplayElementSchema = z.object({
  type: z
    .enum(ELEMENT_TYPES)
    .describe(
      "sceneHeading (INT./EXT. LOCATION - TIME), action, character (the speaker's name), parenthetical, dialogue or transition (e.g. CUT TO:)",
    ),
  text: z
    .string()
    .describe("The text of the line, plain, without Fountain or markdown symbols. Parentheticals include their parentheses."),
});

export type ScreenplayElement = z.infer<typeof screenplayElementSchema>;

export const elementsOutputSchema = z.object({
  elements: z.array(screenplayElementSchema).describe("The screenplay lines, in order."),
});

// Output schemas leave out length limits: not every provider accepts them in structured output.
const outlineSceneOutputSchema = z.object({
  heading: z.string().describe("The scene heading, e.g. INT. DINER - NIGHT"),
  summary: z.string().describe("What happens in the scene, in two or three sentences."),
  estimatedPages: z.number().describe("Roughly how many script pages the scene runs."),
});

export const outlineOutputSchema = z.object({
  scenes: z.array(outlineSceneOutputSchema).describe("The scenes, in story order."),
});

export const outlineSceneSchema = z.object({
  heading: z.string().max(200),
  summary: z.string().max(2000),
  estimatedPages: z.number().min(0).max(30),
});

export type OutlineScene = z.infer<typeof outlineSceneSchema>;

export const aiModelIdSchema = z.enum(AI_MODEL_IDS);

/** Whether the AI reads the project's details. Without them it writes from the script alone. */
const projectDetailsSchema = z.boolean().default(true);

const pointSchema = z.object({
  block: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
});

export type ScriptPoint = z.infer<typeof pointSchema>;

/** The script as it is in the editor right now, including changes not saved yet. */
export const scriptSnapshotSchema = z.object({
  blocks: z
    .array(
      z.object({
        type: z.enum(ELEMENT_TYPES),
        text: z.string().max(10_000),
        sceneId: z.string().regex(SCENE_ID_PATTERN).nullable(),
      }),
    )
    .max(30_000),
  /** Where new text goes. */
  cursor: pointSchema.nullable(),
  /** The lines being rewritten, from the start of one block to the end of another. */
  selection: z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative() }).nullable(),
});

export type ScriptSnapshot = z.infer<typeof scriptSnapshotSchema>;

export const WRITE_MODES = ["insert", "rewrite", "scene"] as const;
export type WriteMode = (typeof WRITE_MODES)[number];

export const writeRequestSchema = z.object({
  model: aiModelIdSchema,
  projectDetails: projectDetailsSchema,
  mode: z.enum(WRITE_MODES),
  instruction: z.string().max(4000),
  script: scriptSnapshotSchema,
  /** Scene mode: the plan, and which of its scenes to write. */
  outline: z.array(outlineSceneSchema).max(200).optional(),
  sceneIndex: z.number().int().nonnegative().optional(),
});

export type WriteRequest = z.infer<typeof writeRequestSchema>;

export const outlineRequestSchema = z.object({
  model: aiModelIdSchema,
  projectDetails: projectDetailsSchema,
  direction: z.string().max(4000),
});

export type OutlineRequest = z.infer<typeof outlineRequestSchema>;

export const completeRequestSchema = z.object({
  projectDetails: projectDetailsSchema,
  script: scriptSnapshotSchema,
});

export type CompleteRequest = z.infer<typeof completeRequestSchema>;

export const completeResponseSchema = z.object({ text: z.string() });

export type CompleteResponse = z.infer<typeof completeResponseSchema>;

export const chatRequestSchema = z.object({
  model: aiModelIdSchema,
  projectDetails: projectDetailsSchema,
  script: scriptSnapshotSchema,
  messages: z.array(z.unknown()).max(400),
});

export const EDIT_PLACEMENTS = ["replaceScene", "afterScene", "atCursor"] as const;
export type EditPlacement = (typeof EDIT_PLACEMENTS)[number];

export const proposeEditInputSchema = z.object({
  summary: z.string().describe("One short sentence describing the change, shown on the card."),
  placement: z
    .enum(EDIT_PLACEMENTS)
    .describe("replaceScene rewrites a whole scene; afterScene adds lines after a scene; atCursor inserts where the writer's cursor is."),
  sceneNumber: z
    .number()
    .int()
    .nullable()
    .describe("The scene's number from the scene index. Required for replaceScene and afterScene; null for atCursor."),
  elements: z.array(screenplayElementSchema).describe("The screenplay lines to insert. For replaceScene, the whole new scene including its heading."),
});

export type ProposeEditInput = z.infer<typeof proposeEditInputSchema>;
