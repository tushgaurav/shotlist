import { describe, expect, it, vi } from "vitest";

import type { ImageUploadApi } from "../shots/image-uploader";
import type { PreparedImage } from "../shots/images";
import { MoodboardStore, type MoodboardApi } from "./board-store";
import { BoardUploader, type BoardUpload } from "./uploads";

const ok = { ok: true } as const;

function setup() {
  const boardApi: MoodboardApi = {
    createBoard: async () => ok,
    updateBoard: async () => ok,
    removeBoard: async () => ok,
    restoreBoard: async () => ok,
    duplicateBoard: async () => ok,
    createItem: vi.fn<MoodboardApi["createItem"]>(async () => ok),
    updateItems: async () => ok,
    moveItem: async () => ok,
    removeItem: async () => ok,
    restoreItem: async () => ok,
  };
  const store = new MoodboardStore(
    boardApi,
    {
      boards: [{ id: "b1", name: "Looks", columns: 3, position: "a0", archived: false }],
      items: [
        {
          id: "t",
          boardId: "b1",
          position: "a0",
          kind: "text",
          wide: false,
          assetId: null,
          caption: null,
          content: { text: "Hi", style: "body", align: "start" },
          width: null,
          height: null,
        },
      ],
      version: 1,
    },
    { createId: () => "unused" },
  );

  let assets = 0;
  const form = { url: "https://bucket.test", fields: {} };
  const api = {
    start: vi.fn<ImageUploadApi["start"]>(async () => ({
      ok: true,
      assetId: `asset${++assets}`,
      forms: { full: form, thumb: form },
    })),
    send: vi.fn<ImageUploadApi["send"]>(async () => true),
    confirm: vi.fn<ImageUploadApi["confirm"]>(async () => ok),
  } satisfies ImageUploadApi;

  const prepared: PreparedImage = {
    contentType: "image/webp",
    width: 1200,
    height: 800,
    full: new Blob(["full"]),
    thumb: new Blob(["thumb"]),
  };
  const prepare = vi.fn(async () => prepared);
  const onError = vi.fn();
  const revokePreview = vi.fn();
  let uploads = 0;
  const uploader = new BoardUploader(api, store, {
    prepare,
    onError,
    createPreview: () => "blob:preview",
    revokePreview,
    createId: () => `upload${++uploads}`,
  });
  return { store, boardApi, api, uploader, prepare, onError, revokePreview };
}

const png = (name = "frame.png") => new File(["x"], name, { type: "image/png" });

describe("BoardUploader", () => {
  it("shows a placeholder, then the preview, then adds the item under the same ID", async () => {
    const { store, boardApi, uploader } = setup();
    const seen: BoardUpload[][] = [];
    uploader.subscribe(() => seen.push([...uploader.getSnapshot()]));
    await uploader.add("b1", [png()], "t");

    expect(seen[0]).toEqual([expect.objectContaining({ id: "upload1", preview: null, width: null })]);
    expect(seen[1]).toEqual([expect.objectContaining({ id: "upload1", preview: "blob:preview", width: 1200 })]);
    expect(uploader.getSnapshot()).toEqual([]);

    expect(store.itemsIn("b1").map((item) => item.id)).toEqual(["upload1", "t"]);
    expect(store.itemsIn("b1")[0]).toMatchObject({ kind: "image", assetId: "asset1", width: 1200, height: 800 });
    expect(uploader.previewFor("asset1")).toBe("blob:preview");
    await vi.waitFor(() => expect(boardApi.createItem).toHaveBeenCalledOnce());
  });

  it("keeps several images in the order they were dropped", async () => {
    const { store, uploader } = setup();
    await uploader.add("b1", [png("a.png"), png("b.png"), png("c.png")]);
    expect(store.itemsIn("b1").map((item) => item.id)).toEqual(["t", "upload1", "upload2", "upload3"]);
  });

  it("decodes one image at a time", async () => {
    const { uploader, prepare } = setup();
    let active = 0;
    let most = 0;
    prepare.mockImplementation(async () => {
      most = Math.max(most, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return { contentType: "image/webp", width: 1, height: 1, full: new Blob(), thumb: new Blob() };
    });
    await uploader.add("b1", [png(), png(), png()]);
    expect(most).toBe(1);
  });

  it("skips files that aren't images and reports them", async () => {
    const { store, uploader, onError } = setup();
    await uploader.add("b1", [new File(["x"], "notes.txt", { type: "text/plain" }), png()]);
    expect(onError).toHaveBeenCalledWith("not_image");
    expect(store.itemsIn("b1")).toHaveLength(2);
  });

  it("removes the placeholder and lets go of the preview when the upload fails", async () => {
    const { store, api, uploader, onError, revokePreview } = setup();
    api.send.mockResolvedValue(false);
    await uploader.add("b1", [png()]);
    expect(onError).toHaveBeenCalledWith("rejected");
    expect(uploader.getSnapshot()).toEqual([]);
    expect(revokePreview).toHaveBeenCalledWith("blob:preview");
    expect(store.itemsIn("b1")).toHaveLength(1);
  });

  it("reports images that can't be decoded", async () => {
    const { uploader, prepare, onError } = setup();
    prepare.mockRejectedValue(new Error("bad"));
    await uploader.add("b1", [png()]);
    expect(onError).toHaveBeenCalledWith("unreadable");
    expect(uploader.getSnapshot()).toEqual([]);
  });

  it("drops the image if its board was deleted meanwhile", async () => {
    const { store, uploader, revokePreview } = setup();
    const done = uploader.add("b1", [png()]);
    store.removeBoard("b1");
    await done;
    expect(store.getSnapshot().items).toEqual([]);
    expect(revokePreview).toHaveBeenCalled();
  });
});
