/**
 * Files attached to messages in the assistant's chat. They go from the browser straight to
 * the bucket, under `chat/<projectId>/`, and messages point at them by URL.
 */

const MB = 1024 * 1024;

/** How attachments are stored. Images are re-encoded in the browser and text is sent as UTF-8. */
export const ATTACHMENT_TYPES = ["image/webp", "image/jpeg", "application/pdf", "text/plain; charset=utf-8"] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

export const TEXT_ATTACHMENT_TYPE = "text/plain; charset=utf-8" satisfies AttachmentType;

/** The model's provider fetches images by URL only when the path ends in an image extension. */
const EXTENSIONS: Record<AttachmentType, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
  "text/plain; charset=utf-8": "txt",
};

export const ATTACHMENT_MAX_BYTES: Record<AttachmentType, number> = {
  // Anthropic turns down images over 5 MB.
  "image/webp": 5 * MB,
  "image/jpeg": 5 * MB,
  "application/pdf": 10 * MB,
  "text/plain; charset=utf-8": MB,
};

/** Longest edge of an attached image. Past 20 images in a request, Claude takes at most 2000 px. */
export const ATTACHMENT_IMAGE_EDGE = 2000;

export const MAX_ATTACHMENTS = 8;

export const ATTACHMENT_FILE_PATTERN = /^[A-Za-z0-9_-]{1,64}\.(?:webp|jpg|pdf|txt)$/;

export function isAttachmentType(value: unknown): value is AttachmentType {
  return (ATTACHMENT_TYPES as readonly unknown[]).includes(value);
}

/** The stored file's name: its ID and an extension for its type. */
export function attachmentFile(attachmentId: string, type: AttachmentType) {
  return `${attachmentId}.${EXTENSIONS[type]}`;
}

export function attachmentType(file: string): AttachmentType | null {
  const extension = file.slice(file.lastIndexOf(".") + 1);
  return ATTACHMENT_TYPES.find((type) => EXTENSIONS[type] === extension) ?? null;
}

/** What a message's file part points at. */
export function attachmentUrl(projectId: string, file: string) {
  return `/api/projects/${projectId}/ai/attachments/${file}`;
}

/** The stored file a message part points at, if it's one of this project's attachments. */
export function attachmentFileFromUrl(url: string, projectId: string) {
  const prefix = attachmentUrl(projectId, "");
  if (!url.startsWith(prefix)) return null;
  const file = url.slice(prefix.length);
  return ATTACHMENT_FILE_PATTERN.test(file) ? file : null;
}

export type AttachmentKind = "image" | "pdf" | "text";

/** Text formats writers use. Browsers often don't know their type. */
const TEXT_EXTENSIONS = ["txt", "text", "md", "markdown", "fountain", "spmd", "fdx", "csv", "tsv", "json", "xml", "html", "rtf"];

/** What a picked, pasted or dropped file would be sent as, or null if it can't be attached. */
export function attachmentKind(file: { name: string; type: string }): AttachmentKind | null {
  const dot = file.name.lastIndexOf(".");
  const extension = dot === -1 ? "" : file.name.slice(dot + 1).toLowerCase();
  if (file.type.startsWith("image/")) return file.type === "image/svg+xml" ? null : "image";
  if (file.type === "application/pdf" || extension === "pdf") return "pdf";
  if (file.type.startsWith("text/") || TEXT_EXTENSIONS.includes(extension)) return "text";
  return null;
}

/** For the file picker. */
export const ATTACHMENT_ACCEPT = ["image/*", "application/pdf", "text/*", ".pdf", ...TEXT_EXTENSIONS.map((extension) => `.${extension}`)].join(",");

export function kindOfType(mediaType: string): AttachmentKind {
  if (mediaType.startsWith("image/")) return "image";
  return mediaType === "application/pdf" ? "pdf" : "text";
}
