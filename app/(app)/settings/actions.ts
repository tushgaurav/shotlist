"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, NAME_MAX_LENGTH } from "@/lib/account";
import {
  changeEmail,
  changePassword,
  confirmAvatarUpload,
  removeAvatar,
  revokeOtherSessions,
  revokeSession,
  startAvatarUpload,
  updateName,
  type ChangeEmailResult,
  type ChangePasswordResult,
} from "@/lib/dal/account";
import { IMAGE_TYPES, type ImageType } from "@/lib/shots/images";
import { SHOT_ID_PATTERN } from "@/lib/shots/types";

export type SettingsFormState = { error?: string };

const invalid = { ok: false, error: "invalid" } as const;

const name = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(NAME_MAX_LENGTH, `Keep your name under ${NAME_MAX_LENGTH} characters.`);

export async function updateNameAction(input: string): Promise<SettingsFormState> {
  const parsed = name.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await updateName(parsed.data);
  refresh();
  return {};
}

const currentPassword = z.string().min(1, "Enter your current password.").max(MAX_PASSWORD_LENGTH);

const emailInput = z.object({
  email: z.string().trim().max(254).pipe(z.email("Enter a valid email address.")),
  password: currentPassword,
});

const EMAIL_ERRORS: Record<Extract<ChangeEmailResult, { ok: false }>["error"], string> = {
  same: "That's already your email address.",
  wrong_password: "That password isn't right.",
  taken: "Another account already uses that email address.",
};

export async function changeEmailAction(input: { email: string; password: string }): Promise<SettingsFormState> {
  const parsed = emailInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await changeEmail(parsed.data.email, parsed.data.password);
  if (!result.ok) return { error: EMAIL_ERRORS[result.error] };
  refresh();
  return {};
}

const passwordInput = z.object({
  currentPassword,
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(MAX_PASSWORD_LENGTH, `Keep it under ${MAX_PASSWORD_LENGTH} characters.`),
  revokeOtherSessions: z.boolean(),
});

const PASSWORD_ERRORS: Record<Extract<ChangePasswordResult, { ok: false }>["error"], string> = {
  wrong_password: "Your current password isn't right.",
  no_password: "This account doesn't have a password to change.",
};

export async function changePasswordAction(input: z.input<typeof passwordInput>): Promise<SettingsFormState> {
  const parsed = passwordInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await changePassword(parsed.data);
  if (!result.ok) return { error: PASSWORD_ERRORS[result.error] };
  refresh();
  return {};
}

const imageType = z.enum(IMAGE_TYPES);

export async function startAvatarUploadAction(contentType: ImageType) {
  const parsed = imageType.safeParse(contentType);
  if (!parsed.success) return invalid;
  return startAvatarUpload(parsed.data);
}

export async function confirmAvatarUploadAction(input: { avatarId: string; contentType: ImageType }) {
  const parsed = z.object({ avatarId: z.string().regex(SHOT_ID_PATTERN), contentType: imageType }).safeParse(input);
  if (!parsed.success) return invalid;

  const result = await confirmAvatarUpload(parsed.data);
  if (result.ok) refresh();
  return result;
}

export async function removeAvatarAction() {
  await removeAvatar();
  refresh();
}

const sessionId = z.string().min(1).max(64);

export async function revokeSessionAction(id: string) {
  await revokeSession(sessionId.parse(id));
  refresh();
}

export async function revokeOtherSessionsAction() {
  await revokeOtherSessions();
  refresh();
}
