import "server-only";

import type { VideoLinkContent } from "./types";
import { basicVideoContent, oembedUrl, parseVideo } from "./video-links";

const TIMEOUT_MS = 5000;

const positive = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * A link's card details. YouTube and Vimeo are asked for the title, thumbnail and size through
 * their oEmbed endpoints, which are fixed hosts, so a link can't send this server anywhere
 * else. Other links, and sites that don't answer, get what can be read from the URL.
 */
export async function lookupVideoLink(url: URL): Promise<VideoLinkContent> {
  const content = basicVideoContent(url);
  const video = parseVideo(url);
  if (!video) return content;

  try {
    const response = await fetch(oembedUrl(video, url), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return content;
    const data = (await response.json()) as Record<string, unknown>;
    const width = positive(data.width);
    const height = positive(data.height);
    return {
      ...content,
      title: typeof data.title === "string" ? data.title.slice(0, 300) : null,
      thumbnailUrl: httpsUrl(data.thumbnail_url) ?? content.thumbnailUrl,
      ...(width && height ? { width, height } : {}),
    };
  } catch {
    return content;
  }
}
