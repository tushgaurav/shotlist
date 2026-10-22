import type { FileUIPart, TextUIPart, UIMessage } from "ai";

import {
  ATTACHMENT_MAX_BYTES,
  attachmentFileFromUrl,
  attachmentType,
  TEXT_ATTACHMENT_TYPE,
  type AttachmentType,
} from "./attachments";

export type AttachmentStore = {
  /** Size and type of a stored file, or null once it's gone. */
  stat(file: string): Promise<{ size: number; contentType: string } | null>;
  /** The file's bytes, for text files. */
  read(file: string): Promise<Uint8Array | null>;
  /** A short-lived URL the model's provider can fetch the file from. */
  url(file: string): Promise<string>;
};

/** What one request sends at most. Older attachments past these are left out. */
export const REQUEST_MAX_ATTACHMENTS = 20;
export const REQUEST_MAX_ATTACHMENT_BYTES = 24 * 1024 * 1024;

type Replacement = FileUIPart | TextUIPart | null;

/**
 * Swaps the files attached in a conversation for what the model reads: images and PDFs become
 * URLs the provider fetches, text files become text. The newest get the room; past the limits,
 * or once a file is gone, the model gets a note instead. A file part that isn't one of this
 * project's attachments is never fetched, so the server only reads its own bucket.
 */
export async function resolveAttachments<M extends UIMessage>(
  messages: M[],
  projectId: string,
  store: AttachmentStore | null,
): Promise<M[]> {
  const replacements = new Map<string, Replacement>();
  const attached: { at: string; name: string | null; file: string }[] = [];

  for (let m = messages.length - 1; m >= 0; m--) {
    const message = messages[m];
    message.parts.forEach((part, p) => {
      if (part.type !== "file") return;
      const at = `${m}:${p}`;
      // Only the writer attaches files.
      if (message.role !== "user") return replacements.set(at, null);
      const name = safeName(part.filename);
      const file = attachmentFileFromUrl(part.url, projectId);
      if (file) attached.push({ at, name, file });
      else replacements.set(at, note(name, "but it couldn't be read"));
    });
  }
  if (replacements.size === 0 && attached.length === 0) return messages;

  const sent = attached.slice(0, REQUEST_MAX_ATTACHMENTS);
  for (const { at, name } of attached.slice(REQUEST_MAX_ATTACHMENTS)) replacements.set(at, leftOut(name));

  const stats = await Promise.all(sent.map(({ file }) => (store ? store.stat(file).catch(() => undefined) : null)));
  const included: { at: string; name: string | null; file: string; type: AttachmentType }[] = [];
  let bytes = 0;
  sent.forEach(({ at, name, file }, index) => {
    const stat = stats[index];
    const type = attachmentType(file);
    if (stat === null) return replacements.set(at, note(name, "but it's no longer available"));
    if (!stat || !type || stat.contentType !== type || stat.size > ATTACHMENT_MAX_BYTES[type]) {
      return replacements.set(at, note(name, "but it couldn't be read"));
    }
    if (bytes + stat.size > REQUEST_MAX_ATTACHMENT_BYTES) return replacements.set(at, leftOut(name));
    bytes += stat.size;
    included.push({ at, name, file, type });
  });

  await Promise.all(
    included.map(async ({ at, name, file, type }) => {
      if (!store) return;
      if (type !== TEXT_ATTACHMENT_TYPE) {
        replacements.set(at, { type: "file", mediaType: type, filename: name ?? undefined, url: await store.url(file) });
        return;
      }
      const data = await store.read(file).catch(() => null);
      replacements.set(
        at,
        data
          ? { type: "text", text: `<attachment name="${name ?? "file"}">\n${new TextDecoder().decode(data)}\n</attachment>` }
          : note(name, "but it couldn't be read"),
      );
    }),
  );

  return messages.map((message, m) => {
    if (!message.parts.some((part) => part.type === "file")) return message;
    const parts = message.parts.flatMap((part, p) => {
      const replacement = replacements.get(`${m}:${p}`);
      if (replacement === undefined) return [part];
      return replacement ? [replacement as M["parts"][number]] : [];
    });
    return { ...message, parts };
  });
}

/** The filename as the model sees it, safe inside quotes. */
function safeName(filename: string | undefined) {
  return filename?.replace(/[\u0000-\u001f\u007f"<>]/g, "").trim().slice(0, 120) || null;
}

function note(name: string | null, what: string): TextUIPart {
  return { type: "text", text: `(The writer attached ${name ? `"${name}"` : "a file"} ${what}.)` };
}

function leftOut(name: string | null) {
  return note(name, "earlier in the conversation; it's left out of this message to save room");
}
