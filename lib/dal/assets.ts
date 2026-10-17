import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import { newId } from "@/lib/id";
import {
  IMAGE_VARIANTS,
  VARIANT_MAX_BYTES,
  type ImageType,
  type ImageVariant,
  type UploadForm,
  type UploadResult,
} from "@/lib/shots/images";
import { presignUpload, signedDownloadUrl, statObject, storageEnabled } from "@/lib/storage/s3";

import { getCurrentUser } from "./session";

const unavailable = { ok: false, error: "unavailable" } as const;
const unauthorized = { ok: false, error: "unauthorized" } as const;
const notFound = { ok: false, error: "not_found" } as const;
const invalid = { ok: false, error: "invalid" } as const;

function assetKey(projectId: string, assetId: string, variant: ImageVariant, type: ImageType) {
  return `projects/${projectId}/assets/${assetId}/${variant}.${type === "image/webp" ? "webp" : "jpg"}`;
}

async function ownsProject(projectId: string) {
  const user = await getCurrentUser();
  if (!user) return unauthorized;
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
    .limit(1);
  return project ? null : notFound;
}

/** Upload forms for both copies of a new image. Nothing is recorded until it's confirmed. */
export async function startImageUpload(
  projectId: string,
  contentType: ImageType,
): Promise<UploadResult<{ assetId: string; forms: Record<ImageVariant, UploadForm> }>> {
  if (!storageEnabled()) return unavailable;
  const denied = await ownsProject(projectId);
  if (denied) return denied;

  const assetId = newId();
  const [full, thumb] = await Promise.all(
    IMAGE_VARIANTS.map((variant) =>
      presignUpload(assetKey(projectId, assetId, variant, contentType), contentType, VARIANT_MAX_BYTES[variant]),
    ),
  );
  return { ok: true, assetId, forms: { full, thumb } };
}

/**
 * Records an uploaded image once both copies are in the bucket. The keys sit under the
 * project's prefix, and only the owner gets upload forms for it.
 */
export async function confirmImageUpload(
  projectId: string,
  input: { assetId: string; contentType: ImageType; width: number; height: number },
): Promise<UploadResult> {
  if (!storageEnabled()) return unavailable;
  const denied = await ownsProject(projectId);
  if (denied) return denied;

  const keys = {
    full: assetKey(projectId, input.assetId, "full", input.contentType),
    thumb: assetKey(projectId, input.assetId, "thumb", input.contentType),
  };
  const [full, thumb] = await Promise.all([statObject(keys.full), statObject(keys.thumb)]);
  if (!full || !thumb) return notFound;
  if (full.contentType !== input.contentType || thumb.contentType !== input.contentType) return invalid;

  const [inserted] = await db
    .insert(assets)
    .values({
      id: input.assetId,
      projectId,
      contentType: input.contentType,
      storageKey: keys.full,
      thumbKey: keys.thumb,
      width: input.width,
      height: input.height,
      byteSize: full.size + thumb.size,
    })
    .onConflictDoNothing()
    .returning({ id: assets.id });
  if (inserted) return { ok: true };

  // A retried confirm: fine as long as it's the same project's image.
  const [existing] = await db
    .select({ projectId: assets.projectId })
    .from(assets)
    .where(eq(assets.id, input.assetId))
    .limit(1);
  return existing?.projectId === projectId ? { ok: true } : invalid;
}

/** A temporary S3 URL for one of the signed-in user's images, or null. */
export async function getAssetDownload(assetId: string, variant: ImageVariant) {
  if (!storageEnabled()) return null;
  const user = await getCurrentUser();
  if (!user) return null;

  const [asset] = await db
    .select({ storageKey: assets.storageKey, thumbKey: assets.thumbKey })
    .from(assets)
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .where(and(eq(assets.id, assetId), eq(projects.ownerId, user.id)))
    .limit(1);
  if (!asset) return null;

  return signedDownloadUrl(variant === "full" ? asset.storageKey : asset.thumbKey);
}
