import type { OpenRouterProviderOptions } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import type { NextRequest } from "next/server";

import { joinCompletion } from "@/lib/ai/complete";
import { scriptContext } from "@/lib/ai/context";
import { GHOST_TEXT_MODEL } from "@/lib/ai/models";
import { completePrompt } from "@/lib/ai/prompts";
import { languageModel } from "@/lib/ai/provider";
import { describeAiError, prepareAiRequest, textError } from "@/lib/ai/route";
import { completeRequestSchema, type CompleteResponse } from "@/lib/ai/schema";

export const maxDuration = 30;

/** The rest of the line the writer is typing, for inline suggestions. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/ai/complete">) {
  const { projectId } = await ctx.params;
  const prepared = await prepareAiRequest(request, projectId, completeRequestSchema);
  if (!prepared.ok) return prepared.response;
  const { project, body } = prepared;

  const { cursor, blocks } = body.script;
  const block = cursor && blocks[cursor.block];
  if (!block) return textError(400, "There's no line to continue.");
  const line = block.text.slice(0, cursor.offset);

  try {
    const { text } = await generateText({
      model: languageModel(GHOST_TEXT_MODEL),
      ...completePrompt(project, scriptContext(body.script, { maxChars: 12_000 }), line),
      temperature: 0.4,
      maxOutputTokens: 48,
      maxRetries: 0,
      abortSignal: request.signal,
      // Thinking would spend the small token budget before any text arrives.
      providerOptions: { openrouter: { reasoning: { effort: "none" } } satisfies OpenRouterProviderOptions },
    });
    const reply: CompleteResponse = { text: joinCompletion(text, line) };
    return Response.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, message } = describeAiError(error);
    return textError(status, message);
  }
}
