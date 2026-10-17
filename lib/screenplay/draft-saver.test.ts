import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backupKey, DraftSaver, readBackup, type SaveStatus } from "./draft-saver";

class MemoryStorage {
  items = new Map<string, string>();
  getItem = (key: string) => this.items.get(key) ?? null;
  setItem = (key: string, value: string) => void this.items.set(key, value);
  removeItem = (key: string) => void this.items.delete(key);
}

function setup(respond: (body: { revision: number; draft: unknown }) => Response | Promise<Response>) {
  const statuses: SaveStatus[] = [];
  const storage = new MemoryStorage();
  const requests: { revision: number; draft: unknown }[] = [];
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    return respond(body);
  });

  const saver = new DraftSaver({
    scriptId: "s1",
    revision: 3,
    onStatusChange: (status) => statuses.push(status),
    fetch: fetch as unknown as typeof globalThis.fetch,
    storage,
  });

  const edit = (text: string) => saver.change(() => ({ text }));

  return { saver, edit, statuses, storage, requests, fetch };
}

const ok = (revision: number) => Response.json({ revision });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("DraftSaver", () => {
  it("debounces edits into one save and clears the backup afterwards", async () => {
    const { edit, statuses, storage, requests } = setup((body) => ok(body.revision + 1));
    edit("a");
    edit("ab");
    await vi.advanceTimersByTimeAsync(400);
    expect(readBackup("s1", storage)?.draft).toEqual({ text: "ab" });

    await vi.advanceTimersByTimeAsync(1500);
    expect(requests).toEqual([{ revision: 3, draft: { text: "ab" } }]);
    expect(statuses).toEqual(["saving", "saved"]);
    expect(storage.getItem(backupKey("s1"))).toBeNull();
  });

  it("sends the next save with the revision the server returned", async () => {
    const { edit, requests } = setup((body) => ok(body.revision + 1));
    edit("a");
    await vi.advanceTimersByTimeAsync(1500);
    edit("b");
    await vi.advanceTimersByTimeAsync(1500);
    expect(requests.map((r) => r.revision)).toEqual([3, 4]);
  });

  it("keeps one request in flight and saves edits made during it afterwards", async () => {
    let release!: () => void;
    const { saver, edit, requests } = setup(
      (body) => new Promise((resolve) => (release = () => resolve(ok(body.revision + 1)))),
    );
    edit("a");
    await vi.advanceTimersByTimeAsync(1500);
    edit("ab");
    await vi.advanceTimersByTimeAsync(1500);
    expect(requests).toHaveLength(1);

    release();
    await vi.advanceTimersByTimeAsync(1500);
    expect(requests.map((r) => r.draft)).toEqual([{ text: "a" }, { text: "ab" }]);
    expect(requests[1].revision).toBe(4);
    expect(saver.hasUnsavedChanges).toBe(true);
  });

  it("goes offline, keeps the backup and retries", async () => {
    let online = false;
    const { edit, statuses, storage, requests } = setup((body) => {
      if (!online) throw new TypeError("Failed to fetch");
      return ok(body.revision + 1);
    });
    edit("a");
    await vi.advanceTimersByTimeAsync(1500);
    expect(statuses.at(-1)).toBe("offline");
    expect(readBackup("s1", storage)).toMatchObject({ baseRevision: 3, draft: { text: "a" } });

    online = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(requests).toHaveLength(2);
    expect(statuses.at(-1)).toBe("saved");
    expect(storage.getItem(backupKey("s1"))).toBeNull();
  });

  it("stops on a revision conflict", async () => {
    const { saver, edit, statuses, requests } = setup(() => new Response(null, { status: 409 }));
    edit("a");
    await vi.advanceTimersByTimeAsync(1500);
    expect(statuses.at(-1)).toBe("conflict");

    edit("b");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(requests).toHaveLength(1);
    expect(saver.currentStatus).toBe("conflict");
  });

  it("flush saves immediately", async () => {
    const { saver, edit, requests } = setup((body) => ok(body.revision + 1));
    edit("a");
    await saver.flush();
    expect(requests).toHaveLength(1);
  });
});
