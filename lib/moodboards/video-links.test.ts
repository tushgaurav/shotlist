import { describe, expect, it } from "vitest";

import { basicVideoContent, embedUrl, oembedUrl, parseLink, parseVideo, videoAspect } from "./video-links";

const video = (text: string) => {
  const url = parseLink(text);
  return url ? parseVideo(url) : null;
};

describe("parseLink", () => {
  it("accepts http(s) URLs and bare domains", () => {
    expect(parseLink("https://example.com/a")?.toString()).toBe("https://example.com/a");
    expect(parseLink(" youtu.be/dQw4w9WgXcQ ")?.toString()).toBe("https://youtu.be/dQw4w9WgXcQ");
  });

  it("rejects text that isn't a link", () => {
    expect(parseLink("hello")).toBeNull();
    expect(parseLink("two words.com")).toBeNull();
    expect(parseLink("javascript:alert(1)")).toBeNull();
    expect(parseLink("ftp://example.com")).toBeNull();
    expect(parseLink("")).toBeNull();
  });
});

describe("parseVideo", () => {
  it("reads YouTube's URL forms", () => {
    for (const text of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
    ]) {
      expect(video(text)).toMatchObject({ provider: "youtube", id: "dQw4w9WgXcQ", vertical: false });
    }
    expect(video("https://youtube.com/shorts/dQw4w9WgXcQ")).toMatchObject({ vertical: true });
  });

  it("reads start times", () => {
    expect(video("https://youtu.be/dQw4w9WgXcQ?t=42")?.start).toBe(42);
    expect(video("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")?.start).toBe(90);
    expect(video("https://youtu.be/dQw4w9WgXcQ?t=abc")?.start).toBeNull();
  });

  it("reads Vimeo's URL forms, with the key of unlisted videos", () => {
    expect(video("https://vimeo.com/76979871")).toMatchObject({ provider: "vimeo", id: "76979871", hash: null });
    expect(video("https://vimeo.com/76979871/8272103f6e")).toMatchObject({ id: "76979871", hash: "8272103f6e" });
    expect(video("https://vimeo.com/channels/staffpicks/76979871")).toMatchObject({ id: "76979871" });
    expect(video("https://player.vimeo.com/video/76979871?h=8272103f6e")).toMatchObject({ hash: "8272103f6e" });
  });

  it("returns null for other links and malformed IDs", () => {
    expect(video("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(video("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(video("https://www.youtube.com/@channel")).toBeNull();
    expect(video("https://vimeo.com/about")).toBeNull();
  });
});

describe("embedUrl", () => {
  it("plays YouTube without cookies, from the start time", () => {
    expect(embedUrl(video("https://youtu.be/dQw4w9WgXcQ?t=42")!)).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=42",
    );
  });

  it("passes Vimeo's key", () => {
    expect(embedUrl(video("https://vimeo.com/76979871/8272103f6e")!)).toBe(
      "https://player.vimeo.com/video/76979871?autoplay=1&h=8272103f6e",
    );
  });
});

describe("oembedUrl", () => {
  it("asks the site's own endpoint", () => {
    const url = parseLink("https://youtu.be/dQw4w9WgXcQ")!;
    expect(oembedUrl(parseVideo(url)!, url)).toBe(
      "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ",
    );
    const vimeo = parseLink("https://vimeo.com/76979871")!;
    expect(oembedUrl(parseVideo(vimeo)!, vimeo)).toMatch(/^https:\/\/vimeo\.com\/api\/oembed\.json\?url=/);
  });
});

describe("basicVideoContent", () => {
  it("knows YouTube's thumbnail without asking", () => {
    expect(basicVideoContent(parseLink("https://youtu.be/dQw4w9WgXcQ")!)).toEqual({
      url: "https://youtu.be/dQw4w9WgXcQ",
      provider: "youtube",
      title: null,
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      width: 16,
      height: 9,
    });
  });

  it("keeps other links as they are", () => {
    expect(basicVideoContent(parseLink("https://example.com/reel")!)).toMatchObject({
      provider: null,
      thumbnailUrl: null,
    });
  });
});

describe("videoAspect", () => {
  it("falls back to 16:9 and keeps extreme sizes in bounds", () => {
    const base = { url: "", provider: null, title: null, thumbnailUrl: null };
    expect(videoAspect({ ...base, width: null, height: null })).toBeCloseTo(16 / 9);
    expect(videoAspect({ ...base, width: 1000, height: 10 })).toBe(3);
  });
});
