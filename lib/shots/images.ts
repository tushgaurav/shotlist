import type { ShotMutationError } from "./types";

export const IMAGE_TYPES = ["image/webp", "image/jpeg"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** Every image is stored twice: a large copy for viewing and a small one for lists and cards. */
export const IMAGE_VARIANTS = ["full", "thumb"] as const;
export type ImageVariant = (typeof IMAGE_VARIANTS)[number];

/** Longest edge in pixels. */
export const VARIANT_MAX_EDGE: Record<ImageVariant, number> = { full: 2048, thumb: 640 };
export const VARIANT_MAX_BYTES: Record<ImageVariant, number> = {
  full: 8 * 1024 * 1024,
  thumb: 1024 * 1024,
};

/** Larger files aren't decoded in the browser at all. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 20_000;

export function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function assetUrl(assetId: string, variant: ImageVariant) {
  return `/api/assets/${assetId}/${variant}`;
}

/** Both stored copies, re-encoded in the browser. */
export type PreparedImage = {
  contentType: ImageType;
  /** Size of the full copy. */
  width: number;
  height: number;
  full: Blob;
  thumb: Blob;
};

/** A presigned POST: send `fields`, then the file, to `url`. */
export type UploadForm = { url: string; fields: Record<string, string> };

export type UploadError = ShotMutationError | "unavailable";
export type UploadResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: UploadError };
