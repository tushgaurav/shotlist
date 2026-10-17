import type { NextRequest } from "next/server";

import { getAssetDownload } from "@/lib/dal/assets";
import { IMAGE_VARIANTS, type ImageVariant } from "@/lib/shots/images";
import { SHOT_ID_PATTERN } from "@/lib/shots/types";

const isVariant = (value: string): value is ImageVariant =>
  (IMAGE_VARIANTS as readonly string[]).includes(value);

/** Images stay private in the bucket; this hands the owner a short-lived S3 URL. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/assets/[assetId]/[variant]">) {
  const { assetId, variant } = await ctx.params;
  if (!SHOT_ID_PATTERN.test(assetId) || !isVariant(variant)) return notFound();

  const download = await getAssetDownload(assetId, variant);
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
