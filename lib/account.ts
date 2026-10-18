import type { ImageType } from "./shots/images";

export const NAME_MAX_LENGTH = 100;

/** Better Auth's own limits for email and password sign-in. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Profile photos are cropped square and stored at most this many pixels wide. */
export const AVATAR_SIZE = 512;
export const AVATAR_MAX_BYTES = 1024 * 1024;

export const AVATAR_FILE_PATTERN = /^[A-Za-z0-9_-]{1,64}\.(?:webp|jpg)$/;

export function avatarFile(avatarId: string, contentType: ImageType) {
  return `${avatarId}.${contentType === "image/webp" ? "webp" : "jpg"}`;
}

/** What's stored as the user's `image`. */
export function avatarUrl(userId: string, file: string) {
  return `/api/avatars/${userId}/${file}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0];
  return (letters ?? "?").toUpperCase();
}
