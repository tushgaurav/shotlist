import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/dal/session";
import { lookupVideoLink } from "@/lib/moodboards/oembed";
import { parseLink } from "@/lib/moodboards/video-links";

/**
 * A link's card details for a mood board. A Route Handler rather than a Server Action: those
 * go one at a time, so a slow site would hold up saves.
 */
export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return Response.json({ error: "You're signed out." }, { status: 401 });
  const url = parseLink(request.nextUrl.searchParams.get("url") ?? "");
  if (!url) return Response.json({ error: "That isn't a link." }, { status: 400 });
  return Response.json(await lookupVideoLink(url), { headers: { "Cache-Control": "private, max-age=3600" } });
}
