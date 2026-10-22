export const ITEM_KINDS = ["image", "text", "palette", "video_link"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const TEXT_STYLES = ["title", "heading", "body", "quote"] as const;
export type TextStyle = (typeof TEXT_STYLES)[number];

export const TEXT_STYLE_LABELS: Record<TextStyle, string> = {
  title: "Title",
  heading: "Heading",
  body: "Body",
  quote: "Quote",
};

export const TEXT_ALIGNS = ["start", "center"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export const VIDEO_PROVIDERS = ["youtube", "vimeo"] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

export type TextContent = { text: string; style: TextStyle; align: TextAlign };
/** Colors as lowercase #rrggbb. */
export type PaletteContent = { colors: string[] };
/** What the site's oEmbed endpoint said about the video when it was added. Null for other links. */
export type VideoLinkContent = {
  url: string;
  provider: VideoProvider | null;
  title: string | null;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
};
export type ItemContent = TextContent | PaletteContent | VideoLinkContent;

export const MAX_BOARD_COLUMNS = 4;
export const DEFAULT_BOARD_COLUMNS = 3;
export const MAX_PALETTE_COLORS = 8;
export const BOARD_NAME_MAX_LENGTH = 120;
export const CAPTION_MAX_LENGTH = 1000;
export const TEXT_MAX_LENGTH = 5000;
export const HEX_COLOR = /^#[0-9a-f]{6}$/;

export const MOODBOARD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type BoardRecord = {
  id: string;
  name: string;
  columns: number;
  position: string;
  archived: boolean;
};

export type BoardPatch = Partial<Pick<BoardRecord, "name" | "columns" | "archived" | "position">>;

export type BoardItem = {
  id: string;
  boardId: string;
  position: string;
  kind: ItemKind;
  wide: boolean;
  assetId: string | null;
  caption: string | null;
  content: ItemContent | null;
  /** The image's size, so the board can be laid out before it loads. Null for other kinds. */
  width: number | null;
  height: number | null;
};

export type ItemPatch = Partial<Pick<BoardItem, "wide" | "caption" | "content">>;

/** What a new item is made of. Its kind and image never change afterwards. */
export type NewItem = Pick<BoardItem, "id" | "boardId" | "position" | "kind" | "wide" | "assetId" | "caption" | "content">;

export type MoodboardData = {
  boards: BoardRecord[];
  items: BoardItem[];
  /**
   * When the project last changed on the server (ms). Data older than a change this browser
   * already saved is stale.
   */
  version: number;
};

export type MoodboardMutationError = "unauthorized" | "not_found" | "invalid";
export type MoodboardMutation<T extends object = object> =
  | ({ ok: true; version?: number } & T)
  | { ok: false; error: MoodboardMutationError };

/** An image already in the project, for reusing it on a board. */
export type ProjectImage = { id: string; width: number; height: number };

export function textContent(item: Pick<BoardItem, "kind" | "content">): TextContent | null {
  return item.kind === "text" ? (item.content as TextContent) : null;
}

export function paletteContent(item: Pick<BoardItem, "kind" | "content">): PaletteContent | null {
  return item.kind === "palette" ? (item.content as PaletteContent) : null;
}

export function videoContent(item: Pick<BoardItem, "kind" | "content">): VideoLinkContent | null {
  return item.kind === "video_link" ? (item.content as VideoLinkContent) : null;
}

/** Headings and titles mark sections, so they start out spanning the board. */
export function isWideByDefault(style: TextStyle) {
  return style === "title" || style === "heading";
}

/** Everything searchable about an item, lowercased. */
export function itemSearchText(item: BoardItem) {
  const parts = [item.caption ?? ""];
  const text = textContent(item);
  if (text) parts.push(text.text);
  const video = videoContent(item);
  if (video) parts.push(video.title ?? "", video.url);
  return parts.join("\n").toLowerCase();
}

type Ordered = { position: string; id: string };

/** Order keys are compared as plain strings (code units), never with a locale. */
export function compareOrdered(a: Ordered, b: Ordered) {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
