export type MarkJSON = { type: string };

export type TextJSON = { type: "text"; text: string; marks?: MarkJSON[] };

export type BlockJSON = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TextJSON[];
};

/** ProseMirror JSON for a screenplay document, as stored in `scripts.draft`. */
export type ScreenplayDocJSON = { type: "doc"; content: BlockJSON[] };

export type TitlePage = {
  title?: string;
  credit?: string;
  author?: string;
  source?: string;
  draftDate?: string;
  contact?: string;
};

export const SCENE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function emptyScreenplay(sceneId: string): ScreenplayDocJSON {
  return { type: "doc", content: [{ type: "sceneHeading", attrs: { sceneId } }] };
}
