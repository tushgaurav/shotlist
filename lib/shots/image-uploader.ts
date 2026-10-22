import {
  MAX_SOURCE_BYTES,
  type ImageType,
  type ImageVariant,
  type PreparedImage,
  type UploadError,
  type UploadForm,
  type UploadResult,
} from "./images";
import type { ShotStore } from "./shot-store";

export type ImageUploadApi = {
  start(
    contentType: ImageType,
  ): Promise<UploadResult<{ assetId: string; forms: Record<ImageVariant, UploadForm> }>>;
  /** Sends one file with its upload form; resolves false if the bucket refused it. */
  send(form: UploadForm, file: Blob): Promise<boolean>;
  confirm(input: { assetId: string; contentType: ImageType; width: number; height: number }): Promise<UploadResult>;
};

export type ImageUploadError =
  | UploadError
  | "offline"
  | "rejected"
  | "not_image"
  | "too_large"
  | "unreadable";

export type ImageUploaderOptions = {
  prepare: (file: Blob) => Promise<PreparedImage>;
  /** Errors thrown by `prepare` that mean the image is too big rather than unreadable. */
  isTooLarge?: (error: unknown) => boolean;
  onError?: (error: ImageUploadError) => void;
  createPreview: (blob: Blob) => string;
  revokePreview: (url: string) => void;
};

/** Why a file can't be used as an image, before trying to decode it; null if it may be one. */
export function checkImageFile(file: Blob): ImageUploadError | null {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return "not_image";
  if (file.size > MAX_SOURCE_BYTES) return "too_large";
  return null;
}

/** Uploads both copies of a prepared image straight to the bucket, then confirms them with the server. */
export async function sendImage(
  api: ImageUploadApi,
  image: PreparedImage,
): Promise<{ ok: true; assetId: string } | { ok: false; error: ImageUploadError }> {
  try {
    const started = await api.start(image.contentType);
    if (!started.ok) return started;

    const sent = await Promise.all([
      api.send(started.forms.full, image.full),
      api.send(started.forms.thumb, image.thumb),
    ]);
    if (!sent.every(Boolean)) return { ok: false, error: "rejected" };

    const confirmed = await api.confirm({
      assetId: started.assetId,
      contentType: image.contentType,
      width: image.width,
      height: image.height,
    });
    return confirmed.ok ? { ok: true, assetId: started.assetId } : confirmed;
  } catch {
    return { ok: false, error: "offline" };
  }
}

/**
 * Uploads shot images: resize in the browser, upload both copies straight to the bucket,
 * confirm with the server, then set the shot's image through the shot store.
 * While that runs, the shot shows a local preview.
 */
export class ImageUploader {
  /** Shot ID → preview URL, for uploads in progress. */
  private uploads: ReadonlyMap<string, string> = new Map();
  /** Asset ID → preview URL, so a just-uploaded image doesn't flash while loading from S3. */
  private previews = new Map<string, string>();
  private listeners = new Set<() => void>();

  constructor(
    private readonly api: ImageUploadApi,
    private readonly store: ShotStore,
    private readonly options: ImageUploaderOptions,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.uploads;

  get busy() {
    return this.uploads.size > 0;
  }

  previewFor(assetId: string) {
    return this.previews.get(assetId);
  }

  /** Resolves once the upload finished or failed. A second upload to the same shot is ignored meanwhile. */
  async upload(shotId: string, file: Blob) {
    if (this.uploads.has(shotId)) return;
    const unusable = checkImageFile(file);
    if (unusable) return this.fail(unusable);

    let image: PreparedImage;
    try {
      image = await this.options.prepare(file);
    } catch (error) {
      return this.fail(this.options.isTooLarge?.(error) ? "too_large" : "unreadable");
    }

    const preview = this.options.createPreview(image.thumb);
    this.setUpload(shotId, preview);
    let kept = false;
    try {
      const sent = await sendImage(this.api, image);
      if (!sent.ok) return this.fail(sent.error);

      this.previews.set(sent.assetId, preview);
      kept = true;
      this.store.update(shotId, { imageId: sent.assetId });
    } finally {
      this.setUpload(shotId, null);
      if (!kept) this.options.revokePreview(preview);
    }
  }

  private fail(error: ImageUploadError) {
    this.options.onError?.(error);
  }

  private setUpload(shotId: string, preview: string | null) {
    const next = new Map(this.uploads);
    if (preview) next.set(shotId, preview);
    else next.delete(shotId);
    this.uploads = next;
    for (const listener of this.listeners) listener();
  }
}
