import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { positionBetween } from "../shots/positions";
import { MoodboardStore, type ItemValues, type MoodboardApi } from "./board-store";
import type { BoardItem, BoardRecord, MoodboardData } from "./types";

let lastPosition: string | null = null;
const next = () => (lastPosition = positionBetween(lastPosition, null));

const board = (id: string, extra: Partial<BoardRecord> = {}): BoardRecord => ({
  id,
  name: `Board ${id}`,
  columns: 3,
  position: next(),
  archived: false,
  ...extra,
});

const text = (id: string, boardId: string, value = id): BoardItem => ({
  id,
  boardId,
  position: next(),
  kind: "text",
  wide: false,
  assetId: null,
  caption: null,
  content: { text: value, style: "body", align: "start" },
  width: null,
  height: null,
});

const imageValues: ItemValues = {
  kind: "image",
  wide: false,
  assetId: "asset1",
  caption: null,
  content: null,
  width: 800,
  height: 600,
};

function fakeApi() {
  const calls: { op: string; args: unknown }[] = [];
  const ok = { ok: true } as const;
  const record =
    (op: string) =>
    async (...args: unknown[]) => (calls.push({ op, args: args.length === 1 ? args[0] : args }), ok);
  const api = {
    createBoard: vi.fn<MoodboardApi["createBoard"]>(record("createBoard")),
    updateBoard: vi.fn<MoodboardApi["updateBoard"]>(record("updateBoard")),
    removeBoard: vi.fn<MoodboardApi["removeBoard"]>(record("removeBoard")),
    restoreBoard: vi.fn<MoodboardApi["restoreBoard"]>(record("restoreBoard")),
    duplicateBoard: vi.fn<MoodboardApi["duplicateBoard"]>(record("duplicateBoard")),
    createItem: vi.fn<MoodboardApi["createItem"]>(record("createItem")),
    updateItems: vi.fn<MoodboardApi["updateItems"]>(record("updateItems")),
    moveItem: vi.fn<MoodboardApi["moveItem"]>(record("moveItem")),
    removeItem: vi.fn<MoodboardApi["removeItem"]>(record("removeItem")),
    restoreItem: vi.fn<MoodboardApi["restoreItem"]>(record("restoreItem")),
  } satisfies MoodboardApi;
  return { api, calls };
}

function setup(data?: Partial<MoodboardData>) {
  lastPosition = null;
  const initial: MoodboardData = {
    boards: [board("b1"), board("b2")],
    items: [text("x", "b1"), text("y", "b1"), text("z", "b2")],
    version: 1,
    ...data,
  };
  const { api, calls } = fakeApi();
  const onError = vi.fn();
  let n = 0;
  const store = new MoodboardStore(api, initial, {
    createId: () => `new${++n}`,
    onError,
    flushMs: 500,
    retryDelays: [100],
    offlineRetryMs: 5000,
  });
  return { store, api, calls, onError, initial };
}

const ids = (store: MoodboardStore, boardId: string) => store.itemsIn(boardId).map((item) => item.id);
const boardIds = (store: MoodboardStore) => store.getSnapshot().boards.map((b) => b.id);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("MoodboardStore items", () => {
  it("batches edits into one request per pause, merged per item", async () => {
    const { store, api } = setup();
    store.updateItem("x", { caption: "Dusk" });
    store.updateItem("x", { wide: true });
    store.updateItem("y", { caption: "Dawn" });
    expect(store.getSnapshot().status).toBe("saving");
    expect(api.updateItems).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(api.updateItems).toHaveBeenCalledWith([
      { id: "x", patch: { caption: "Dusk", wide: true } },
      { id: "y", patch: { caption: "Dawn" } },
    ]);
    expect(store.getSnapshot().status).toBe("saved");
  });

  it("adds items at the end or before another item", async () => {
    const { store, api } = setup();
    const end = store.addItem("b1", imageValues);
    const first = store.addItem("b1", imageValues, { beforeId: "x" });
    expect(ids(store, "b1")).toEqual([first, "x", "y", end]);

    await vi.runAllTimersAsync();
    expect(api.createItem).toHaveBeenCalledTimes(2);
    // Sizes are joined from the image on the server, so they aren't sent.
    expect(api.createItem.mock.calls[0][0]).not.toHaveProperty("width");
    expect(api.createItem.mock.calls[0][0]).toMatchObject({ id: end, boardId: "b1", assetId: "asset1" });
  });

  it("adds an item under a given ID and position, once", () => {
    const { store } = setup();
    const [position] = store.positionsFor("b1", "y", 1);
    expect(store.addItem("b1", imageValues, { position }, "upload1")).toBe("upload1");
    expect(store.addItem("b1", imageValues, { position }, "upload1")).toBeNull();
    expect(ids(store, "b1")).toEqual(["x", "upload1", "y"]);
  });

  it("hands out positions in a row for items still uploading", () => {
    const { store } = setup();
    const positions = store.positionsFor("b1", "y", 3);
    const x = store.itemsIn("b1")[0].position;
    const y = store.itemsIn("b1")[1].position;
    expect(positions.every((p) => p > x && p < y)).toBe(true);
    expect(positions.toSorted()).toEqual(positions);
    expect(new Set(positions).size).toBe(3);
  });

  it("doesn't add to a board that's gone", () => {
    const { store, api } = setup();
    expect(store.addItem("missing", imageValues)).toBeNull();
    expect(api.createItem).not.toHaveBeenCalled();
  });

  it("moves items within and between boards", async () => {
    const { store, calls } = setup();
    store.moveItem("y", "b1", "x");
    expect(ids(store, "b1")).toEqual(["y", "x"]);
    store.moveItem("x", "b2", null);
    expect(ids(store, "b1")).toEqual(["y"]);
    expect(ids(store, "b2")).toEqual(["z", "x"]);

    await vi.runAllTimersAsync();
    expect(calls.map((c) => c.op)).toEqual(["moveItem", "moveItem"]);
    expect(calls[1].args).toMatchObject({ id: "x", boardId: "b2" });
  });

  it("ignores moves that change nothing", async () => {
    const { store, api } = setup();
    store.moveItem("x", "b1", "y");
    store.moveItem("x", "b1", "x");
    await vi.runAllTimersAsync();
    expect(api.moveItem).not.toHaveBeenCalled();
  });

  it("nudges an item one step at a time", () => {
    const { store } = setup();
    store.nudgeItem("x", 1);
    expect(ids(store, "b1")).toEqual(["y", "x"]);
    store.nudgeItem("x", 1);
    expect(ids(store, "b1")).toEqual(["y", "x"]);
    store.nudgeItem("x", -1);
    expect(ids(store, "b1")).toEqual(["x", "y"]);
  });

  it("duplicates an item right after the original", () => {
    const { store } = setup();
    const copy = store.duplicateItem("x");
    expect(ids(store, "b1")).toEqual(["x", copy, "y"]);
    expect(store.itemsIn("b1")[1].content).toEqual(store.itemsIn("b1")[0].content);
  });

  it("saves waiting edits before a delete, and restores", async () => {
    const { store, calls } = setup();
    store.updateItem("x", { caption: "Keep" });
    const removed = store.removeItem("x")!;
    expect(ids(store, "b1")).toEqual(["y"]);
    store.restoreItem(removed);
    expect(ids(store, "b1")).toEqual(["x", "y"]);
    expect(store.itemsIn("b1")[0].caption).toBe("Keep");

    await vi.runAllTimersAsync();
    expect(calls.map((c) => c.op)).toEqual(["updateItems", "removeItem", "restoreItem"]);
  });
});

describe("MoodboardStore boards", () => {
  it("adds boards at the end of the list", async () => {
    const { store, api } = setup();
    const id = store.addBoard("Locations");
    expect(boardIds(store)).toEqual(["b1", "b2", id]);
    await vi.runAllTimersAsync();
    expect(api.createBoard).toHaveBeenCalledWith(expect.objectContaining({ id, name: "Locations", columns: 3 }));
  });

  it("skips board updates that change nothing", async () => {
    const { store, api } = setup();
    store.updateBoard("b1", { name: "Board b1" });
    store.updateBoard("b1", { columns: 2 });
    await vi.runAllTimersAsync();
    expect(api.updateBoard).toHaveBeenCalledTimes(1);
    expect(api.updateBoard).toHaveBeenCalledWith("b1", { columns: 2 });
  });

  it("reorders boards", async () => {
    const { store, api } = setup();
    store.moveBoard("b2", "b1");
    expect(boardIds(store)).toEqual(["b2", "b1"]);
    store.moveBoard("b2", "b1");
    await vi.runAllTimersAsync();
    expect(api.updateBoard).toHaveBeenCalledTimes(1);
  });

  it("removes a board with its items, and restores both", async () => {
    const { store, calls } = setup();
    const removed = store.removeBoard("b1")!;
    expect(boardIds(store)).toEqual(["b2"]);
    expect(store.getSnapshot().items.map((i) => i.id)).toEqual(["z"]);

    store.restoreBoard(removed);
    expect(boardIds(store)).toEqual(["b1", "b2"]);
    expect(ids(store, "b1")).toEqual(["x", "y"]);
    await vi.runAllTimersAsync();
    expect(calls.map((c) => c.op)).toEqual(["removeBoard", "restoreBoard"]);
  });

  it("duplicates a board after the original, copying its items under new IDs", async () => {
    const { store, api, calls } = setup();
    store.updateItem("x", { caption: "Latest" });
    const copy = store.duplicateBoard("b1", "Board b1 (Copy)")!;
    expect(boardIds(store)).toEqual(["b1", copy, "b2"]);
    expect(store.itemsIn(copy).map((item) => item.caption)).toEqual(["Latest", null]);
    expect(ids(store, copy)).toEqual(["new2", "new3"]);

    await vi.runAllTimersAsync();
    // The edit is saved first, so the server copies it.
    expect(calls.map((c) => c.op)).toEqual(["updateItems", "duplicateBoard"]);
    expect(api.duplicateBoard).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "b1",
        id: copy,
        items: [
          { sourceId: "x", id: "new2" },
          { sourceId: "y", id: "new3" },
        ],
      }),
    );
  });
});

describe("MoodboardStore saving", () => {
  it("sends requests one at a time, in order", async () => {
    const { store, api, calls } = setup();
    let release!: () => void;
    api.createBoard.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ ok: true }))),
    );
    store.addBoard("Slow");
    store.removeItem("x");
    await vi.advanceTimersByTimeAsync(0);
    expect(api.removeItem).not.toHaveBeenCalled();
    release();
    await vi.runAllTimersAsync();
    expect(calls.map((c) => c.op)).toEqual(["removeItem"]);
    expect(api.removeItem).toHaveBeenCalledTimes(1);
  });

  it("retries, then keeps edits for later while offline", async () => {
    const { store, api, onError } = setup();
    api.updateItems.mockRejectedValue(new Error("offline"));
    store.updateItem("x", { caption: "A" });
    await vi.advanceTimersByTimeAsync(500 + 100);
    expect(api.updateItems).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith("offline");
    expect(store.getSnapshot().status).toBe("offline");

    api.updateItems.mockResolvedValue({ ok: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.updateItems).toHaveBeenLastCalledWith([{ id: "x", patch: { caption: "A" } }]);
    expect(store.getSnapshot().status).toBe("saved");
  });

  it("reports server rejections", async () => {
    const { store, api, onError } = setup();
    api.removeItem.mockResolvedValue({ ok: false, error: "not_found" });
    store.removeItem("x");
    await vi.runAllTimersAsync();
    expect(onError).toHaveBeenCalledWith("not_found");
    expect(store.getSnapshot().status).toBe("error");
  });
});

describe("MoodboardStore.receive", () => {
  it("takes newer data when nothing is waiting to save", () => {
    const { store } = setup();
    store.receive({ boards: [board("b9")], items: [], version: 2 });
    expect(boardIds(store)).toEqual(["b9"]);
  });

  it("keeps local work while it's saving", () => {
    const { store } = setup();
    store.updateItem("x", { caption: "Mine" });
    store.receive({ boards: [board("b9")], items: [], version: 2 });
    expect(boardIds(store)).toEqual(["b1", "b2"]);
  });

  it("ignores data older than what it saved", async () => {
    const { store, api } = setup();
    api.updateItems.mockResolvedValue({ ok: true, version: 5 });
    store.updateItem("x", { caption: "Mine" });
    await vi.runAllTimersAsync();
    store.receive({ boards: [board("b9")], items: [], version: 4 });
    expect(boardIds(store)).toEqual(["b1", "b2"]);
  });

  it("ignores data it already took", async () => {
    const { store, initial } = setup();
    store.addBoard("Local");
    await vi.runAllTimersAsync();
    store.receive(initial);
    expect(boardIds(store)).toHaveLength(3);
  });
});
