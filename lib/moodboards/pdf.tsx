import { Document, Font, Image, Link, Page, pdf, StyleSheet, Text, View, type Styles } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { breakLongWord, MONO, registerFonts, SANS } from "../notes/pdf";
import { PAPER_SIZES, type PaperSize } from "../screenplay/pagination";
import { assetUrl, fitWithin, VARIANT_MAX_EDGE } from "../shots/images";
import {
  paletteContent,
  textContent,
  videoContent,
  type BoardItem,
  type BoardRecord,
  type TextStyle,
} from "./types";
import { PROVIDER_NAMES, siteName, videoAspect } from "./video-links";

type Style = Styles[string];

const POINTS_PER_INCH = 72;
const MARGIN = 48;
const GAP = 10;
/** Pixels per inch to fetch images at. */
const IMAGE_DPI = 200;
/** No image row taller than this share of the page, so a row always fits on one. */
const MAX_IMAGE_SHARE = 0.55;

const INK = "#171717";
const MUTED = "#737373";
const RULE = "#d4d4d4";
const TINT = "#f4f4f5";
const LINK = "#0e7490";

/** An image ready for the PDF: re-encoded as JPEG, which react-pdf can read (WebP it can't). */
type LoadedImage = { src: string; width: number; height: number };

export type BoardPdfOptions = {
  paper: PaperSize;
  /** Shown under the board's name and at the foot of every page. */
  projectTitle: string;
};

export type BoardPdf = {
  blob: Blob;
  /** Images that couldn't be loaded and show as placeholders. */
  missing: number;
};

/**
 * A board as a PDF, in the board's columns. Items flow in rows, in the board's order; a row
 * never splits across pages and full-width items get a row to themselves. Made in the
 * browser, which fetches the images, so the bucket's CORS rule has to allow GET.
 */
export async function renderBoardPdf(
  board: BoardRecord,
  items: BoardItem[],
  options: BoardPdfOptions,
  fontBaseUrl = "/fonts/geist",
): Promise<BoardPdf> {
  registerFonts(fontBaseUrl);
  // The callback is shared by every PDF, so each sets its own before rendering.
  Font.registerHyphenationCallback(breakLongWord);

  const { width, height } = PAPER_SIZES[options.paper];
  const page = { width: width * POINTS_PER_INCH, height: height * POINTS_PER_INCH };
  const contentWidth = page.width - 2 * MARGIN;
  const columns = Math.max(1, board.columns);
  const cellWidth = (contentWidth - GAP * (columns - 1)) / columns;

  const shown = items.filter((item) => item.kind !== "text" || textContent(item)!.text.trim());
  const images = await loadImages(shown, (item) => (item.wide ? contentWidth : cellWidth));
  const missing = shown.filter((item) => item.kind === "image" && !images.has(item.id)).length;

  const layout: Layout = {
    columns,
    cellWidth,
    contentWidth,
    maxImageHeight: (page.height - 2 * MARGIN) * MAX_IMAGE_SHARE,
    images,
  };
  const blob = await pdf(
    <Document title={board.name} creator="Shotlist" producer="Shotlist">
      <Page size={[page.width, page.height]} style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{board.name}</Text>
          <Text style={styles.subtitle}>{options.projectTitle}</Text>
        </View>
        <View style={styles.body}>{rows(shown, layout)}</View>
        <View fixed style={styles.footer}>
          <Text>
            {options.projectTitle} · {board.name}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  ).toBlob();
  return { blob, missing };
}

type Layout = {
  columns: number;
  cellWidth: number;
  contentWidth: number;
  maxImageHeight: number;
  images: Map<string, LoadedImage>;
};

function rows(items: BoardItem[], layout: Layout): ReactNode[] {
  const result: ReactNode[] = [];
  let row: BoardItem[] = [];
  const flush = () => {
    if (row.length === 0) return;
    result.push(
      <View key={row[0].id} wrap={false} style={styles.row}>
        {Array.from({ length: layout.columns }, (_, index) => (
          <View
            key={index}
            style={{ width: layout.cellWidth, marginRight: index < layout.columns - 1 ? GAP : 0 }}
          >
            {row[index] && item(row[index], layout.cellWidth, layout)}
          </View>
        ))}
      </View>,
    );
    row = [];
  };

  for (const entry of items) {
    if (entry.wide) {
      flush();
      // Long text may break across pages; anything else stays whole.
      result.push(
        <View key={entry.id} wrap={entry.kind === "text"} style={styles.row}>
          {item(entry, layout.contentWidth, layout)}
        </View>,
      );
      continue;
    }
    row.push(entry);
    if (row.length === layout.columns) flush();
  }
  flush();
  return result;
}

function item(entry: BoardItem, width: number, layout: Layout): ReactNode {
  switch (entry.kind) {
    case "image":
      return (
        <>
          <Picture
            image={layout.images.get(entry.id)}
            aspect={entry.width && entry.height ? entry.width / entry.height : 1}
            width={width}
            maxHeight={layout.maxImageHeight}
          />
          {entry.caption && <Text style={styles.caption}>{entry.caption}</Text>}
        </>
      );
    case "text": {
      const content = textContent(entry)!;
      return (
        <Text style={[TEXT_STYLES[content.style], content.align === "center" ? styles.centered : {}]}>
          {content.text}
        </Text>
      );
    }
    case "palette": {
      const { colors } = paletteContent(entry)!;
      return (
        <>
          <View style={styles.swatches}>
            {colors.map((color, index) => (
              <View key={index} style={[styles.swatch, { backgroundColor: color }]} />
            ))}
          </View>
          <View style={styles.hexes}>
            {colors.map((color, index) => (
              <Text key={index} style={styles.hex}>
                {color}
              </Text>
            ))}
          </View>
          {entry.caption && <Text style={styles.caption}>{entry.caption}</Text>}
        </>
      );
    }
    case "video_link": {
      const video = videoContent(entry)!;
      return (
        <>
          {video.provider && (
            <Picture
              image={layout.images.get(entry.id)}
              aspect={videoAspect(video)}
              width={width}
              maxHeight={layout.maxImageHeight}
              label={`▶ ${PROVIDER_NAMES[video.provider]}`}
            />
          )}
          <Text style={styles.linkTitle}>{video.title ?? siteName(video.url)}</Text>
          <Link src={video.url} style={styles.link}>
            {video.url}
          </Link>
          {entry.caption && <Text style={styles.caption}>{entry.caption}</Text>}
        </>
      );
    }
  }
}

/** An image at its aspect ratio, or a tinted box where it couldn't be loaded. */
function Picture({
  image,
  aspect,
  width,
  maxHeight,
  label = "Image unavailable",
}: {
  image: LoadedImage | undefined;
  aspect: number;
  width: number;
  maxHeight: number;
  label?: string;
}) {
  const height = Math.min(width / aspect, maxHeight);
  const box = { width: Math.min(width, height * aspect), height };
  if (!image) {
    return (
      <View style={[styles.placeholder, box]}>
        <Text style={styles.placeholderText}>{label}</Text>
      </View>
    );
  }
  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt
  return <Image src={image.src} style={[styles.image, box]} />;
}

/** The images for image items and video thumbnails, a few at a time. Failures are left out. */
async function loadImages(items: BoardItem[], widthOf: (item: BoardItem) => number) {
  const jobs = items.flatMap((entry) => {
    const pixels = Math.ceil((widthOf(entry) / POINTS_PER_INCH) * IMAGE_DPI);
    if (entry.kind === "image" && entry.assetId) {
      const variant = pixels > VARIANT_MAX_EDGE.thumb ? "full" : "thumb";
      return [{ id: entry.id, url: assetUrl(entry.assetId, variant), pixels }];
    }
    const video = videoContent(entry);
    return video?.provider && video.thumbnailUrl ? [{ id: entry.id, url: video.thumbnailUrl, pixels }] : [];
  });

  const loaded = new Map<string, LoadedImage>();
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const image = await loadJpeg(job.url, job.pixels);
      if (image) loaded.set(job.id, image);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  return loaded;
}

async function loadJpeg(url: string, maxEdge: number): Promise<LoadedImage | null> {
  try {
    // Not from the cache: an earlier <img> load may have cached a copy without CORS headers.
    const response = await fetch(url, { cache: "no-store", referrerPolicy: "no-referrer" });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const size = fitWithin(bitmap.width, bitmap.height, maxEdge);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, size.width, size.height);
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      return { src: canvas.toDataURL("image/jpeg", 0.85), width: size.width, height: size.height };
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  page: { paddingTop: MARGIN, paddingBottom: MARGIN + 16, paddingHorizontal: MARGIN, color: INK, fontFamily: SANS },
  header: { marginBottom: 18 },
  title: { fontSize: 20, fontWeight: 600, lineHeight: 1.25 },
  subtitle: { marginTop: 2, fontSize: 9, color: MUTED },
  body: { fontSize: 9.5, lineHeight: 1.45 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: MARGIN,
    right: MARGIN,
    flexDirection: "row",
    justifyContent: "space-between",
    color: MUTED,
    fontSize: 8,
  },
  row: { flexDirection: "row", alignItems: "flex-start", marginBottom: GAP + 4 },
  image: { borderRadius: 3, objectFit: "cover" },
  placeholder: { alignItems: "center", justifyContent: "center", borderRadius: 3, backgroundColor: TINT },
  placeholderText: { fontSize: 7.5, color: MUTED },
  caption: { marginTop: 4, fontSize: 8, lineHeight: 1.4, color: MUTED },
  centered: { textAlign: "center" },
  swatches: { flexDirection: "row", height: 40, borderRadius: 3, overflow: "hidden" },
  swatch: { flex: 1 },
  hexes: { flexDirection: "row", marginTop: 3 },
  hex: { flex: 1, fontFamily: MONO, fontSize: 6, color: MUTED },
  linkTitle: { marginTop: 4, fontSize: 8.5, fontWeight: 600, lineHeight: 1.35 },
  link: { fontSize: 7, color: LINK, textDecoration: "none" },
});

const TEXT_STYLES: Record<TextStyle, Style> = {
  title: { fontSize: 20, fontWeight: 600, lineHeight: 1.25 },
  heading: { marginTop: 4, fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 },
  body: { fontSize: 9.5, lineHeight: 1.5 },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: RULE,
    paddingLeft: 8,
    fontSize: 11,
    fontStyle: "italic",
    lineHeight: 1.45,
    color: MUTED,
  },
};
