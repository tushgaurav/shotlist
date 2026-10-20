import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { positionBetween } from "./positions";
import { ShotStore, type ShotApi } from "./shot-store";
import { EMPTY_SHOT, type ShotListData, type ShotRecord, type ShotScene } from "./types";

const scene = (id: string, number: string, extra: Partial<ShotScene> = {}): ShotScene => ({
  id,
  number,
  position: Number(number) - 1,
  heading: `INT. ROOM ${number} - DAY`,
  removed: false,
  contentHash: `hash-${id}`,
  reviewedHash: `hash-${id}`,
  characters: [],
  ...extra,
});

let lastPosition: string | null = null;
const shot = (id: string, sceneId: string | null, suffix: string | null): ShotRecord => {
  lastPosition = positionBetween(lastPosition, null);
  return { ...EMPTY_SHOT, id, sceneId, suffix, position: lastPosition };
};

function fakeApi() {
  const calls: { op: string; args: unknown }[] = [];
  const ok = { ok: true } as const;
  const api = {
    load: vi.fn<ShotApi["load"]>(async () => (calls.push({ op: "load", args: null }), null)),
    create: vi.fn<ShotApi["create"]>(async (input) => (calls.push({ op: "create", args: input }), { ...ok, suffix: "Q" })),
    update: vi.fn<ShotApi["update"]>(async (changes) => (calls.push({ op: "update", args: changes }), ok)),
    move: vi.fn<ShotApi["move"]>(async (input) => (calls.push({ op: "move", args: input }), { ...ok, suffix: "R" })),
    remove: vi.fn<ShotApi["remove"]>(async (id) => (calls.push({ op: "remove", args: id }), ok)),
    restore: vi.fn<ShotApi["restore"]>(async (id) => (calls.push({ op: "restore", args: id }), { ...ok, suffix: "A" })),
    renumber: vi.fn<ShotApi["renumber"]>(async (sceneId) => (calls.push({ op: "renumber", args: sceneId }), { ...ok, suffixes: {} })),
    markReviewed: vi.fn<ShotApi["markReviewed"]>(async (sceneId) => (calls.push({ op: "markReviewed", args: sceneId }), ok)),
  } satisfies ShotApi;
  return { api, calls };
}

function setup(data?: Partial<ShotListData>) {
  lastPosition = null;
  const initial: ShotListData = {
    scenes: [scene("s1", "1"), scene("s2", "2")],
    shots: [shot("a", "s1", "A"), shot("b", "s1", "B"), shot("c", "s2", "A")],
    version: 1,
    ...data,
  };
  const { api, calls } = fakeApi();
  const onError = vi.fn();
  let n = 0;
  const store = new ShotStore(api, initial, {
    createId: () => `new${++n}`,
    onError,
    flushMs: 500,
    retryDelays: [100],
    offlineRetryMs: 5000,
  });
  return { store, api, calls, onError, initial };
}

const labels = (store: ShotStore, sceneId: string | null) =>
  store.shotsIn(sceneId).map((s) => `${s.id}:${s.suffix}`);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ShotStore edits", () => {
  it("batches edits into one request per pause, merged per shot", async () => {
    const { store, api } = setup();
    store.update("a", { description: "Wide" });
    store.update("a", { size: "WS" });
    store.update("b", { vfx: true });
    expect(store.getSnapshot().status).toBe("saving");
    expect(api.update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith([
      { id: "a", patch: { description: "Wide", size: "WS" } },
      { id: "b", patch: { vfx: true } },
    ]);
    expect(store.getSnapshot().status).toBe("saved");
    expect(store.getSnapshot().shots.find((s) => s.id === "a")?.size).toBe("WS");
  });

  it("marks the shot's scene reviewed locally", () => {
    const { store } = setup({ scenes: [scene("s1", "1", { reviewedHash: "old" }), scene("s2", "2")] });
    store.update("a", { description: "x" });
    const s1 = store.getSnapshot().scenes[0];
    expect(s1.reviewedHash).toBe(s1.contentHash);
  });

  it("keeps edits and retries later when the server can't be reached", async () => {
    const { store, api, onError } = setup();
    api.update.mockRejectedValueOnce(new Error("network")).mockRejectedValueOnce(new Error("network"));

    store.update("a", { lens: "35mm" });
    await vi.advanceTimersByTimeAsync(500 + 100);
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().status).toBe("offline");
    expect(onError).toHaveBeenCalledWith("offline");

    store.update("a", { lens: "50mm" });
    await vi.advanceTimersByTimeAsync(500);
    expect(api.update).toHaveBeenLastCalledWith([{ id: "a", patch: { lens: "50mm" } }]);
    expect(store.getSnapshot().status).toBe("saved");
  });

  it("stops on a rejection the server won't change its mind about", async () => {
    const { store, api, onError } = setup();
    api.update.mockResolvedValueOnce({ ok: false, error: "invalid" });
    store.update("a", { lens: "35mm" });
    await vi.advanceTimersByTimeAsync(500);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("invalid");
    expect(store.getSnapshot().status).toBe("error");
  });
});

describe("ShotStore structure", () => {
  it("adds a shot with the next letter and creates it before saving its edits", async () => {
    const { store, calls } = setup();
    const id = store.add("s1");
    expect(labels(store, "s1")).toEqual(["a:A", "b:B", `${id}:C`]);

    store.update(id, { description: "Insert of the cup" });
    await vi.advanceTimersByTimeAsync(500);
    expect(calls.map((c) => c.op)).toEqual(["create", "update"]);
    // The server's letter wins.
    expect(labels(store, "s1").at(-1)).toBe(`${id}:Q`);
  });

  it("inserts after a given shot", () => {
    const { store } = setup();
    const id = store.add("s1", { afterId: "a" });
    expect(store.shotsIn("s1").map((s) => s.id)).toEqual(["a", id, "b"]);
  });

  it("duplicates a shot below the original with a fresh label and status", async () => {
    const { store, api } = setup();
    store.update("a", { description: "Close on the cup", lens: "85mm", status: "shot", customLabel: "Hero" });
    const id = store.duplicate("a")!;
    const copy = store.shotsIn("s1")[1];
    expect(copy).toMatchObject({ id, description: "Close on the cup", lens: "85mm", status: "planned", customLabel: null, suffix: "C" });
    await vi.runAllTimersAsync();
    expect(api.update).toHaveBeenLastCalledWith(
      expect.arrayContaining([{ id, patch: expect.objectContaining({ description: "Close on the cup", lens: "85mm" }) }]),
    );
  });

  it("reorders within a scene without relabelling", async () => {
    const { store, api } = setup();
    store.nudge("b", -1);
    expect(labels(store, "s1")).toEqual(["b:B", "a:A"]);
    store.nudge("b", -1);
    await vi.runAllTimersAsync();
    expect(api.move).toHaveBeenCalledTimes(1);
  });

  it("gives a shot moved to another scene that scene's next letter", async () => {
    const { store, api } = setup();
    store.move("a", "s2", null);
    expect(labels(store, "s2")).toEqual(["c:A", "a:B"]);
    expect(labels(store, "s1")).toEqual(["b:B"]);
    await vi.runAllTimersAsync();
    expect(api.move).toHaveBeenCalledWith(expect.objectContaining({ id: "a", sceneId: "s2" }));
    expect(labels(store, "s2")).toEqual(["c:A", "a:R"]);
  });

  it("ignores a drop back onto the same spot", async () => {
    const { store, api } = setup();
    store.move("a", "s1", "b");
    store.move("a", "s1", "a");
    await vi.runAllTimersAsync();
    expect(api.move).not.toHaveBeenCalled();
  });

  it("saves waiting edits before deleting, and restores the shot", async () => {
    const { store, calls } = setup();
    store.update("a", { notes: "Keep" });
    const removed = store.remove("a");
    expect(store.shotsIn("s1").map((s) => s.id)).toEqual(["b"]);
    expect(calls.map((c) => c.op)).toEqual([]);
    await vi.runAllTimersAsync();
    expect(calls.map((c) => c.op)).toEqual(["update", "remove"]);

    store.restore(removed!);
    expect(store.shotsIn("s1").map((s) => s.id)).toEqual(["a", "b"]);
    expect(store.shotsIn("s1")[0].notes).toBe("Keep");
  });

  it("renumbers a scene in its current order", () => {
    const { store } = setup();
    store.nudge("b", -1);
    store.renumber("s1");
    expect(labels(store, "s1")).toEqual(["b:A", "a:B"]);
  });
});

describe("ShotStore.receive", () => {
  it("replaces local data when nothing is waiting to save", () => {
    const { store, initial } = setup();
    store.receive({ ...initial, shots: [] });
    expect(store.getSnapshot().shots).toEqual([]);
  });

  it("keeps local shots while changes are saving, but takes new scene details", () => {
    const { store, initial } = setup();
    store.update("a", { description: "Unsaved" });
    store.receive({
      scenes: [scene("s1", "4", { heading: "EXT. NEW - NIGHT" })],
      shots: [],
      version: 2,
    });
    const snapshot = store.getSnapshot();
    expect(snapshot.shots).toHaveLength(initial.shots.length);
    expect(snapshot.scenes.map((s) => [s.number, s.heading])).toEqual([["4", "EXT. NEW - NIGHT"]]);
  });

  it("ignores shots loaded before its own last save landed", async () => {
    const { store, api, initial } = setup();
    api.update.mockResolvedValueOnce({ ok: true, version: 5 });
    store.update("a", { description: "Saved" });
    await vi.runAllTimersAsync();

    store.receive({ ...initial, scenes: [scene("s1", "7")], version: 3 });
    const snapshot = store.getSnapshot();
    expect(snapshot.shots.find((s) => s.id === "a")?.description).toBe("Saved");
    expect(snapshot.scenes.map((s) => s.number)).toEqual(["7"]);
  });

  it("takes shots loaded after its last save", async () => {
    const { store, api, initial } = setup();
    api.update.mockResolvedValueOnce({ ok: true, version: 5 });
    store.update("a", { description: "Saved" });
    await vi.runAllTimersAsync();

    store.receive({ ...initial, shots: [], version: 5 });
    expect(store.getSnapshot().shots).toEqual([]);
  });

  it("ignores data it already took, like a page shown again with what it was rendered with", () => {
    const { store, initial } = setup();
    const fresh = { ...initial, scenes: [scene("s1", "1"), scene("s3", "3")], version: 2 };
    store.receive(fresh);
    store.receive(initial);
    expect(store.getSnapshot().scenes.map((s) => s.id)).toEqual(["s1", "s3"]);
  });
});

describe("ShotStore.sync", () => {
  it("loads after the queued requests and takes the result", async () => {
    const { store, api, calls, initial } = setup();
    api.load.mockImplementationOnce(async () => {
      calls.push({ op: "load", args: null });
      return { ...initial, scenes: [...initial.scenes, scene("s3", "3")], version: 2 };
    });
    store.remove("c");
    store.sync();
    await vi.runAllTimersAsync();

    expect(calls.map((call) => call.op)).toEqual(["remove", "load"]);
    expect(store.getSnapshot().scenes.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("loads once more when asked again mid-load, and not more", async () => {
    const { store, api, initial } = setup();
    let finish!: () => void;
    api.load.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({ ...initial, version: 2 }))),
    );
    store.sync();
    await vi.advanceTimersByTimeAsync(0);
    store.sync();
    store.sync();
    expect(api.load).toHaveBeenCalledTimes(1);

    finish();
    await vi.runAllTimersAsync();
    expect(api.load).toHaveBeenCalledTimes(2);
  });

  it("keeps what's on screen when a load fails", async () => {
    const { store, api, initial } = setup();
    api.load.mockRejectedValueOnce(new Error("offline"));
    store.sync();
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().shots).toEqual(initial.shots);
    expect(store.getSnapshot().status).toBe("saved");
  });
});
