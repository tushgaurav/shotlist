import type { NextRequest } from "next/server";

import { loadShotList } from "@/lib/dal/shots";

/** The latest shot list, for open pages catching up in the background. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/shots">) {
  const { projectId } = await ctx.params;
  const result = await loadShotList(projectId);
  switch (result.status) {
    case "ok":
      return Response.json(result.data);
    case "unauthorized":
      return Response.json({ error: "You're signed out." }, { status: 401 });
    case "not_found":
      return Response.json({ error: "Project not found." }, { status: 404 });
  }
}
