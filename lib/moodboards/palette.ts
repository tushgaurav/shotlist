import { HEX_COLOR } from "./types";

type Bucket = { r: number; g: number; b: number; count: number };

const SAMPLE_EDGE = 64;
/** Colors closer than this (in RGB) count as the same color. */
const MIN_DISTANCE = 40;

export function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

/** "#ABC", "abc", "#aabbcc" → "#aabbcc"; null if it isn't a color. */
export function normalizeHex(text: string) {
  let value = text.trim().toLowerCase();
  if (!value.startsWith("#")) value = `#${value}`;
  if (/^#[0-9a-f]{3}$/.test(value)) value = `#${[...value.slice(1)].map((c) => c + c).join("")}`;
  return HEX_COLOR.test(value) ? value : null;
}

function luminance({ r, g, b }: Bucket) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function distance(a: Bucket, b: Bucket) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/**
 * The main colors of an image, lightest first. `pixels` is RGBA, as from getImageData.
 * Similar colors are grouped, the biggest groups win, and near-duplicates are skipped so a
 * mostly-sky photo doesn't come back as five blues.
 */
export function extractPalette(pixels: Uint8ClampedArray, count = 5): string[] {
  const buckets = new Map<number, Bucket>();
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;
    const [r, g, b] = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  const colors = [...buckets.values()]
    .map((bucket) => ({ ...bucket, r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count }))
    .sort((a, b) => b.count - a.count);

  const picked: Bucket[] = [];
  for (const color of colors) {
    if (picked.length === count) break;
    if (picked.every((other) => distance(other, color) >= MIN_DISTANCE)) picked.push(color);
  }
  // A plain image may not have enough distinct colors; fill up with the next biggest.
  for (const color of colors) {
    if (picked.length === count) break;
    if (!picked.includes(color)) picked.push(color);
  }

  return picked.sort((a, b) => luminance(b) - luminance(a)).map(({ r, g, b }) => toHex(r, g, b));
}

/**
 * Reads an image's main colors in the browser. The image comes from the bucket, so this needs
 * the bucket's CORS rule to allow GET from the app.
 */
export async function paletteFromImage(url: string, count = 5): Promise<string[]> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Couldn't load the image (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob(), {
    resizeWidth: SAMPLE_EDGE,
    resizeHeight: SAMPLE_EDGE,
    resizeQuality: "medium",
  });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SAMPLE_EDGE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(bitmap, 0, 0);
    return extractPalette(context.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE).data, count);
  } finally {
    bitmap.close();
  }
}
