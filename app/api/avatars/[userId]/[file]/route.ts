import type { NextRequest } from "next/server";

import { AVATAR_FILE_PATTERN } from "@/lib/account";
import { getAvatarDownload } from "@/lib/dal/account";
import { SHOT_ID_PATTERN } from "@/lib/shots/types";

/** Profile photos stay private in the bucket, like shot images. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/avatars/[userId]/[file]">) {
  const { userId, file } = await ctx.params;
  if (!SHOT_ID_PATTERN.test(userId) || !AVATAR_FILE_PATTERN.test(file)) return notFound();

  const download = await getAvatarDownload(userId, file);
  if (!download) return notFound();

  return new Response(null, {
    status: 302,
    headers: {
      Location: download.url,
      "Cache-Control": `private, max-age=${download.maxAge}`,
    },
  });
}

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
