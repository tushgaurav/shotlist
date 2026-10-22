import {
  checkImageFile,
  sendImage,
  type ImageUploadApi,
  type ImageUploadError,
  type ImageUploaderOptions,
} from "../shots/image-uploader";
import type { PreparedImage } from "../shots/images";
import type { MoodboardStore } from "./board-store";

/** An image on its way to a board. It becomes an item with the same ID once it's stored. */
export type BoardUpload = {
  id: string;
  boardId: string;
  position: string;
  /** Null until the image is decoded, which is also when its size is known. */
  preview: string | null;
  width: number | null;
  height: number | null;
};

export type BoardUploaderOptions = ImageUploaderOptions & { createId: () => string };

/**
 * Uploads images onto boards: resize in the browser, upload both copies straight to the
 * bucket, confirm with the server, then add the item through the store. Until then the board
 * shows a placeholder, then a local preview, where the item will be.
 */
export class BoardUploader {
  private uploads: readonly BoardUpload[] = [];
  /** Asset ID → preview URL, so a just-uploaded image doesn't flash while loading from S3. */
  private previews = new Map<string, string>();
  private listeners = new Set<() => void>();
  private decoding: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly api: ImageUploadApi,
    private readonly store: MoodboardStore,
    private readonly options: BoardUploaderOptions,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.uploads;

  get busy() {
    return this.uploads.length > 0;
  }

  previewFor(assetId: string) {
    return this.previews.get(assetId);
  }

  /** Uploads images onto a board before `beforeId`, or at its end. Resolves once all are done. */
  async add(boardId: string, files: Blob[], beforeId: string | null = null) {
    const usable: Blob[] = [];
    for (const file of files) {
      const problem = checkImageFile(file);
      if (problem) this.fail(problem);
      else usable.push(file);
    }
    if (usable.length === 0) return;

    const positions = this.store.positionsFor(boardId, beforeId, usable.length);
    const added = usable.map((file, index) => ({
      file,
      upload: {
        id: this.options.createId(),
        boardId,
        position: positions[index],
        preview: null,
        width: null,
        height: null,
      } satisfies BoardUpload,
    }));
    this.setUploads([...this.uploads, ...added.map(({ upload }) => upload)]);
    await Promise.all(added.map(({ file, upload }) => this.run(upload, file)));
  }

  private async run(upload: BoardUpload, file: Blob) {
    // One at a time: decoding a batch of large photos at once takes a lot of memory.
    const decoded = this.decoding.then(() => this.options.prepare(file));
    this.decoding = decoded.catch(() => {});

    let image: PreparedImage;
    try {
      image = await decoded;
    } catch (error) {
      this.drop(upload.id);
      return this.fail(this.options.isTooLarge?.(error) ? "too_large" : "unreadable");
    }

    const preview = this.options.createPreview(image.thumb);
    this.setUploads(
      this.uploads.map((u) =>
        u.id === upload.id ? { ...u, preview, width: image.width, height: image.height } : u,
      ),
    );
    let kept = false;
    try {
      const sent = await sendImage(this.api, image);
      if (!sent.ok) return this.fail(sent.error);

      const id = this.store.addItem(
        upload.boardId,
        {
          kind: "image",
          wide: false,
          assetId: sent.assetId,
          caption: null,
          content: null,
          width: image.width,
          height: image.height,
        },
        { position: upload.position },
        upload.id,
      );
      // The board may have been deleted meanwhile.
      if (id) {
        this.previews.set(sent.assetId, preview);
        kept = true;
      }
    } finally {
      this.drop(upload.id);
      if (!kept) this.options.revokePreview(preview);
    }
  }

  private fail(error: ImageUploadError) {
    this.options.onError?.(error);
  }

  private drop(id: string) {
    this.setUploads(this.uploads.filter((upload) => upload.id !== id));
  }

  private setUploads(next: readonly BoardUpload[]) {
    this.uploads = next;
    for (const listener of this.listeners) listener();
  }
}
