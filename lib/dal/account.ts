import "server-only";

import { isAPIError } from "better-auth/api";
import { and, desc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";

import { AVATAR_MAX_BYTES, avatarFile, avatarUrl } from "@/lib/account";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { session, user as users } from "@/lib/db/schema";
import { newId } from "@/lib/id";
import type { ImageType, UploadForm, UploadResult } from "@/lib/shots/images";
import { presignUpload, signedDownloadUrl, statObject, storageEnabled } from "@/lib/storage/s3";

import { getCurrentUser, requireSessionId, requireUser } from "./session";

const unavailable = { ok: false, error: "unavailable" } as const;
const unauthorized = { ok: false, error: "unauthorized" } as const;
const notFound = { ok: false, error: "not_found" } as const;
const invalid = { ok: false, error: "invalid" } as const;

function hasCode(error: unknown, code: string) {
  return isAPIError(error) && error.body?.code === code;
}

export async function updateName(name: string) {
  await requireUser();
  await auth.api.updateUser({ headers: await headers(), body: { name } });
}

export type ChangeEmailResult = { ok: true } | { ok: false; error: "same" | "wrong_password" | "taken" };

/** Asks for the password too: whoever controls the email controls sign-in. */
export async function changeEmail(newEmail: string, password: string): Promise<ChangeEmailResult> {
  const current = await requireUser();
  const email = newEmail.toLowerCase();
  if (email === current.email) return { ok: false, error: "same" };

  const requestHeaders = await headers();
  try {
    await auth.api.verifyPassword({ headers: requestHeaders, body: { password } });
  } catch (error) {
    if (hasCode(error, "INVALID_PASSWORD")) return { ok: false, error: "wrong_password" };
    throw error;
  }
  await auth.api.changeEmail({ headers: requestHeaders, body: { newEmail: email } });

  // Better Auth reports success without changing anything when another account has the address.
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, current.id)).limit(1);
  return row?.email === email ? { ok: true } : { ok: false, error: "taken" };
}

export type ChangePasswordResult = { ok: true } | { ok: false; error: "wrong_password" | "no_password" };

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions: boolean;
}): Promise<ChangePasswordResult> {
  await requireUser();
  try {
    await auth.api.changePassword({ headers: await headers(), body: input });
    return { ok: true };
  } catch (error) {
    if (hasCode(error, "INVALID_PASSWORD")) return { ok: false, error: "wrong_password" };
    if (hasCode(error, "CREDENTIAL_ACCOUNT_NOT_FOUND")) return { ok: false, error: "no_password" };
    throw error;
  }
}

function avatarKey(userId: string, file: string) {
  return `users/${userId}/avatars/${file}`;
}

/** An upload form for a new profile photo. Nothing changes until it's confirmed. */
export async function startAvatarUpload(
  contentType: ImageType,
): Promise<UploadResult<{ avatarId: string; form: UploadForm }>> {
  if (!storageEnabled()) return unavailable;
  const user = await getCurrentUser();
  if (!user) return unauthorized;

  const avatarId = newId();
  const form = await presignUpload(
    avatarKey(user.id, avatarFile(avatarId, contentType)),
    contentType,
    AVATAR_MAX_BYTES,
  );
  return { ok: true, avatarId, form };
}

/**
 * Makes an uploaded photo the user's own once it's in the bucket. Old photos stay in the
 * bucket: the app's storage credentials can't delete.
 */
export async function confirmAvatarUpload(input: { avatarId: string; contentType: ImageType }): Promise<UploadResult> {
  if (!storageEnabled()) return unavailable;
  const user = await getCurrentUser();
  if (!user) return unauthorized;

  const file = avatarFile(input.avatarId, input.contentType);
  const stored = await statObject(avatarKey(user.id, file));
  if (!stored) return notFound;
  if (stored.contentType !== input.contentType) return invalid;

  await auth.api.updateUser({ headers: await headers(), body: { image: avatarUrl(user.id, file) } });
  return { ok: true };
}

export async function removeAvatar() {
  await requireUser();
  await auth.api.updateUser({ headers: await headers(), body: { image: null } });
}

/** A temporary S3 URL for a profile photo. For now only its owner can see it. */
export async function getAvatarDownload(userId: string, file: string) {
  if (!storageEnabled()) return null;
  const user = await getCurrentUser();
  if (!user || user.id !== userId) return null;
  return signedDownloadUrl(avatarKey(userId, file));
}

export type DeviceSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  current: boolean;
};

/** Signed-in devices, newest activity first. Session tokens never leave the server. */
export async function listSessions(): Promise<DeviceSession[]> {
  const [user, currentId] = await Promise.all([requireUser(), requireSessionId()]);
  const rows = await db
    .select({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
    })
    .from(session)
    .where(and(eq(session.userId, user.id), gt(session.expiresAt, new Date())))
    .orderBy(desc(session.updatedAt));
  return rows.map((row) => ({ ...row, current: row.id === currentId }));
}

/** Signs one of the user's other devices out. This one signs out from the account menu. */
export async function revokeSession(sessionId: string) {
  const [user, currentId] = await Promise.all([requireUser(), requireSessionId()]);
  if (sessionId === currentId) return;

  const [row] = await db
    .select({ token: session.token })
    .from(session)
    .where(and(eq(session.id, sessionId), eq(session.userId, user.id)))
    .limit(1);
  if (row) await auth.api.revokeSession({ headers: await headers(), body: { token: row.token } });
}

export async function revokeOtherSessions() {
  await requireUser();
  await auth.api.revokeOtherSessions({ headers: await headers() });
}
