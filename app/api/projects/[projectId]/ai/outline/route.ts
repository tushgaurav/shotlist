import { Output, streamText } from "ai";
import type { NextRequest } from "next/server";

import { withoutDetails } from "@/lib/ai/context";
import { outlinePrompt } from "@/lib/ai/prompts";
import { languageModel } from "@/lib/ai/provider";
import { prepareAiRequest, textStreamResponse } from "@/lib/ai/route";
import { outlineOutputSchema, outlineRequestSchema } from "@/lib/ai/schema";

export const maxDuration = 90;

/** Streams a scene-by-scene plan for a first draft, for `useObject`. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/ai/outline">) {
  const { projectId } = await ctx.params;
  const prepared = await prepareAiRequest(request, projectId, outlineRequestSchema);
  if (!prepared.ok) return prepared.response;
  const { body } = prepared;
  const project = body.projectDetails ? prepared.project : withoutDetails(prepared.project);

  const { instructions, prompt } = outlinePrompt(project, body.direction);
  const result = streamText({
    model: languageModel(body.model),
    instructions,
    prompt,
    output: Output.object({ schema: outlineOutputSchema }),
    temperature: 0.9,
    maxOutputTokens: 6_000,
    abortSignal: request.signal,
  });
  return textStreamResponse(result.stream);
}
