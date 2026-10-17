import { describe, expect, it, vi } from "vitest";

import { ImageUploader, type ImageUploadApi } from "./image-uploader";
import { fitWithin, type PreparedImage } from "./images";
import { ShotStore, type ShotApi } from "./shot-store";
import { EMPTY_SHOT } from "./types";

const ok = { ok: true } as const;

function setup() {
  const shotApi: ShotApi = {
    create: async () => ({ ...ok, suffix: "A" }),
    update: vi.fn<ShotApi["update"]>(async () => ok),
    move: async () => ({ ...ok, suffix: "A" }),
    remove: async () => ok,
    restore: async () => ({ ...ok, suffix: "A" }),
    renumber: async () => ({ ...ok, suffixes: {} }),
    markReviewed: async () => ok,
  };
  const store = new ShotStore(
    shotApi,
    { scenes: [], shots: [{ ...EMPTY_SHOT, id: "a", sceneId: null, position: "a0", suffix: null }], version: 1 },
    { createId: () => "new", flushMs: 10 },
  );

  const form = (variant: string) => ({ url: "https://bucket.test", fields: { key: variant } });
  const api = {
    start: vi.fn<ImageUploadApi["start"]>(async () => ({
      ok: true,
      assetId: "asset1",
      forms: { full: form("full"), thumb: form("thumb") },
    })),
    send: vi.fn<ImageUploadApi["send"]>(async () => true),
    confirm: vi.fn<ImageUploadApi["confirm"]>(async () => ok),
  } satisfies ImageUploadApi;

  const prepared: PreparedImage = {
    contentType: "image/webp",
    width: 2048,
    height: 1152,
    full: new Blob(["full"]),
    thumb: new Blob(["thumb"]),
  };
  const onError = vi.fn();
  const revokePreview = vi.fn();
  const uploader = new ImageUploader(api, store, {
    prepare: vi.fn(async () => prepared),
    onError,
    createPreview: () => "blob:preview",
    revokePreview,
  });
  return { store, api, uploader, onError, revokePreview, prepared };
}

const png = new File(["x"], "frame.png", { type: "image/png" });

describe("ImageUploader", () => {
  it("uploads both copies, confirms, then sets the shot's image", async () => {
    const { store, api, uploader, prepared } = setup();
    const seen: (string | undefined)[] = [];
    uploader.subscribe(() => seen.push(uploader.getSnapshot().get("a")));
    await uploader.upload("a", png);

    expect(seen).toEqual(["blob:preview", undefined]);
    expect(api.start).toHaveBeenCalledWith("image/webp");
    expect(api.send).toHaveBeenCalledWith({ url: "https://bucket.test", fields: { key: "full" } }, prepared.full);
    expect(api.send).toHaveBeenCalledWith({ url: "https://bucket.test", fields: { key: "thumb" } }, prepared.thumb);
    expect(api.confirm).toHaveBeenCalledWith({ assetId: "asset1", contentType: "image/webp", width: 2048, height: 1152 });
    expect(store.getSnapshot().shots[0].imageId).toBe("asset1");
    expect(uploader.getSnapshot().size).toBe(0);
    expect(uploader.previewFor("asset1")).toBe("blob:preview");
  });

  it("rejects files that aren't images without contacting the server", async () => {
    const { api, uploader, onError } = setup();
    await uploader.upload("a", new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));
    await uploader.upload("a", new File(["%PDF"], "x.pdf", { type: "application/pdf" }));
    expect(onError).toHaveBeenNthCalledWith(1, "not_image");
    expect(onError).toHaveBeenNthCalledWith(2, "not_image");
    expect(api.start).not.toHaveBeenCalled();
  });

  it("reports images the browser can't read", async () => {
    const { uploader, onError, api } = setup();
    const broken = new ImageUploader(api, setup().store, {
      prepare: async () => {
        throw new Error("decode");
      },
      onError,
      createPreview: () => "",
      revokePreview: () => {},
    });
    await broken.upload("a", png);
    expect(onError).toHaveBeenCalledWith("unreadable");
    expect(uploader.busy).toBe(false);
  });

  it("leaves the shot alone when the bucket refuses a copy", async () => {
    const { store, api, uploader, onError, revokePreview } = setup();
    api.send.mockResolvedValueOnce(false);
    await uploader.upload("a", png);
    expect(onError).toHaveBeenCalledWith("rejected");
    expect(api.confirm).not.toHaveBeenCalled();
    expect(store.getSnapshot().shots[0].imageId).toBeNull();
    expect(revokePreview).toHaveBeenCalledWith("blob:preview");
  });

  it("passes on server errors, e.g. when uploads aren't set up", async () => {
    const { api, uploader, onError } = setup();
    api.start.mockResolvedValueOnce({ ok: false, error: "unavailable" });
    await uploader.upload("a", png);
    expect(onError).toHaveBeenCalledWith("unavailable");
    expect(api.send).not.toHaveBeenCalled();
  });

  it("treats a network failure as offline", async () => {
    const { api, uploader, onError } = setup();
    api.send.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await uploader.upload("a", png);
    expect(onError).toHaveBeenCalledWith("offline");
    expect(uploader.busy).toBe(false);
  });
});

describe("fitWithin", () => {
  it("scales the longest edge down and never up", () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(1080, 1920, 640)).toEqual({ width: 360, height: 640 });
    expect(fitWithin(300, 200, 640)).toEqual({ width: 300, height: 200 });
    expect(fitWithin(10000, 1, 640)).toEqual({ width: 640, height: 1 });
  });
});
