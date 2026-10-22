import type { NextRequest } from "next/server";

import { ATTACHMENT_FILE_PATTERN } from "@/lib/ai/attachments";
import { getAttachmentDownload } from "@/lib/dal/ai";
import { SHOT_ID_PATTERN } from "@/lib/shots/types";

/** Chat attachments stay private in the bucket, like shot images. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/ai/attachments/[file]">) {
  const { projectId, file } = await ctx.params;
  if (!SHOT_ID_PATTERN.test(projectId) || !ATTACHMENT_FILE_PATTERN.test(file)) return notFound();

  const download = await getAttachmentDownload(projectId, file);
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
