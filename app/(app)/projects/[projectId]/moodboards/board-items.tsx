"use client";

import { cn } from "cn";
import {
  CaptionsIcon,
  ClapperboardIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FolderInputIcon,
  GripVerticalIcon,
  LinkIcon,
  LoaderCircleIcon,
  PanelTopIcon,
  PencilIcon,
  PipetteIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import { memo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  paletteContent,
  TEXT_STYLE_LABELS,
  TEXT_STYLES,
  textContent,
  videoContent,
  type BoardItem,
  type TextStyle,
} from "@/lib/moodboards/types";
import type { BoardUpload } from "@/lib/moodboards/uploads";
import { PROVIDER_NAMES, siteName, videoAspect } from "@/lib/moodboards/video-links";
import { assetUrl, fitWithin, VARIANT_MAX_EDGE } from "@/lib/shots/images";

import { useBoardActions } from "./context";

const TEXT_STYLE_CLASSES: Record<TextStyle, string> = {
  title: "text-3xl leading-tight font-semibold tracking-tight",
  heading: "text-xl leading-snug font-semibold",
  body: "text-sm leading-6",
  quote: "border-l-2 border-foreground/25 pl-3 text-base leading-7 text-muted-foreground italic",
};

const TEXT_PLACEHOLDERS: Record<TextStyle, string> = {
  title: "Title",
  heading: "Heading",
  body: "Write something",
  quote: "A line that sets the mood",
};

const KIND_LABELS: Record<BoardItem["kind"], string> = {
  image: "image",
  text: "text",
  palette: "palette",
  video_link: "link",
};

/** How an item is named to screen readers and in toasts. */
export function itemName(item: BoardItem) {
  const text = textContent(item);
  if (text) return text.text.trim() ? `text “${text.text.trim().slice(0, 40)}”` : "text";
  const video = videoContent(item);
  if (video) return video.title ? `link “${video.title}”` : `link to ${siteName(video.url)}`;
  return item.caption ? `${KIND_LABELS[item.kind]} “${item.caption.slice(0, 40)}”` : KIND_LABELS[item.kind];
}

type ItemCardProps = {
  item: BoardItem;
  /** Boards an item can move to, by name. */
  otherBoards: { id: string; name: string }[];
  /** Rendered width in CSS pixels, so images can pick which stored copy to load. */
  width: number;
  dropSide: "before" | "after" | null;
  dragging: boolean;
};

export const ItemCard = memo(function ItemCard(props: ItemCardProps) {
  const { item } = props;
  switch (item.kind) {
    case "image":
      return <ImageCard {...props} />;
    case "text":
      return <TextCard {...props} />;
    case "palette":
      return <PaletteCard {...props} />;
    case "video_link":
      return <LinkCard {...props} />;
  }
});

function CardShell({
  item,
  dropSide,
  dragging,
  className,
  children,
}: Pick<ItemCardProps, "item" | "dropSide" | "dragging"> & { className?: string; children: ReactNode }) {
  return (
    <div
      data-measure-id={item.id}
      data-item-id={item.id}
      aria-label={itemName(item)}
      role="group"
      className={cn("group/item relative scroll-mt-28", dragging && "opacity-40", className)}
    >
      {dropSide && <DropLine side={dropSide} />}
      {children}
    </div>
  );
}

function DropLine({ side }: { side: "before" | "after" }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-primary",
        side === "before" ? "-top-[7px]" : "-bottom-[7px]",
      )}
    />
  );
}

/** Thumbnail for cards up to its own width, the full copy beyond. */
function imageSources(assetId: string, width: number | null, height: number | null) {
  if (!width || !height) return { src: assetUrl(assetId, "thumb") };
  const thumb = fitWithin(width, height, VARIANT_MAX_EDGE.thumb).width;
  return {
    src: assetUrl(assetId, "thumb"),
    srcSet: `${assetUrl(assetId, "thumb")} ${thumb}w, ${assetUrl(assetId, "full")} ${width}w`,
  };
}

function BoardImg({
  src,
  srcSet,
  sizes,
  alt = "",
  className,
  style,
}: {
  src: string;
  srcSet?: string;
  sizes?: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served through an authenticated redirect, which the image optimizer can't follow
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      draggable={false}
      decoding="async"
      className={className}
      style={style}
    />
  );
}

function ImageCard({ item, otherBoards, width, dropSide, dragging }: ItemCardProps) {
  const actions = useBoardActions();
  const [editingCaption, setEditingCaption] = useState(false);
  const assetId = item.assetId!;
  const preview = actions.uploader.previewFor(assetId);
  const sources = preview ? { src: preview } : imageSources(assetId, item.width, item.height);
  const aspect = item.width && item.height ? item.width / item.height : 1;

  return (
    <CardShell item={item} dropSide={dropSide} dragging={dragging}>
      <button
        type="button"
        draggable
        data-focus-target
        aria-label={`View ${itemName(item)}`}
        onDragStart={(event) => actions.dragStart(event, item.id)}
        onDragEnd={actions.dragEnd}
        onClick={() => actions.view(item.id)}
        className="block w-full cursor-zoom-in overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ aspectRatio: aspect }}
      >
        <BoardImg {...sources} sizes={`${Math.ceil(width)}px`} alt={item.caption ?? ""} className="size-full object-cover" />
      </button>
      <Caption item={item} editing={editingCaption} onDone={() => setEditingCaption(false)} />
      <ItemMenu item={item} otherBoards={otherBoards} onEditCaption={() => setEditingCaption(true)} />
    </CardShell>
  );
}

function Caption({ item, editing, onDone }: { item: BoardItem; editing: boolean; onDone: () => void }) {
  const actions = useBoardActions();
  if (!editing && !item.caption) return null;
  return (
    <textarea
      data-caption
      rows={1}
      value={item.caption ?? ""}
      aria-label={`Caption, ${itemName(item)}`}
      placeholder="Add a caption"
      onChange={(event) => actions.store.updateItem(item.id, { caption: event.target.value })}
      onBlur={() => {
        onDone();
        actions.store.flush();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="mt-1.5 block field-sizing-content w-full resize-none rounded-md bg-transparent px-1 py-0.5 text-xs leading-5 text-muted-foreground outline-none placeholder:text-muted-foreground/60 focus:bg-background focus:text-foreground focus:ring-2 focus:ring-ring/60"
    />
  );
}

function DragHandle({ item }: { item: BoardItem }) {
  const actions = useBoardActions();
  return (
    <button
      type="button"
      draggable
      tabIndex={-1}
      aria-label={`Drag to move ${itemName(item)}`}
      onDragStart={(event) => actions.dragStart(event, item.id)}
      onDragEnd={actions.dragEnd}
      className="absolute top-1.5 right-8.5 flex size-6 cursor-grab items-center justify-center rounded-[min(var(--radius-md),10px)] bg-secondary text-secondary-foreground shadow-xs opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 active:cursor-grabbing [@media(hover:none)]:opacity-100"
    >
      <GripVerticalIcon className="size-3" />
    </button>
  );
}

function TextCard({ item, otherBoards, dropSide, dragging }: ItemCardProps) {
  const actions = useBoardActions();
  const content = textContent(item)!;

  return (
    <CardShell item={item} dropSide={dropSide} dragging={dragging}>
      <DragHandle item={item} />
      <textarea
        data-focus-target
        data-text
        rows={1}
        value={content.text}
        aria-label={`${TEXT_STYLE_LABELS[content.style]} text`}
        placeholder={TEXT_PLACEHOLDERS[content.style]}
        onChange={(event) =>
          actions.store.updateItem(item.id, { content: { ...content, text: event.target.value } })
        }
        onBlur={(event) => {
          // A text box left empty goes away, as an empty note does; not when its own menu
          // is opened, e.g. to pick a style before typing.
          const card = event.currentTarget.closest("[data-item-id]");
          if (card?.contains(event.relatedTarget as Node | null)) return;
          if (!event.currentTarget.value.trim()) actions.remove(item.id, { quiet: true });
          else actions.store.flush();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.blur();
        }}
        className={cn(
          "block field-sizing-content w-full resize-none rounded-md bg-transparent px-2 py-1 outline-none placeholder:text-muted-foreground/50 hover:bg-background/60 focus:bg-background focus:ring-2 focus:ring-ring/60",
          TEXT_STYLE_CLASSES[content.style],
          content.align === "center" && "text-center",
        )}
      />
      <ItemMenu item={item} otherBoards={otherBoards} />
    </CardShell>
  );
}

function PaletteCard({ item, otherBoards, dropSide, dragging }: ItemCardProps) {
  const actions = useBoardActions();
  const { colors } = paletteContent(item)!;

  const copy = async (color: string) => {
    try {
      await navigator.clipboard.writeText(color);
      toast.success(`Copied ${color}`, { id: "palette-copy" });
    } catch {
      toast.error("Couldn't copy to the clipboard.", { id: "palette-copy" });
    }
  };

  return (
    <CardShell item={item} dropSide={dropSide} dragging={dragging}>
      <div
        draggable
        onDragStart={(event) => actions.dragStart(event, item.id)}
        onDragEnd={actions.dragEnd}
        className="flex h-20 cursor-grab overflow-hidden rounded-lg ring-1 ring-foreground/10 active:cursor-grabbing"
      >
        {colors.map((color, index) => (
          <button
            key={index}
            type="button"
            data-focus-target={index === 0 || undefined}
            aria-label={`Copy ${color}`}
            title={color}
            onClick={() => void copy(color)}
            className="group/swatch relative min-w-0 flex-1 outline-none focus-visible:z-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            style={{ backgroundColor: color }}
          >
            <span className="absolute inset-x-0 bottom-1 mx-auto w-fit max-w-full truncate rounded bg-background/85 px-1 font-mono text-[10px] text-foreground opacity-0 group-hover/swatch:opacity-100 group-focus-visible/swatch:opacity-100">
              {color}
            </span>
          </button>
        ))}
      </div>
      {item.caption && <p className="mt-1.5 px-1 text-xs leading-5 text-muted-foreground">{item.caption}</p>}
      <ItemMenu item={item} otherBoards={otherBoards} />
    </CardShell>
  );
}

function LinkCard({ item, otherBoards, dropSide, dragging }: ItemCardProps) {
  const actions = useBoardActions();
  const [editingCaption, setEditingCaption] = useState(false);
  const video = videoContent(item)!;

  return (
    <CardShell item={item} dropSide={dropSide} dragging={dragging}>
      {video.provider ? (
        <>
          <button
            type="button"
            draggable
            data-focus-target
            aria-label={`Play ${itemName(item)}`}
            onDragStart={(event) => actions.dragStart(event, item.id)}
            onDragEnd={actions.dragEnd}
            onClick={() => actions.view(item.id)}
            className="relative block w-full overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            style={{ aspectRatio: videoAspect(video) }}
          >
            {video.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- the site's own thumbnail
              <img
                src={video.thumbnailUrl}
                alt=""
                draggable={false}
                referrerPolicy="no-referrer"
                decoding="async"
                className="size-full object-cover"
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-black/60 text-white shadow-sm">
                <PlayIcon className="size-4 translate-x-px fill-current" aria-hidden />
              </span>
            </span>
          </button>
          <div className="mt-1.5 px-1">
            <p className="truncate text-xs font-medium">{video.title ?? siteName(video.url)}</p>
            <p className="text-[11px] text-muted-foreground">{PROVIDER_NAMES[video.provider]}</p>
          </div>
        </>
      ) : (
        <>
          <DragHandle item={item} />
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            data-focus-target
            className="flex items-center gap-2.5 rounded-lg border bg-card p-3 shadow-xs outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <LinkIcon className="size-4 text-muted-foreground" aria-hidden />
            </span>
            <span className="min-w-0 pr-14">
              <span className="block truncate text-sm font-medium">{siteName(video.url)}</span>
              <span className="block truncate text-xs text-muted-foreground">{video.url}</span>
            </span>
          </a>
        </>
      )}
      <Caption item={item} editing={editingCaption} onDone={() => setEditingCaption(false)} />
      <ItemMenu item={item} otherBoards={otherBoards} onEditCaption={() => setEditingCaption(true)} />
    </CardShell>
  );
}

/** An image on its way: a spinner, then its preview once it's decoded. */
export function UploadCard({ upload, width }: { upload: BoardUpload; width: number }) {
  const aspect = upload.width && upload.height ? upload.width / upload.height : 1;
  return (
    <div data-measure-id={upload.id} className="relative overflow-hidden rounded-lg bg-muted" style={{ aspectRatio: aspect }}>
      {upload.preview && (
        <BoardImg src={upload.preview} sizes={`${Math.ceil(width)}px`} className="size-full object-cover opacity-70" />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <LoaderCircleIcon className="size-5 animate-spin text-foreground" aria-hidden />
        <span className="sr-only">Uploading image</span>
      </span>
    </div>
  );
}

function ItemMenu({
  item,
  otherBoards,
  onEditCaption,
}: {
  item: BoardItem;
  otherBoards: { id: string; name: string }[];
  onEditCaption?: () => void;
}) {
  const actions = useBoardActions();
  const text = textContent(item);
  const video = videoContent(item);
  // The menu returns focus to its button when it closes; a field picked from it gets it instead.
  const focusAfter = useRef<"caption" | null>(null);
  const update = (patch: Parameters<typeof actions.store.updateItem>[1]) => actions.store.updateItem(item.id, patch);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="icon-xs"
          aria-label={`Actions for ${itemName(item)}`}
          className="absolute top-1.5 right-1.5 shadow-xs opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onCloseAutoFocus={(event) => {
          if (!focusAfter.current) return;
          event.preventDefault();
          focusAfter.current = null;
          actions.focusItem(item.id, "caption");
        }}
      >
        {text && (
          <>
            <DropdownMenuRadioGroup
              value={text.style}
              onValueChange={(style) => update({ content: { ...text, style: style as TextStyle } })}
            >
              {TEXT_STYLES.map((style) => (
                <DropdownMenuRadioItem key={style} value={style}>
                  {TEXT_STYLE_LABELS[style]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={text.align === "center"}
              onCheckedChange={(centered) => update({ content: { ...text, align: centered ? "center" : "start" } })}
            >
              Centered
            </DropdownMenuCheckboxItem>
          </>
        )}
        {onEditCaption && (
          <DropdownMenuItem
            onSelect={() => {
              onEditCaption();
              focusAfter.current = "caption";
            }}
          >
            <CaptionsIcon />
            {item.caption ? "Edit Caption" : "Add Caption"}
          </DropdownMenuItem>
        )}
        {item.kind === "palette" && (
          <DropdownMenuItem onSelect={() => actions.editPalette(item.boardId, item.id)}>
            <PencilIcon />
            Edit Palette…
          </DropdownMenuItem>
        )}
        <DropdownMenuCheckboxItem checked={item.wide} onCheckedChange={(wide) => update({ wide })}>
          Full Width
        </DropdownMenuCheckboxItem>

        {item.kind === "image" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => actions.extractPalette(item.id)}>
              <PipetteIcon />
              Extract Palette
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.useAsCover(item.id)}>
              <PanelTopIcon />
              Use as Header Image
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.newShot(item.id)}>
              <ClapperboardIcon />
              New Shot from Image
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.download(item.id)}>
              <DownloadIcon />
              Download
            </DropdownMenuItem>
          </>
        )}
        {video && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={video.url} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon />
                Open on {video.provider ? PROVIDER_NAMES[video.provider] : siteName(video.url)}
              </a>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.duplicate(item.id)}>
          <CopyIcon />
          Duplicate
        </DropdownMenuItem>
        {otherBoards.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInputIcon />
              Move to Board
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
              {otherBoards.map((board) => (
                <DropdownMenuItem key={board.id} onSelect={() => actions.moveTo(item.id, board.id)}>
                  <span className="truncate">{board.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => actions.remove(item.id)}>
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
