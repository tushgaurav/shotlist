"use client";

import type { FileUIPart } from "ai";
import { cn } from "cn";
import { FileTextIcon, LoaderCircleIcon, XIcon } from "lucide-react";

import { kindOfType, type AttachmentKind } from "@/lib/ai/attachments";

import type { PendingAttachment } from "./use-attachments";

const KIND_LABELS: Record<AttachmentKind, string> = { image: "Image", pdf: "PDF", text: "Text" };

function Tile({ name, kind, src, busy, large }: { name: string; kind: AttachmentKind; src: string | null; busy?: boolean; large?: boolean }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-lg border bg-muted",
        kind === "image" ? (large ? "h-28 max-w-48" : "size-14") : "h-14 w-44 items-center gap-2 px-2",
      )}
    >
      {kind === "image" && src ? (
        // eslint-disable-next-line @next/next/no-img-element -- served through an authenticated redirect, which the image optimizer can't follow
        <img src={src} alt={name} draggable={false} decoding="async" className={cn("object-cover", large ? "h-full w-auto" : "size-full")} />
      ) : (
        <>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
            <FileTextIcon className="size-4" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col text-left">
            <span className="truncate text-xs font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">{KIND_LABELS[kind]}</span>
          </span>
        </>
      )}
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center bg-background/60">
          <LoaderCircleIcon className="size-4 animate-spin text-foreground" aria-hidden />
          <span className="sr-only">Uploading {name}</span>
        </span>
      )}
    </span>
  );
}

/** Files waiting in the composer. Each can be removed until the message is sent. */
export function AttachmentTray({ items, onRemove }: { items: PendingAttachment[]; onRemove: (key: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label="Attachments" className="flex flex-wrap gap-2 px-2.5 pt-2.5">
      {items.map((item) => (
        <li key={item.key} className="group/attachment relative" title={item.name} aria-busy={!item.part || undefined}>
          <Tile name={item.name} kind={item.kind} src={item.preview} busy={!item.part} />
          <button
            type="button"
            aria-label={`Remove ${item.name}`}
            onClick={() => onRemove(item.key)}
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-opacity outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/attachment:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
          >
            <XIcon className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The files sent with a message. Each opens in a new tab. */
export function MessageAttachments({ parts, previewFor }: { parts: FileUIPart[]; previewFor: (url: string) => string | undefined }) {
  return (
    <div className="ml-8 flex flex-wrap justify-end gap-1.5">
      {parts.map((part, index) => {
        const kind = kindOfType(part.mediaType);
        const name = part.filename ?? KIND_LABELS[kind];
        return (
          <a
            key={`${part.url}-${index}`}
            href={part.url}
            target="_blank"
            rel="noreferrer"
            title={name}
            className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1"
          >
            <Tile name={name} kind={kind} src={previewFor(part.url) ?? part.url} large />
          </a>
        );
      })}
    </div>
  );
}
