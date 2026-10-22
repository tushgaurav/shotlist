import { positionBetween } from "../shots/positions";
import {
  compareOrdered,
  DEFAULT_BOARD_COLUMNS,
  type BoardItem,
  type BoardPatch,
  type BoardRecord,
  type ItemPatch,
  type MoodboardData,
  type MoodboardMutation,
  type MoodboardMutationError,
  type NewItem,
} from "./types";

export type MoodboardSaveStatus = "saved" | "saving" | "offline" | "error";

export type MoodboardState = Omit<MoodboardData, "version"> & { status: MoodboardSaveStatus };

type Move = { id: string; boardId: string; position: string };

export type MoodboardApi = {
  createBoard(input: { id: string; name: string; columns: number; position: string }): Promise<MoodboardMutation>;
  updateBoard(id: string, patch: BoardPatch): Promise<MoodboardMutation>;
  removeBoard(id: string): Promise<MoodboardMutation>;
  restoreBoard(id: string): Promise<MoodboardMutation>;
  /** Copies the listed items of `sourceId` into a new board, under the IDs given. */
  duplicateBoard(input: {
    sourceId: string;
    id: string;
    name: string;
    position: string;
    items: { sourceId: string; id: string }[];
  }): Promise<MoodboardMutation>;
  createItem(input: NewItem): Promise<MoodboardMutation>;
  updateItems(changes: { id: string; patch: ItemPatch }[]): Promise<MoodboardMutation>;
  moveItem(input: Move): Promise<MoodboardMutation>;
  removeItem(id: string): Promise<MoodboardMutation>;
  restoreItem(id: string): Promise<MoodboardMutation>;
};

export type MoodboardStoreOptions = {
  createId: () => string;
  onError?: (error: MoodboardMutationError | "offline") => void;
  /** Item edits are batched into one request this long after the last change. */
  flushMs?: number;
  /** Delays between retries of a request that couldn't reach the server. */
  retryDelays?: number[];
  /** How long to wait before trying edits again once retries ran out. */
  offlineRetryMs?: number;
};

/** What a new item starts with; the store picks its ID and position. */
export type ItemValues = Omit<NewItem, "id" | "boardId" | "position"> & Pick<BoardItem, "width" | "height">;

/** Where a new item goes: before an item, at the end (null), or at a position picked earlier. */
export type Placement = { beforeId: string | null } | { position: string };

export function itemValues({ kind, wide, assetId, caption, content, width, height }: BoardItem): ItemValues {
  return { kind, wide, assetId, caption, content, width, height };
}

function newItem({ id, boardId, position, kind, wide, assetId, caption, content }: BoardItem): NewItem {
  return { id, boardId, position, kind, wide, assetId, caption, content };
}

/** A deleted board and its items, for Undo. */
export type RemovedBoard = { board: BoardRecord; items: BoardItem[] };

/**
 * The mood boards' client state. Every change applies locally first, then goes to the server
 * through one queue, so requests land in the order they were made even when retried.
 */
export class MoodboardStore {
  private state: MoodboardState;
  private listeners = new Set<() => void>();
  private pending = new Map<string, ItemPatch>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private busy = 0;
  private failure: "offline" | "error" | null = null;
  private received = new WeakSet<MoodboardData>();
  /** The newest server version this store has seen, from loaded data or its own saves. */
  private version: number;
  private readonly flushMs: number;
  private readonly retryDelays: number[];
  private readonly offlineRetryMs: number;

  constructor(
    private readonly api: MoodboardApi,
    data: MoodboardData,
    private readonly options: MoodboardStoreOptions,
  ) {
    this.received.add(data);
    this.version = data.version;
    this.state = {
      boards: data.boards.toSorted(compareOrdered),
      items: data.items.toSorted(compareOrdered),
      status: "saved",
    };
    this.flushMs = options.flushMs ?? 700;
    this.retryDelays = options.retryDelays ?? [1000, 3000];
    this.offlineRetryMs = options.offlineRetryMs ?? 10_000;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  get hasUnsavedChanges() {
    return this.pending.size > 0 || this.busy > 0;
  }

  /**
   * Takes fresh server data, e.g. when the page is shown again. Data it already took is
   * ignored. Local work wins: nothing is replaced while changes are waiting to save, or by
   * data older than a change this store already saved.
   */
  receive(data: MoodboardData) {
    if (this.received.has(data)) return;
    this.received.add(data);
    if (this.hasUnsavedChanges || data.version < this.version) return;
    this.version = data.version;
    this.set({ boards: data.boards.toSorted(compareOrdered), items: data.items.toSorted(compareOrdered) });
  }

  itemsIn(boardId: string) {
    return this.state.items.filter((item) => item.boardId === boardId);
  }

  // Boards

  /** Adds a board at the end of the list. Returns its ID. */
  addBoard(name: string) {
    const id = this.options.createId();
    const position = positionBetween(this.state.boards.at(-1)?.position ?? null, null);
    const board: BoardRecord = { id, name, columns: DEFAULT_BOARD_COLUMNS, position, archived: false };
    this.setBoards([...this.state.boards, board]);
    void this.enqueue(() => this.api.createBoard({ id, name, columns: board.columns, position }));
    return id;
  }

  updateBoard(id: string, patch: Omit<BoardPatch, "position">) {
    const board = this.findBoard(id);
    if (!board) return;
    const changed = Object.entries(patch).some(([key, value]) => board[key as keyof BoardRecord] !== value);
    if (!changed) return;
    this.setBoards(this.state.boards.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    void this.enqueue(() => this.api.updateBoard(id, patch));
  }

  /** Moves a board before `beforeId` in the list, or to its end when `beforeId` is null. */
  moveBoard(id: string, beforeId: string | null) {
    const boards = this.state.boards;
    const index = boards.findIndex((b) => b.id === id);
    if (index < 0 || beforeId === id || (boards[index + 1]?.id ?? null) === beforeId) return;
    const position = this.positionAmong(
      boards.filter((b) => b.id !== id),
      beforeId,
    );
    if (position === null) return;
    this.setBoards(boards.map((b) => (b.id === id ? { ...b, position } : b)));
    void this.enqueue(() => this.api.updateBoard(id, { position }));
  }

  /** Returns what was removed, so it can be restored. */
  removeBoard(id: string): RemovedBoard | null {
    const board = this.findBoard(id);
    if (!board) return null;
    // Save waiting edits first so a restore brings the items back as they were.
    this.flush();
    const items = this.itemsIn(id);
    this.set({
      boards: this.state.boards.filter((b) => b.id !== id),
      items: this.state.items.filter((item) => item.boardId !== id),
    });
    void this.enqueue(() => this.api.removeBoard(id));
    return { board, items };
  }

  restoreBoard({ board, items }: RemovedBoard) {
    if (this.findBoard(board.id)) return;
    this.set({
      boards: [...this.state.boards, board].sort(compareOrdered),
      items: [...this.state.items, ...items].sort(compareOrdered),
    });
    void this.enqueue(() => this.api.restoreBoard(board.id));
  }

  /** A copy of the board right after it in the list, with copies of its items. Returns its ID. */
  duplicateBoard(id: string, name: string) {
    const board = this.findBoard(id);
    if (!board) return null;
    // The server copies what it has, so it needs the latest edits first.
    this.flush();
    const boards = this.state.boards;
    const next = boards[boards.findIndex((b) => b.id === id) + 1];
    const copyId = this.options.createId();
    const position = positionBetween(board.position, next?.position ?? null);
    const pairs = this.itemsIn(id).map((item) => ({ item, copyId: this.options.createId() }));

    this.set({
      boards: [...boards, { ...board, id: copyId, name, position, archived: false }].sort(compareOrdered),
      items: [
        ...this.state.items,
        ...pairs.map(({ item, copyId: itemId }) => ({ ...item, id: itemId, boardId: copyId })),
      ].sort(compareOrdered),
    });
    void this.enqueue(() =>
      this.api.duplicateBoard({
        sourceId: id,
        id: copyId,
        name,
        position,
        items: pairs.map(({ item, copyId: itemId }) => ({ sourceId: item.id, id: itemId })),
      }),
    );
    return copyId;
  }

  // Items

  /** Adds an item to a board. Returns its ID, or null if the board is gone. */
  addItem(boardId: string, values: ItemValues, placement: Placement = { beforeId: null }, id = this.options.createId()) {
    if (!this.findBoard(boardId) || this.findItem(id)) return null;
    const position =
      "position" in placement ? placement.position : this.positionAmong(this.itemsIn(boardId), placement.beforeId);
    if (position === null) return null;

    const item: BoardItem = { ...values, id, boardId, position };
    this.set({ items: [...this.state.items, item].sort(compareOrdered) });
    void this.enqueue(() => this.api.createItem(newItem(item)));
    return id;
  }

  /** `count` positions in a row before `beforeId` (or at the end), for items still on their way. */
  positionsFor(boardId: string, beforeId: string | null, count: number): string[] {
    const items = this.itemsIn(boardId);
    const index = beforeId ? items.findIndex((item) => item.id === beforeId) : items.length;
    if (index < 0) return this.positionsFor(boardId, null, count);
    const after = items[index]?.position ?? null;
    const positions: string[] = [];
    let before = items[index - 1]?.position ?? null;
    for (let n = 0; n < count; n++) {
      before = positionBetween(before, after);
      positions.push(before);
    }
    return positions;
  }

  updateItem(id: string, patch: ItemPatch) {
    const item = this.findItem(id);
    if (!item) return;
    this.replaceItem({ ...item, ...patch });
    this.pending.set(id, { ...this.pending.get(id), ...patch });
    this.scheduleFlush();
  }

  /** Moves an item before `beforeId` on a board, or to its end when `beforeId` is null. */
  moveItem(id: string, boardId: string, beforeId: string | null) {
    const item = this.findItem(id);
    if (!item || beforeId === id || !this.findBoard(boardId)) return;
    const items = this.itemsIn(boardId);
    if (item.boardId === boardId) {
      const next = items[items.findIndex((i) => i.id === id) + 1];
      if ((next?.id ?? null) === beforeId) return;
    }
    const position = this.positionAmong(
      items.filter((i) => i.id !== id),
      beforeId,
    );
    if (position === null) return;
    this.set({
      items: this.state.items.map((i) => (i.id === id ? { ...i, boardId, position } : i)).sort(compareOrdered),
    });
    void this.enqueue(() => this.api.moveItem({ id, boardId, position }));
  }

  /** One step earlier or later on its board. */
  nudgeItem(id: string, direction: -1 | 1) {
    const item = this.findItem(id);
    if (!item) return;
    const items = this.itemsIn(item.boardId);
    const index = items.findIndex((i) => i.id === id);
    if (direction === -1 && index > 0) this.moveItem(id, item.boardId, items[index - 1].id);
    if (direction === 1 && index < items.length - 1) this.moveItem(id, item.boardId, items[index + 2]?.id ?? null);
  }

  /** A copy right after the original. Returns its ID. */
  duplicateItem(id: string) {
    const item = this.findItem(id);
    if (!item) return null;
    const items = this.itemsIn(item.boardId);
    const next = items[items.findIndex((i) => i.id === id) + 1];
    return this.addItem(item.boardId, itemValues(item), { beforeId: next?.id ?? null });
  }

  /** Returns the removed item so it can be restored. */
  removeItem(id: string) {
    const item = this.findItem(id);
    if (!item) return null;
    this.flush();
    this.set({ items: this.state.items.filter((i) => i.id !== id) });
    void this.enqueue(() => this.api.removeItem(id));
    return item;
  }

  restoreItem(item: BoardItem) {
    if (this.findItem(item.id) || !this.findBoard(item.boardId)) return;
    this.set({ items: [...this.state.items, item].sort(compareOrdered) });
    void this.enqueue(() => this.api.restoreItem(item.id));
  }

  /** Sends batched edits now, e.g. when a field loses focus or the page is hidden. */
  flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.pending.size === 0) return;

    const changes = [...this.pending].map(([id, patch]) => ({ id, patch }));
    this.pending.clear();
    void this.enqueue(() => this.api.updateItems(changes), {
      onOffline: () => {
        for (const { id, patch } of changes) {
          if (this.findItem(id)) this.pending.set(id, { ...patch, ...this.pending.get(id) });
        }
        this.scheduleFlush(this.offlineRetryMs);
      },
    });
    this.refreshStatus();
  }

  /** A position among ordered siblings, before `beforeId` or at the end. Null if it isn't there. */
  private positionAmong(siblings: { id: string; position: string }[], beforeId: string | null) {
    const index = beforeId ? siblings.findIndex((s) => s.id === beforeId) : siblings.length;
    if (index < 0) return null;
    return positionBetween(siblings[index - 1]?.position ?? null, siblings[index]?.position ?? null);
  }

  private scheduleFlush(delay = this.flushMs) {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), delay);
    this.refreshStatus();
  }

  private enqueue(
    request: () => Promise<MoodboardMutation>,
    handlers: { onOffline?: () => void } = {},
  ): Promise<boolean> {
    this.busy++;
    this.refreshStatus();
    const run = this.queue.then(() => this.attempt(request, handlers));
    this.queue = run;
    return run.finally(() => {
      this.busy--;
      this.refreshStatus();
    });
  }

  private async attempt(
    request: () => Promise<MoodboardMutation>,
    handlers: { onOffline?: () => void },
  ): Promise<boolean> {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await request();
        if (!result.ok) {
          this.failure = "error";
          this.options.onError?.(result.error);
          return false;
        }
        if (this.failure === "offline") this.failure = null;
        if (result.version) this.version = Math.max(this.version, result.version);
        return true;
      } catch {
        if (attempt < this.retryDelays.length) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelays[attempt]));
          continue;
        }
        if (this.failure !== "error") this.failure = "offline";
        this.options.onError?.("offline");
        handlers.onOffline?.();
        return false;
      }
    }
  }

  private findBoard(id: string) {
    return this.state.boards.find((board) => board.id === id);
  }

  private findItem(id: string) {
    return this.state.items.find((item) => item.id === id);
  }

  private setBoards(boards: BoardRecord[]) {
    this.set({ boards: boards.sort(compareOrdered) });
  }

  private replaceItem(next: BoardItem) {
    this.set({ items: this.state.items.map((item) => (item.id === next.id ? next : item)) });
  }

  private refreshStatus() {
    const status: MoodboardSaveStatus =
      this.failure ?? (this.pending.size > 0 || this.busy > 0 ? "saving" : "saved");
    if (status !== this.state.status) this.set({ status });
  }

  private set(next: Partial<MoodboardState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }
}
