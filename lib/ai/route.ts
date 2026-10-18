import "server-only";

import { APICallError, RetryError, type TextStreamPart, type ToolSet } from "ai";
import type { z } from "zod";

import { getAiProject } from "@/lib/dal/ai";
import { readBody } from "@/lib/read-body";

import type { AiProject } from "./context";
import { aiEnabled } from "./provider";

const BODY_LIMIT = 2 * 1024 * 1024;

/** Plain text, so the browser can show the message as it is. */
export function textError(status: number, message: string) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

type Prepared<T> = { ok: true; project: AiProject; body: T } | { ok: false; response: Response };

/** Checks that AI is set up and the project is the user's, then reads and validates the body. */
export async function prepareAiRequest<T extends z.ZodType>(
  request: Request,
  projectId: string,
  schema: T,
): Promise<Prepared<z.infer<T>>> {
  if (!aiEnabled()) {
    return { ok: false, response: textError(503, "AI writing isn't set up. Add OPENROUTER_API_KEY to the server's environment.") };
  }

  const result = await getAiProject(projectId);
  if (result.status === "unauthorized") {
    return { ok: false, response: textError(401, "Your session has ended. Sign in again to keep writing.") };
  }
  if (result.status === "not_found") {
    return { ok: false, response: textError(404, "This project doesn't exist or isn't yours.") };
  }

  const raw = await readBody(request, BODY_LIMIT);
  if (raw === null) return { ok: false, response: textError(413, "The script is too long to send to the AI.") };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    json = undefined;
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, response: textError(400, "That request didn't look right. Reload the page and try again.") };
  }
  return { ok: true, project: result.project, body: parsed.data };
}

/** A message the writer can act on, and the status to send it with. */
export function describeAiError(error: unknown): { status: number; message: string } {
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  if (APICallError.isInstance(cause)) {
    const body = cause.responseBody ?? "";
    switch (cause.statusCode) {
      case 401:
      case 403:
        return { status: 502, message: "OpenRouter didn't accept the API key. Check OPENROUTER_API_KEY." };
      case 402:
        return { status: 402, message: "The OpenRouter account is out of credits. Add credits and try again." };
      case 404:
        return { status: 502, message: "That model isn't available on OpenRouter right now. Pick another one in the model menu." };
      case 408:
      case 429:
        return { status: 429, message: "The model is busy right now. Try again in a moment, or pick another model." };
    }
    if (/context|too long|maximum.*tokens/i.test(body)) {
      return { status: 413, message: "The script is too long for this model. Try a model with a larger context." };
    }
    if (cause.statusCode && cause.statusCode >= 500) {
      return { status: 502, message: "The model's provider had a problem. Try again, or pick another model." };
    }
  }

  return { status: 500, message: "Something went wrong while writing. Try again." };
}

/**
 * Streams the text deltas, but waits for the first one so a failed request becomes an HTTP
 * error the browser can show. (`toTextStream` drops error parts, which would end the response
 * as an empty success.)
 */
export async function textStreamResponse<TOOLS extends ToolSet>(
  stream: ReadableStream<TextStreamPart<TOOLS>>,
): Promise<Response> {
  const reader = stream.getReader();
  let first = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.type === "error") {
      await reader.cancel().catch(() => {});
      const { status, message } = describeAiError(value.error);
      return textError(status, message);
    }
    if (value.type === "text-delta" && value.text) {
      first = value.text;
      break;
    }
  }

  const body = new ReadableStream<string>({
    start(controller) {
      if (first) controller.enqueue(first);
    },
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        if (value.type === "text-delta") {
          controller.enqueue(value.text);
          return;
        }
        if (value.type === "error") {
          // Too late for a status code; the browser sees the cut-off text and an error.
          controller.error(value.error);
          return;
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return new Response(body.pipeThrough(new TextEncoderStream()), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
