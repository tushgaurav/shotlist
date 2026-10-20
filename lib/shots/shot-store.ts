import { nextSuffix, suffixAt } from "./numbering";
import { positionBetween } from "./positions";
import {
  compareShots,
  EMPTY_SHOT,
  type EditableShotField,
  type ShotListData,
  type ShotMutation,
  type ShotMutationError,
  type ShotPatch,
  type ShotRecord,
  type ShotScene,
} from "./types";

export type ShotSaveStatus = "saved" | "saving" | "offline" | "error";

const COPIED_FIELDS = [
  "description",
  "size",
  "shotType",
  "angle",
  "movement",
  "lens",
  "camera",
  "frameRate",
  "subjects",
  "equipment",
  "sound",
  "locationNote",
  "vfx",
  "estShootMinutes",
  "notes",
  "imageId",
] as const satisfies EditableShotField[];

export type ShotListState = Omit<ShotListData, "version"> & { status: ShotSaveStatus };

type Move = { id: string; sceneId: string | null; position: string };

export type ShotApi = {
  /** Null when there's nothing to take, e.g. after signing out. */
  load(): Promise<ShotListData | null>;
  create(input: Move): Promise<ShotMutation<{ suffix: string | null }>>;
  update(changes: { id: string; patch: ShotPatch }[]): Promise<ShotMutation>;
  move(input: Move): Promise<ShotMutation<{ suffix: string | null }>>;
  remove(id: string): Promise<ShotMutation>;
  restore(id: string): Promise<ShotMutation<{ suffix: string | null }>>;
  renumber(sceneId: string): Promise<ShotMutation<{ suffixes: Record<string, string> }>>;
  markReviewed(sceneId: string): Promise<ShotMutation>;
};

export type ShotStoreOptions = {
  createId: () => string;
  onError?: (error: ShotMutationError | "offline") => void;
  /** Cell edits are batched into one request this long after the last change. */
  flushMs?: number;
  /** Delays between retries of a request that couldn't reach the server. */
  retryDelays?: number[];
  /** How long to wait before trying edits again once retries ran out. */
  offlineRetryMs?: number;
};

/**
 * The shot list's client state. Every change applies locally first, then goes to the server
 * through one queue, so requests land in the order they were made even when retried.
 */
export class ShotStore {
  private state: ShotListState;
  private listeners = new Set<() => void>();
  private pending = new Map<string, ShotPatch>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private busy = 0;
  private failure: "offline" | "error" | null = null;
  private received = new WeakSet<ShotListData>();
  private syncing = false;
  private syncAgain = false;
  /** The newest server version this store has seen, from loaded data or its own saves. */
  private version: number;
  private readonly flushMs: number;
  private readonly retryDelays: number[];
  private readonly offlineRetryMs: number;

  constructor(
    private readonly api: ShotApi,
    data: ShotListData,
    private readonly options: ShotStoreOptions,
  ) {
    this.received.add(data);
    this.version = data.version;
    this.state = { scenes: data.scenes, shots: data.shots, status: "saved" };
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
   * Takes fresh server data, e.g. after editing the script. Data it already took is ignored:
   * pages hand back what they were rendered with each time they're shown.
   * Local work wins: shots are only replaced when nothing is waiting to save and the data
   * isn't older than a change this store already saved (it may have been loaded mid-save).
   */
  receive(data: ShotListData) {
    if (this.received.has(data)) return;
    this.received.add(data);
    if (!this.hasUnsavedChanges && data.version >= this.version) {
      this.version = data.version;
      this.set({ scenes: data.scenes, shots: data.shots });
      return;
    }
    const local = new Map(this.state.scenes.map((scene) => [scene.id, scene]));
    this.set({
      scenes: data.scenes.map((scene) => {
        const current = local.get(scene.id);
        return current ? { ...scene, reviewedHash: current.reviewedHash } : scene;
      }),
    });
  }

  /**
   * Loads the latest data in the background and takes it in (see receive). Called while a
   * load is running, it loads again afterwards so nothing saved in between is missed.
   * A failed load changes nothing; the next one catches up.
   */
  sync() {
    if (this.syncing) {
      this.syncAgain = true;
      return;
    }
    this.syncing = true;
    // After the queued requests, so the data includes them.
    void this.queue
      .then(() => this.api.load())
      .then(
        (data) => {
          if (data) this.receive(data);
        },
        () => {},
      )
      .finally(() => {
        this.syncing = false;
        if (this.syncAgain) {
          this.syncAgain = false;
          this.sync();
        }
      });
  }

  shotsIn(sceneId: string | null) {
    return this.state.shots.filter((shot) => shot.sceneId === sceneId);
  }

  update(id: string, patch: ShotPatch) {
    const shot = this.find(id);
    if (!shot) return;
    this.replaceShot({ ...shot, ...patch });
    this.reviewLocally(shot.sceneId);
    this.pending.set(id, { ...this.pending.get(id), ...patch });
    this.scheduleFlush();
  }

  /** Adds a shot at the end of a group, or right after `afterId`. Returns the new ID. */
  add(sceneId: string | null, options: { afterId?: string; values?: ShotPatch } = {}) {
    const siblings = this.shotsIn(sceneId);
    const index = options.afterId
      ? siblings.findIndex((shot) => shot.id === options.afterId) + 1
      : siblings.length;
    const position = positionBetween(
      siblings[index - 1]?.position ?? null,
      siblings[index]?.position ?? null,
    );
    const id = this.options.createId();
    const suffix = sceneId ? nextSuffix(siblings.map((shot) => shot.suffix)) : null;

    this.set({
      shots: [...this.state.shots, { ...EMPTY_SHOT, ...options.values, id, sceneId, position, suffix }].sort(
        compareShots,
      ),
    });
    this.reviewLocally(sceneId);

    void this.enqueue(() => this.api.create({ id, sceneId, position })).then((result) => {
      if (result) this.applySuffix(id, sceneId, result.suffix);
    });
    if (options.values && Object.keys(options.values).length > 0) {
      this.pending.set(id, { ...options.values });
      this.scheduleFlush();
    }
    return id;
  }

  /** A copy right below the original, with a new label and status back to planned. */
  duplicate(id: string) {
    const shot = this.find(id);
    if (!shot) return null;
    const values = Object.fromEntries(COPIED_FIELDS.map((field) => [field, shot[field]])) as ShotPatch;
    return this.add(shot.sceneId, { afterId: id, values });
  }

  /** Moves a shot before `beforeId` in a group, or to its end when `beforeId` is null. */
  move(id: string, sceneId: string | null, beforeId: string | null) {
    const shot = this.find(id);
    if (!shot || beforeId === id) return;

    const group = this.shotsIn(sceneId);
    if (shot.sceneId === sceneId) {
      const next = group[group.findIndex((s) => s.id === id) + 1];
      if ((next?.id ?? null) === beforeId) return;
    }

    const siblings = group.filter((s) => s.id !== id);
    const index = beforeId ? siblings.findIndex((s) => s.id === beforeId) : siblings.length;
    if (index < 0) return;
    const position = positionBetween(
      siblings[index - 1]?.position ?? null,
      siblings[index]?.position ?? null,
    );
    const suffix =
      shot.sceneId === sceneId
        ? shot.suffix
        : sceneId
          ? nextSuffix(siblings.map((s) => s.suffix))
          : null;

    this.set({
      shots: this.state.shots
        .map((s) => (s.id === id ? { ...s, sceneId, position, suffix } : s))
        .sort(compareShots),
    });
    this.reviewLocally(sceneId);

    void this.enqueue(() => this.api.move({ id, sceneId, position })).then((result) => {
      if (result) this.applySuffix(id, sceneId, result.suffix);
    });
  }

  /** One step up or down within the shot's group. */
  nudge(id: string, direction: -1 | 1) {
    const shot = this.find(id);
    if (!shot) return;
    const group = this.shotsIn(shot.sceneId);
    const index = group.findIndex((s) => s.id === id);
    if (direction === -1 && index > 0) this.move(id, shot.sceneId, group[index - 1].id);
    if (direction === 1 && index < group.length - 1) {
      this.move(id, shot.sceneId, group[index + 2]?.id ?? null);
    }
  }

  /** Returns the removed shot so it can be restored. */
  remove(id: string) {
    const shot = this.find(id);
    if (!shot) return null;
    // Save waiting edits first so a restore brings the shot back as it was.
    this.flush();
    this.set({ shots: this.state.shots.filter((s) => s.id !== id) });
    void this.enqueue(() => this.api.remove(id));
    return shot;
  }

  restore(shot: ShotRecord) {
    if (this.find(shot.id)) return;
    this.set({ shots: [...this.state.shots, shot].sort(compareShots) });
    void this.enqueue(() => this.api.restore(shot.id)).then((result) => {
      if (result) this.applySuffix(shot.id, shot.sceneId, result.suffix);
    });
  }

  renumber(sceneId: string) {
    const suffixes = new Map(this.shotsIn(sceneId).map((shot, index) => [shot.id, suffixAt(index)]));
    this.set({
      shots: this.state.shots.map((shot) =>
        suffixes.has(shot.id) ? { ...shot, suffix: suffixes.get(shot.id)! } : shot,
      ),
    });
    void this.enqueue(() => this.api.renumber(sceneId)).then((result) => {
      if (!result) return;
      this.set({
        shots: this.state.shots.map((shot) =>
          shot.id in result.suffixes ? { ...shot, suffix: result.suffixes[shot.id] } : shot,
        ),
      });
    });
  }

  markReviewed(sceneId: string) {
    this.reviewLocally(sceneId);
    void this.enqueue(() => this.api.markReviewed(sceneId));
  }

  /** Sends batched edits now, e.g. when a cell loses focus or the page is hidden. */
  flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.pending.size === 0) return;

    const changes = [...this.pending].map(([id, patch]) => ({ id, patch }));
    this.pending.clear();
    void this.enqueue(() => this.api.update(changes), {
      onOffline: () => {
        for (const { id, patch } of changes) {
          if (this.find(id)) this.pending.set(id, { ...patch, ...this.pending.get(id) });
        }
        this.scheduleFlush(this.offlineRetryMs);
      },
    });
    this.refreshStatus();
  }

  private scheduleFlush(delay = this.flushMs) {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), delay);
    this.refreshStatus();
  }

  private enqueue<T extends object>(
    request: () => Promise<ShotMutation<T>>,
    handlers: { onOffline?: () => void } = {},
  ): Promise<({ ok: true } & T) | null> {
    this.busy++;
    this.refreshStatus();
    const run = this.queue.then(() => this.attempt(request, handlers));
    this.queue = run;
    return run.finally(() => {
      this.busy--;
      this.refreshStatus();
    });
  }

  private async attempt<T extends object>(
    request: () => Promise<ShotMutation<T>>,
    handlers: { onOffline?: () => void },
  ): Promise<({ ok: true } & T) | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await request();
        if (!result.ok) {
          this.failure = "error";
          this.options.onError?.(result.error);
          return null;
        }
        if (this.failure === "offline") this.failure = null;
        if (result.version) this.version = Math.max(this.version, result.version);
        return result;
      } catch {
        if (attempt < this.retryDelays.length) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelays[attempt]));
          continue;
        }
        if (this.failure !== "error") this.failure = "offline";
        this.options.onError?.("offline");
        handlers.onOffline?.();
        return null;
      }
    }
  }

  private find(id: string) {
    return this.state.shots.find((shot) => shot.id === id);
  }

  private replaceShot(next: ShotRecord) {
    this.set({ shots: this.state.shots.map((shot) => (shot.id === next.id ? next : shot)) });
  }

  /** Server labels win, unless the shot has since moved somewhere else. */
  private applySuffix(id: string, sceneId: string | null, suffix: string | null) {
    const shot = this.find(id);
    if (shot && shot.sceneId === sceneId && shot.suffix !== suffix) this.replaceShot({ ...shot, suffix });
  }

  private reviewLocally(sceneId: string | null) {
    if (!sceneId) return;
    const scene = this.state.scenes.find((s) => s.id === sceneId);
    if (!scene || scene.reviewedHash === scene.contentHash) return;
    this.set({
      scenes: this.state.scenes.map((s): ShotScene =>
        s.id === sceneId ? { ...s, reviewedHash: s.contentHash } : s,
      ),
    });
  }

  private refreshStatus() {
    const status: ShotSaveStatus =
      this.failure ?? (this.pending.size > 0 || this.busy > 0 ? "saving" : "saved");
    if (status !== this.state.status) this.set({ status });
  }

  private set(next: Partial<ShotListState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }
}
