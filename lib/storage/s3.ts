import "server-only";

import { GetObjectCommand, HeadObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type Storage = { bucket: string; client: S3Client };

let cached: { signature: string; storage: Storage } | null = null;

/** null until all four S3 settings are present. */
function storage(): Storage | null {
  const {
    S3_BUCKET: bucket,
    S3_REGION: region,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
    S3_ENDPOINT: endpoint,
  } = process.env;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;

  // Rebuilt when the settings change, e.g. after editing .env.local while `next dev` runs.
  const signature = [bucket, region, accessKeyId, secretAccessKey, endpoint].join("\n");
  if (cached?.signature !== signature) {
    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      // S3-compatible services (MinIO, R2, local fakes) are usually addressed by path.
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
    cached = { signature, storage: { bucket, client } };
  }
  return cached.storage;
}

function requireStorage() {
  const configured = storage();
  if (!configured) throw new Error("S3 storage isn't configured.");
  return configured;
}

export function storageEnabled() {
  return storage() !== null;
}

/**
 * A form the browser can POST one file to, straight to S3. The policy pins the key and
 * content type and caps the size.
 */
export async function presignUpload(key: string, contentType: string, maxBytes: number) {
  const { client, bucket } = requireStorage();
  return createPresignedPost(client, {
    Bucket: bucket,
    Key: key,
    Conditions: [
      ["content-length-range", 1, maxBytes],
      ["eq", "$Content-Type", contentType],
    ],
    Fields: { "Content-Type": contentType },
    Expires: 600,
  });
}

/** Size and type of a stored object, or null if it isn't there. */
export async function statObject(key: string) {
  const { client, bucket } = requireStorage();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? "" };
  } catch (error) {
    // Without s3:ListBucket, S3 answers 403 rather than 404 for a missing key.
    const status = error instanceof S3ServiceException ? error.$metadata.httpStatusCode : undefined;
    if (status === 404 || status === 403) return null;
    throw error;
  }
}

const URL_WINDOW_SECONDS = 60 * 60;

/**
 * A temporary download URL. URLs are signed at the start of each hour and stay valid for two,
 * so the same URL (and the browser's cached image) is reused for the whole hour.
 * `maxAge` is how long the URL can be handed out before the next one takes over.
 */
export async function signedDownloadUrl(key: string) {
  const { client, bucket } = requireStorage();
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % URL_WINDOW_SECONDS);
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseCacheControl: `private, max-age=${URL_WINDOW_SECONDS}, immutable`,
    }),
    { expiresIn: 2 * URL_WINDOW_SECONDS, signingDate: new Date(windowStart * 1000) },
  );
  return { url, maxAge: Math.max(60, windowStart + URL_WINDOW_SECONDS - now) };
}
