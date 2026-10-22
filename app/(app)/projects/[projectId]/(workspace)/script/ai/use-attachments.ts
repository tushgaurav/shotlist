"use client";

import type { FileUIPart } from "ai";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  ATTACHMENT_MAX_BYTES,
  attachmentKind,
  MAX_ATTACHMENTS,
  TEXT_ATTACHMENT_TYPE,
  type AttachmentKind,
  type AttachmentType,
} from "@/lib/ai/attachments";
import { ImageTooLargeError, prepareAttachmentImage } from "@/lib/images/prepare";
import { IMAGE_ERRORS, sendForm } from "@/lib/images/upload";
import { MAX_SOURCE_BYTES, type UploadError } from "@/lib/shots/images";

import { startAttachmentUploadAction } from "./actions";

/** A file in the composer, waiting to be sent with the next message. */
export type PendingAttachment = {
  key: string;
  name: string;
  kind: AttachmentKind;
  /** A local copy of an image, shown while it uploads and after it's sent. */
  preview: string | null;
  /** Set once the file is in the bucket. */
  part: FileUIPart | null;
};

type AttachmentError = UploadError | "offline" | "rejected" | "unsupported" | "too_large" | "unreadable" | "too_many";

const UNAVAILABLE = "File uploads aren't set up on this server yet.";

function errorMessage(error: AttachmentError, kind: AttachmentKind | null) {
  switch (error) {
    case "unsupported":
      return "Attach images, PDFs or text files.";
    case "too_many":
      return `Attach up to ${MAX_ATTACHMENTS} files to a message.`;
    case "too_large":
      if (kind === "pdf") return "That PDF is too large. Use one under 10 MB.";
      if (kind === "text") return "That text file is too large. Use one under 1 MB.";
      return IMAGE_ERRORS.too_large;
    case "unreadable":
      return kind === "image" ? IMAGE_ERRORS.unreadable : "That file couldn't be read.";
    case "unavailable":
      return UNAVAILABLE;
    case "unauthorized":
      return "You've been signed out. Sign in again to attach files.";
    case "offline":
      return IMAGE_ERRORS.offline;
    default:
      return "The file couldn't be uploaded. Try again.";
  }
}

/** Gets a file ready the way it's stored, then posts it straight to the bucket. */
async function upload(projectId: string, file: File, kind: AttachmentKind): Promise<FileUIPart | AttachmentError> {
  let contentType: AttachmentType;
  let blob: Blob;
  if (kind === "image") {
    if (file.size > MAX_SOURCE_BYTES) return "too_large";
    try {
      ({ contentType, blob } = await prepareAttachmentImage(file));
    } catch (error) {
      return error instanceof ImageTooLargeError ? "too_large" : "unreadable";
    }
  } else if (kind === "pdf") {
    contentType = "application/pdf";
    blob = file;
  } else {
    contentType = TEXT_ATTACHMENT_TYPE;
    if (file.size > ATTACHMENT_MAX_BYTES[contentType]) return "too_large";
    try {
      blob = new Blob([await file.text()], { type: contentType });
    } catch {
      return "unreadable";
    }
  }
  if (blob.size > ATTACHMENT_MAX_BYTES[contentType]) return "too_large";

  try {
    const started = await startAttachmentUploadAction(projectId, contentType);
    if (!started.ok) return started.error;
    if (!(await sendForm(started.form, blob))) return "rejected";
    return { type: "file", mediaType: contentType, filename: file.name || undefined, url: started.url };
  } catch {
    return "offline";
  }
}

let keys = 0;

/** Files picked, pasted or dropped into the assistant's composer, uploading as soon as they're added. */
export function useAttachments(projectId: string, enabled: boolean) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  /** Keys still in the composer, so an upload that finishes after its file was removed is dropped. */
  const pending = useRef(new Set<string>());
  /** Every local image copy, freed when the chat closes. */
  const previews = useRef(new Set<string>());
  /** Sent images' local copies by URL, so they don't load again from the bucket. */
  const [sent] = useState(() => new Map<string, string>());

  useEffect(() => {
    const created = previews.current;
    return () => {
      for (const url of created) URL.revokeObjectURL(url);
      created.clear();
    };
  }, []);

  const revoke = (url: string | null) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    previews.current.delete(url);
  };

  /** False, and says why, when uploads aren't set up. */
  const require = () => {
    if (!enabled) toast.error(UNAVAILABLE, { id: "attachment-error" });
    return enabled;
  };

  const add = (files: File[]) => {
    if (files.length === 0 || !require()) return;
    let room = MAX_ATTACHMENTS - items.length;
    for (const file of files) {
      const kind = attachmentKind(file);
      if (!kind) {
        toast.error(errorMessage("unsupported", null), { description: file.name });
        continue;
      }
      if (room-- <= 0) {
        toast.error(errorMessage("too_many", null), { id: "attachment-too-many" });
        break;
      }

      const key = String(++keys);
      const preview = kind === "image" ? URL.createObjectURL(file) : null;
      if (preview) previews.current.add(preview);
      pending.current.add(key);
      setItems((list) => [...list, { key, name: file.name, kind, preview, part: null }]);

      void upload(projectId, file, kind).then((result) => {
        if (!pending.current.has(key)) return;
        if (typeof result === "string") {
          pending.current.delete(key);
          setItems((list) => list.filter((item) => item.key !== key));
          revoke(preview);
          toast.error(errorMessage(result, kind), { description: file.name });
        } else {
          setItems((list) => list.map((item) => (item.key === key ? { ...item, part: result } : item)));
        }
      });
    }
  };

  const remove = (key: string) => {
    pending.current.delete(key);
    setItems((list) => list.filter((item) => item.key !== key));
    revoke(items.find((item) => item.key === key)?.preview ?? null);
  };

  /** Empties the composer and returns the uploaded files, to send with a message. */
  const take = () => {
    const parts: FileUIPart[] = [];
    for (const item of items) {
      if (!item.part) continue;
      parts.push(item.part);
      if (item.preview) sent.set(item.part.url, item.preview);
    }
    pending.current.clear();
    setItems([]);
    return parts;
  };

  return {
    items,
    uploading: items.some((item) => !item.part),
    ready: items.some((item) => item.part),
    require,
    add,
    remove,
    take,
    previewFor: (url: string) => sent.get(url),
  };
}

export type Attachments = ReturnType<typeof useAttachments>;
