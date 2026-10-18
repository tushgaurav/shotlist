import { AVATAR_MAX_BYTES, AVATAR_SIZE } from "@/lib/account";
import {
  fitWithin,
  MAX_IMAGE_EDGE,
  VARIANT_MAX_BYTES,
  VARIANT_MAX_EDGE,
  type ImageType,
  type PreparedImage,
} from "@/lib/shots/images";

export class ImageTooLargeError extends Error {}

let webp: Promise<boolean> | null = null;

/** Safari can decode WebP but its canvas silently encodes PNG instead. */
function canEncodeWebp() {
  webp ??= new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    canvas.toBlob((blob) => resolve(blob?.type === "image/webp"), "image/webp");
  });
  return webp;
}

function encode(canvas: HTMLCanvasElement, type: ImageType, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))), type, quality),
  );
}

function blankCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  // Transparent areas would turn black in a JPEG.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

function draw(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, maxEdge: number) {
  const { width, height } = fitWithin(sourceWidth, sourceHeight, maxEdge);
  const { canvas, context } = blankCanvas(width, height);
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function encodeWithin(canvas: HTMLCanvasElement, type: ImageType, maxBytes: number) {
  const blob = await encode(canvas, type, 0.85);
  return blob.size <= maxBytes ? blob : encode(canvas, type, 0.6);
}

/**
 * Decodes an image file (honouring camera orientation) and re-encodes the two stored copies.
 * Throws if the browser can't decode it.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    if (Math.max(bitmap.width, bitmap.height) > MAX_IMAGE_EDGE) throw new ImageTooLargeError();
    const contentType: ImageType = (await canEncodeWebp()) ? "image/webp" : "image/jpeg";

    const fullCanvas = draw(bitmap, bitmap.width, bitmap.height, VARIANT_MAX_EDGE.full);
    const thumbCanvas = draw(fullCanvas, fullCanvas.width, fullCanvas.height, VARIANT_MAX_EDGE.thumb);
    const [full, thumb] = await Promise.all([
      encodeWithin(fullCanvas, contentType, VARIANT_MAX_BYTES.full),
      encodeWithin(thumbCanvas, contentType, VARIANT_MAX_BYTES.thumb),
    ]);
    return { contentType, width: fullCanvas.width, height: fullCanvas.height, full, thumb };
  } finally {
    bitmap.close();
  }
}

/** A profile photo: the centre square of the image, scaled down to the stored size. */
export async function prepareAvatar(file: Blob): Promise<{ contentType: ImageType; blob: Blob }> {
  const bitmap = await createImageBitmap(file);
  try {
    if (Math.max(bitmap.width, bitmap.height) > MAX_IMAGE_EDGE) throw new ImageTooLargeError();
    const contentType: ImageType = (await canEncodeWebp()) ? "image/webp" : "image/jpeg";

    const side = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(side, AVATAR_SIZE);
    const { canvas, context } = blankCanvas(size, size);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    return { contentType, blob: await encodeWithin(canvas, contentType, AVATAR_MAX_BYTES) };
  } finally {
    bitmap.close();
  }
}

/** The first image among pasted or dropped files, if any. */
export function firstImageFile(files: FileList | null | undefined) {
  return [...(files ?? [])].find((file) => file.type.startsWith("image/")) ?? null;
}

export function hasFiles(dataTransfer: DataTransfer) {
  return dataTransfer.types.includes("Files");
}
