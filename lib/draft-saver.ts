export type SaveStatus = "saved" | "saving" | "offline" | "error" | "conflict";

export type DraftBackup = { baseRevision: number; draft: unknown; savedAt: number };

type Options = {
  /** Where to PUT `{ revision, draft }`. Answers with the new revision, or 409 if it's stale. */
  url: string;
  /** Where unsaved changes are kept in localStorage. */
  backupKey: string;
  revision: number;
  onStatusChange: (status: SaveStatus) => void;
  debounceMs?: number;
  retryMs?: number;
  fetch?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
};

/**
 * Autosaves the working draft: debounced, one request at a time, retried when offline.
 * Unsaved changes are mirrored to localStorage until the server has them. A 409 means
 * another tab saved first; saving stops until the page is reloaded.
 */
export class DraftSaver {
  private revision: number;
  private getDraft: () => unknown = () => null;
  private dirty = false;
  private inFlight: Promise<void> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private backupTimer: ReturnType<typeof setTimeout> | undefined;
  private status: SaveStatus = "saved";

  constructor(private readonly options: Options) {
    this.revision = options.revision;
  }

  get hasUnsavedChanges() {
    return this.dirty || this.inFlight !== null;
  }

  get currentStatus() {
    return this.status;
  }

  /** The revision the server last confirmed; 0 if nothing has been saved yet. */
  get currentRevision() {
    return this.revision;
  }

  /** Call after every document change with a function that serializes the new document. */
  change(getDraft: () => unknown) {
    if (this.status === "conflict") return;
    this.getDraft = getDraft;
    this.dirty = true;
    if (this.status === "saved") this.setStatus("saving");
    clearTimeout(this.backupTimer);
    this.backupTimer = setTimeout(() => this.writeBackup(), 300);
    this.schedule(this.options.debounceMs ?? 1500);
  }

  /** Saves right away, e.g. when leaving the page. */
  flush() {
    clearTimeout(this.saveTimer);
    if (this.dirty) this.writeBackup();
    return this.save();
  }

  /**
   * Resolves once everything typed so far has reached the server, or saving failed.
   * flush() alone can return a save that was already running when more was typed.
   */
  async settle() {
    await this.flush();
    if (this.dirty && this.status === "saving") await this.flush();
  }

  /**
   * Stops saving and forgets unsaved changes and their backup, e.g. once the document is
   * deleted. A save already in flight still finishes; settle() first to wait for it.
   */
  discard() {
    clearTimeout(this.saveTimer);
    clearTimeout(this.backupTimer);
    this.dirty = false;
    this.options.storage?.removeItem(this.options.backupKey);
  }

  private schedule(delay: number) {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), delay);
  }

  private async save(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!this.dirty || this.status === "conflict") return;

    this.dirty = false;
    const draft = this.getDraft();
    this.setStatus("saving");
    this.inFlight = this.send(draft).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async send(draft: unknown) {
    const fetchFn = this.options.fetch ?? fetch;
    let response: Response;
    try {
      response = await fetchFn(this.options.url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: this.revision, draft }),
      });
    } catch {
      return this.failed("offline");
    }

    if (response.status === 409) {
      clearTimeout(this.saveTimer);
      this.writeBackup();
      this.setStatus("conflict");
      return;
    }
    if (!response.ok) return this.failed("error");

    const result = (await response.json()) as { revision: number };
    this.revision = result.revision;

    if (this.dirty) {
      // Re-base the backup on the revision we just saved, so a crash now loses nothing.
      this.writeBackup();
      this.setStatus("saving");
      this.schedule(this.options.debounceMs ?? 1500);
    } else {
      clearTimeout(this.backupTimer);
      this.options.storage?.removeItem(this.options.backupKey);
      this.setStatus("saved");
    }
  }

  private failed(status: "offline" | "error") {
    this.dirty = true;
    this.writeBackup();
    this.setStatus(status);
    this.schedule(this.options.retryMs ?? 5000);
  }

  private writeBackup() {
    const draft = this.getDraft();
    const backup: DraftBackup = { baseRevision: this.revision, draft, savedAt: Date.now() };
    try {
      this.options.storage?.setItem(this.options.backupKey, JSON.stringify(backup));
    } catch {
      // Storage full or unavailable; the server copy is all we have.
    }
  }

  private setStatus(status: SaveStatus) {
    if (status === this.status) return;
    this.status = status;
    this.options.onStatusChange(status);
  }
}

export function readBackup(key: string, storage: Pick<Storage, "getItem"> | null): DraftBackup | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const backup = JSON.parse(raw) as DraftBackup;
    return typeof backup.baseRevision === "number" && backup.draft ? backup : null;
  } catch {
    return null;
  }
}
