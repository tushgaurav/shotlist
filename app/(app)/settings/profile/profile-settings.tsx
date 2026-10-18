"use client";

import { Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { initials, MAX_PASSWORD_LENGTH, NAME_MAX_LENGTH } from "@/lib/account";
import { ImageTooLargeError, prepareAvatar } from "@/lib/images/prepare";
import { IMAGE_ERRORS, sendForm } from "@/lib/images/upload";
import type { ImageUploadError } from "@/lib/shots/image-uploader";
import { MAX_SOURCE_BYTES } from "@/lib/shots/images";

import {
  changeEmailAction,
  confirmAvatarUploadAction,
  removeAvatarAction,
  startAvatarUploadAction,
  updateNameAction,
} from "../actions";
import { SettingsCard, SettingsRow } from "../settings-card";

const NAME_FORM_ID = "profile-name";

export function ProfileSettings({
  name,
  email,
  image,
  photosEnabled,
}: {
  name: string;
  email: string;
  image: string | null;
  photosEnabled: boolean;
}) {
  const [draftName, setDraftName] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const dirty = draftName.trim() !== name;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    setError(null);
    startSaving(async () => {
      const result = await updateNameAction(draftName);
      if (result.error) setError(result.error);
      else toast.success("Name saved");
    });
  }

  return (
    <SettingsCard
      title="Profile"
      description="How you appear in Shotlist."
      footer={
        <>
          <FieldError className="mr-auto">{error}</FieldError>
          <Button type="submit" form={NAME_FORM_ID} disabled={!dirty || saving} className="ml-auto">
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </>
      }
    >
      <PhotoRow name={name} image={image} enabled={photosEnabled} />
      <SettingsRow label="Full Name" description="Shown in the sidebar." htmlFor="profile-name-input">
        <form id={NAME_FORM_ID} onSubmit={onSubmit}>
          <Input
            id="profile-name-input"
            name="name"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="name"
            aria-invalid={error ? true : undefined}
            required
          />
        </form>
      </SettingsRow>
      <SettingsRow label="Email Address" description="Used to sign in.">
        <div className="flex items-center gap-2">
          <div className="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-input bg-input/20 px-2.5 text-sm dark:bg-input/30">
            <span className="truncate">{email}</span>
          </div>
          <ChangeEmailDialog email={email} />
        </div>
      </SettingsRow>
    </SettingsCard>
  );
}

type PreparedAvatar = Awaited<ReturnType<typeof prepareAvatar>>;

async function prepare(file: File): Promise<PreparedAvatar | ImageUploadError> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return "not_image";
  if (file.size > MAX_SOURCE_BYTES) return "too_large";
  try {
    return await prepareAvatar(file);
  } catch (error) {
    return error instanceof ImageTooLargeError ? "too_large" : "unreadable";
  }
}

async function upload({ contentType, blob }: PreparedAvatar): Promise<ImageUploadError | null> {
  try {
    const started = await startAvatarUploadAction(contentType);
    if (!started.ok) return started.error;
    if (!(await sendForm(started.form, blob))) return "rejected";
    const confirmed = await confirmAvatarUploadAction({ avatarId: started.avatarId, contentType });
    return confirmed.ok ? null : confirmed.error;
  } catch {
    return "offline";
  }
}

function PhotoRow({ name, image, enabled }: { name: string; image: string | null; enabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  // The new photo, kept after it's uploaded so it doesn't flash while loading from S3.
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, startRemoving] = useTransition();
  const busy = uploading || removing;
  const shown = preview ?? image;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onFile(file: File) {
    setUploading(true);
    const prepared = await prepare(file);
    let error: ImageUploadError | null;
    if (typeof prepared === "string") {
      error = prepared;
    } else {
      setPreview(URL.createObjectURL(prepared.blob));
      error = await upload(prepared);
    }
    setUploading(false);
    if (error) {
      setPreview(null);
      toast.error(IMAGE_ERRORS[error], { id: "avatar-error" });
    } else {
      toast.success("Photo updated");
    }
  }

  function remove() {
    startRemoving(async () => {
      await removeAvatarAction();
      setPreview(null);
    });
  }

  return (
    <SettingsRow
      label="Profile Photo"
      description={enabled ? "Shown next to your name. Cropped to a square." : IMAGE_ERRORS.unavailable}
    >
      <div className="flex items-center gap-3">
        <Avatar className="size-10">
          {shown && <AvatarImage src={shown} alt="" />}
          <AvatarFallback className="font-medium">{initials(name)}</AvatarFallback>
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
              <Loader2Icon className="size-4 animate-spin" aria-label="Uploading" />
            </span>
          )}
        </Avatar>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onFile(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!enabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon data-icon="inline-start" />
          {shown ? "Change" : "Upload"}
        </Button>
        {shown && (
          <Button type="button" variant="outline" disabled={busy} onClick={remove}>
            <XIcon data-icon="inline-start" />
            {removing ? "Removing…" : "Remove"}
          </Button>
        )}
      </div>
    </SettingsRow>
  );
}

function ChangeEmailDialog({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Change
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <ChangeEmailForm email={email} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

// Rendered only while the dialog is open, so it starts empty each time.
function ChangeEmailForm({ email, onDone }: { email: string; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") };
    setError(null);
    startTransition(async () => {
      const result = await changeEmailAction(input);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      toast.success(`Your email is now ${input.email.trim().toLowerCase()}. Use it the next time you sign in.`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>Change Email Address</DialogTitle>
        <DialogDescription>
          You sign in with <span className="font-medium text-foreground">{email}</span> now. Enter your
          password to switch to a new address.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="new-email">New Email</FieldLabel>
          <Input id="new-email" name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <Field>
          <FieldLabel htmlFor="email-password">Current Password</FieldLabel>
          <Input
            id="email-password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
        </Field>
        <FieldError>{error}</FieldError>
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Changing…" : "Change Email"}
        </Button>
      </DialogFooter>
    </form>
  );
}
