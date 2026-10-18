import { Output, smoothStream, streamText } from "ai";
import type { NextRequest } from "next/server";

import { scriptContext } from "@/lib/ai/context";
import { writePrompt } from "@/lib/ai/prompts";
import { languageModel } from "@/lib/ai/provider";
import { prepareAiRequest, textError, textStreamResponse } from "@/lib/ai/route";
import { elementsOutputSchema, writeRequestSchema } from "@/lib/ai/schema";

export const maxDuration = 120;

/** Streams screenplay lines as a JSON object, for `useObject`. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/ai/write">) {
  const { projectId } = await ctx.params;
  const prepared = await prepareAiRequest(request, projectId, writeRequestSchema);
  if (!prepared.ok) return prepared.response;
  const { project, body } = prepared;

  if (body.mode === "rewrite" && !body.script.selection) {
    return textError(400, "Select the lines to rewrite first.");
  }
  if (body.mode === "scene" && (!body.outline || body.sceneIndex === undefined || body.sceneIndex >= body.outline.length)) {
    return textError(400, "That scene isn't in the outline.");
  }

  const { instructions, prompt } = writePrompt(project, scriptContext(body.script), body);
  const result = streamText({
    model: languageModel(body.model),
    instructions,
    prompt,
    output: Output.object({ schema: elementsOutputSchema }),
    temperature: 0.8,
    maxOutputTokens: body.mode === "scene" ? 12_000 : 6_000,
    abortSignal: request.signal,
    experimental_transform: smoothStream({ delayInMs: 6 }),
  });
  return textStreamResponse(result.stream);
}
