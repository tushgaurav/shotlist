import { z } from "zod";

import {
  HEX_COLOR,
  MAX_PALETTE_COLORS,
  TEXT_ALIGNS,
  TEXT_MAX_LENGTH,
  TEXT_STYLES,
  VIDEO_PROVIDERS,
  type ItemContent,
  type ItemKind,
} from "./types";

const httpUrl = (protocols: string[]) =>
  z
    .string()
    .max(2000)
    .refine((value) => {
      try {
        return protocols.includes(new URL(value).protocol);
      } catch {
        return false;
      }
    });

const size = z.number().int().min(1).max(100_000).nullable();

const CONTENT: Record<Exclude<ItemKind, "image">, z.ZodType<ItemContent>> = {
  text: z
    .object({ text: z.string().max(TEXT_MAX_LENGTH), style: z.enum(TEXT_STYLES), align: z.enum(TEXT_ALIGNS) })
    .strict(),
  palette: z.object({ colors: z.array(z.string().regex(HEX_COLOR)).min(1).max(MAX_PALETTE_COLORS) }).strict(),
  video_link: z
    .object({
      url: httpUrl(["https:", "http:"]),
      provider: z.enum(VIDEO_PROVIDERS).nullable(),
      title: z.string().max(300).nullable(),
      thumbnailUrl: httpUrl(["https:"]).nullable(),
      width: size,
      height: size,
    })
    .strict(),
};

/** The item's content if it fits its kind (images have none), otherwise undefined. */
export function parseContent(kind: ItemKind, content: unknown): ItemContent | null | undefined {
  if (kind === "image") return content === null ? null : undefined;
  const parsed = CONTENT[kind].safeParse(content);
  return parsed.success ? parsed.data : undefined;
}
