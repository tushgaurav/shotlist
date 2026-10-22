import type { VideoLinkContent, VideoProvider } from "./types";

export type ParsedVideo = {
  provider: VideoProvider;
  id: string;
  /** Vimeo's key for unlisted videos. */
  hash: string | null;
  /** Seconds into the video, from a `t` or `start` parameter. */
  start: number | null;
  /** YouTube Shorts are vertical. */
  vertical: boolean;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/;

/** An http(s) URL, or null. Bare domains ("youtu.be/…") are read as https. */
export function parseLink(text: string): URL | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.length > 2000) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // "foo" alone isn't a link.
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

/** "90", "1m30s", "1h2m3s" → seconds. */
function parseStart(value: string | null) {
  if (!value) return null;
  if (/^\d+s?$/.test(value)) return Number.parseInt(value, 10) || null;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || !match[0]) return null;
  const [, h = "0", m = "0", s = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) || null;
}

function host(url: URL) {
  return url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
}

/** A YouTube or Vimeo video, or null for any other link. */
export function parseVideo(url: URL): ParsedVideo | null {
  const segments = url.pathname.split("/").filter(Boolean);
  const start = parseStart(url.searchParams.get("t") ?? url.searchParams.get("start"));
  const hostname = host(url);

  if (hostname === "youtube.com" || hostname === "youtube-nocookie.com" || hostname === "youtu.be") {
    let id: string | undefined;
    let vertical = false;
    if (hostname === "youtu.be") id = segments[0];
    else if (segments[0] === "watch") id = url.searchParams.get("v") ?? undefined;
    else if (["embed", "shorts", "live", "v"].includes(segments[0])) {
      id = segments[1];
      vertical = segments[0] === "shorts";
    }
    return id && YOUTUBE_ID.test(id) ? { provider: "youtube", id, hash: null, start, vertical } : null;
  }

  if (hostname === "vimeo.com" || hostname === "player.vimeo.com") {
    // vimeo.com/123, vimeo.com/123/abc, vimeo.com/channels/x/123, player.vimeo.com/video/123?h=abc
    const index = segments.findIndex((segment) => VIMEO_ID.test(segment));
    if (index < 0) return null;
    const next = segments[index + 1];
    const hash = url.searchParams.get("h") ?? (next && VIMEO_HASH.test(next) ? next : null);
    return { provider: "vimeo", id: segments[index], hash, start, vertical: false };
  }

  return null;
}

/** The player to show in the viewer. */
export function embedUrl(video: ParsedVideo) {
  if (video.provider === "youtube") {
    const params = new URLSearchParams({ autoplay: "1", rel: "0" });
    if (video.start) params.set("start", String(video.start));
    return `https://www.youtube-nocookie.com/embed/${video.id}?${params}`;
  }
  const params = new URLSearchParams({ autoplay: "1" });
  if (video.hash) params.set("h", video.hash);
  const time = video.start ? `#t=${video.start}s` : "";
  return `https://player.vimeo.com/video/${video.id}?${params}${time}`;
}

/** The site's oEmbed endpoint for a video. A fixed host per site, never the link's own. */
export function oembedUrl(video: ParsedVideo, url: URL) {
  if (video.provider === "youtube") {
    const canonical = `https://www.youtube.com/watch?v=${video.id}`;
    return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonical)}`;
  }
  return `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url.toString())}`;
}

/** What's known about a link without asking the site. */
export function basicVideoContent(url: URL): VideoLinkContent {
  const video = parseVideo(url);
  const content: VideoLinkContent = {
    url: url.toString(),
    provider: video?.provider ?? null,
    title: null,
    thumbnailUrl: null,
    width: null,
    height: null,
  };
  if (video?.provider === "youtube") {
    content.thumbnailUrl = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
    [content.width, content.height] = video.vertical ? [9, 16] : [16, 9];
  }
  return content;
}

/** Width over height for the card's thumbnail. */
export function videoAspect(content: VideoLinkContent) {
  const { width, height } = content;
  return width && height ? Math.min(3, Math.max(1 / 3, width / height)) : 16 / 9;
}

/** "youtube.com", without "www.". */
export function siteName(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

export const PROVIDER_NAMES: Record<VideoProvider, string> = { youtube: "YouTube", vimeo: "Vimeo" };
