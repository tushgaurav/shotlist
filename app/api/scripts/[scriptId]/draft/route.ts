import type { NextRequest } from "next/server";
import { z } from "zod";

import { saveDraft } from "@/lib/dal/scripts";
import { readBody } from "@/lib/read-body";
import { parseScreenplayDoc } from "@/lib/screenplay/editor/schema";
import type { ScreenplayDocJSON } from "@/lib/screenplay/types";

const MAX_BODY_BYTES = 5 * 1024 * 1024;

const bodySchema = z.object({
  revision: z.number().int().nonnegative(),
  draft: z.unknown(),
});

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/scripts/[scriptId]/draft">) {
  const { scriptId } = await ctx.params;

  const raw = await readBody(request, MAX_BODY_BYTES);
  if (raw === null) return errorResponse(413, "This script is too large to save.");

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(JSON.parse(raw));
  } catch {
    return errorResponse(400, "Invalid request.");
  }

  let draft: ScreenplayDocJSON;
  try {
    draft = parseScreenplayDoc(body.draft).toJSON() as ScreenplayDocJSON;
  } catch {
    return errorResponse(400, "The script couldn't be read.");
  }

  const result = await saveDraft(scriptId, draft, body.revision);
  switch (result.status) {
    case "saved":
      return Response.json({ revision: result.revision, savedAt: result.savedAt });
    case "conflict":
      return Response.json(
        { error: "This script was saved somewhere else.", revision: result.revision },
        { status: 409 },
      );
    case "unauthorized":
      return errorResponse(401, "You're signed out.");
    case "not_found":
      return errorResponse(404, "Script not found.");
  }
}

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}
