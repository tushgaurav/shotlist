import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  safeValidateUIMessages,
  smoothStream,
  streamText,
  tool,
  toUIMessageStream,
} from "ai";
import type { NextRequest } from "next/server";

import type { AssistantMessage, ProposeEditOutput } from "@/lib/ai/chat";
import { scriptContext } from "@/lib/ai/context";
import { chatInstructions } from "@/lib/ai/prompts";
import { languageModel } from "@/lib/ai/provider";
import { describeAiError, prepareAiRequest, textError } from "@/lib/ai/route";
import { chatRequestSchema, proposeEditInputSchema } from "@/lib/ai/schema";

export const maxDuration = 120;

/** Older turns are dropped; the script itself is always sent fresh. */
const HISTORY_LIMIT = 40;

export async function POST(request: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/ai/chat">) {
  const { projectId } = await ctx.params;
  const prepared = await prepareAiRequest(request, projectId, chatRequestSchema);
  if (!prepared.ok) return prepared.response;
  const { project, body } = prepared;

  const script = scriptContext(body.script);
  const tools = {
    proposeEdit: tool({
      description:
        "Propose a change to the script. The writer sees it in the script as a suggestion and accepts or discards it.",
      inputSchema: proposeEditInputSchema,
      execute: async ({ placement, sceneNumber }): Promise<ProposeEditOutput> => {
        if (placement === "atCursor") return { ok: true, sceneId: null };
        const scene = script.scenes.find((candidate) => candidate.number === sceneNumber);
        if (!scene?.id) {
          return { ok: false, error: sceneNumber === null ? "No scene number was given." : `There's no scene ${sceneNumber} in the script.` };
        }
        return { ok: true, sceneId: scene.id };
      },
    }),
  };

  const validated = await safeValidateUIMessages<AssistantMessage>({
    messages: body.messages.slice(-HISTORY_LIMIT),
    tools: { proposeEdit: { inputSchema: proposeEditInputSchema } },
  });
  if (!validated.success) {
    return textError(400, "This conversation couldn't be read. Start a new chat and try again.");
  }

  const result = streamText({
    model: languageModel(body.model),
    instructions: chatInstructions(project, script),
    messages: await convertToModelMessages(validated.data, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: isStepCount(4),
    temperature: 0.7,
    maxOutputTokens: 10_000,
    abortSignal: request.signal,
    experimental_transform: smoothStream(),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => describeAiError(error).message,
    }),
  });
}
