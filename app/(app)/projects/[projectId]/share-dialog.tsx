"use client";

import { CopyIcon, ExternalLinkIcon, MessageSquareIcon, Share2Icon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SHARE_PASSWORD_MAX_LENGTH, sharePath, type ShareSettings, type ShareTarget } from "@/lib/share/types";

import {
  enableShareAction,
  getShareAction,
  resetShareLinkAction,
  setSharePasswordAction,
  updateShareAction,
} from "./share-actions";

type Props = {
  projectId: string;
  target: ShareTarget;
  share: ShareSettings | null;
  onShareChange: (share: ShareSettings) => void;
  /** Saves what the link needs before it's made. False if there's nothing to share yet. */
  prepare?: () => Promise<boolean>;
  disabled?: boolean;
};

export function ShareDialog({ projectId, target, share, onShareChange, prepare, disabled }: Props) {
  const [open, setOpen] = useState(false);
  // Bumped by every change made here, so a slower refresh can't undo one.
  const changes = useRef(0);
  const noun = target.kind === "script" ? "script" : "note";

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next || !share) return;
    // Comments arrive while the dialog is closed.
    const before = changes.current;
    getShareAction(projectId, target).then(
      (fresh) => {
        if (fresh && changes.current === before) onShareChange(fresh);
      },
      () => {},
    );
  };

  const openComments = share?.openComments ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={disabled}>
              <Share2Icon data-icon="inline-start" />
              {/* Toolbars are crowded below xl, so the icon stands in for the label there. */}
              <span className="max-xl:sr-only">Share</span>
              {openComments > 0 && (
                <span
                  aria-label={`${openComments} open ${openComments === 1 ? "comment" : "comments"}`}
                  className="ml-0.5 rounded-full bg-primary px-1.5 text-[0.6875rem] leading-4 font-semibold text-primary-foreground tabular-nums"
                >
                  {openComments}
                </span>
              )}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Share a read-only link</TooltipContent>
      </Tooltip>
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share {noun === "script" ? "Script" : "Note"}</DialogTitle>
          <DialogDescription>
            Anyone with the link can read the latest saved version of this {noun}. Only you can edit it.
          </DialogDescription>
        </DialogHeader>
        <ShareSettingsForm
          projectId={projectId}
          target={target}
          share={share}
          noun={noun}
          onShareChange={(next) => {
            changes.current++;
            onShareChange(next);
          }}
          prepare={prepare}
        />
      </DialogContent>
    </Dialog>
  );
}

function ShareSettingsForm({
  projectId,
  target,
  share,
  noun,
  onShareChange,
  prepare,
}: Omit<Props, "disabled"> & { noun: string }) {
  const [pending, startTransition] = useTransition();
  const [editingPassword, setEditingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string>();
  const [confirmingReset, setConfirmingReset] = useState(false);

  /** Shows the change at once, then whatever the server says; puts things back if it fails. */
  const change = (optimistic: Partial<ShareSettings>, save: (share: ShareSettings) => Promise<ShareSettings>, failure: string) => {
    if (!share) return;
    onShareChange({ ...share, ...optimistic });
    startTransition(async () => {
      try {
        onShareChange(await save(share));
      } catch {
        onShareChange(share);
        toast.error(failure);
      }
    });
  };

  const setEnabled = (enabled: boolean) => {
    if (share && !enabled) {
      change({ enabled }, ({ id }) => updateShareAction(id, { enabled }), "Couldn't turn the link off. Try again.");
      return;
    }
    startTransition(async () => {
      try {
        if (prepare && !(await prepare())) {
          toast(`Write something in the ${noun} first.`);
          return;
        }
        const next = await enableShareAction(projectId, target);
        if (next) onShareChange(next);
        else toast.error(`Couldn't find this ${noun}. It may have been deleted.`);
      } catch {
        toast.error("Couldn't make the link. Check your connection and try again.");
      }
    });
  };

  const savePassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!share) return;
    const value = String(new FormData(event.currentTarget).get("share-password") ?? "");
    startTransition(async () => {
      try {
        const result = await setSharePasswordAction(share.id, value);
        if ("error" in result) {
          setPasswordError(result.error);
          return;
        }
        onShareChange(result.settings);
        setEditingPassword(false);
        setPasswordError(undefined);
        toast.success("Password saved. Send it to them separately from the link.");
      } catch {
        toast.error("Couldn't save the password. Try again.");
      }
    });
  };

  const onPasswordSwitch = (checked: boolean) => {
    setPasswordError(undefined);
    if (checked || !share?.hasPassword) {
      setEditingPassword(checked);
      return;
    }
    setEditingPassword(false);
    change(
      { hasPassword: false },
      async ({ id }) => {
        const result = await setSharePasswordAction(id, null);
        if ("error" in result) throw new Error(result.error);
        return result.settings;
      },
      "Couldn't remove the password. Try again.",
    );
  };

  const resetLink = () => {
    if (!share) return;
    setConfirmingReset(false);
    startTransition(async () => {
      try {
        onShareChange(await resetShareLinkAction(share.id));
        toast.success("Made a new link. The old one no longer works.");
      } catch {
        toast.error("Couldn't reset the link. Try again.");
      }
    });
  };

  const live = share?.enabled ? share : null;
  const url = share ? new URL(sharePath(share.token), window.location.origin).toString() : "";
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied."),
      () => toast.error("Couldn't copy the link. Select it and copy it yourself."),
    );

  return (
    <div className="flex flex-col gap-5">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="share-enabled">Share with a link</FieldLabel>
          <FieldDescription>
            {live ? "On. Turning it off keeps the link for later." : `Off. Only you can see this ${noun}.`}
          </FieldDescription>
        </FieldContent>
        <Switch id="share-enabled" checked={!!live} disabled={pending && !share} onCheckedChange={setEnabled} />
      </Field>

      {live && (
        <>
          <div className="flex gap-2">
            <Input
              readOnly
              value={url}
              aria-label="Link"
              className="font-mono text-xs md:text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button onClick={copy}>
              <CopyIcon data-icon="inline-start" />
              Copy
            </Button>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="share-password-switch">Require a password</FieldLabel>
                <FieldDescription>
                  {live.hasPassword && !editingPassword ? (
                    <>
                      Password set.{" "}
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-foreground"
                        onClick={() => setEditingPassword(true)}
                      >
                        Change it
                      </button>
                    </>
                  ) : (
                    "They enter it once in each browser."
                  )}
                </FieldDescription>
              </FieldContent>
              <Switch
                id="share-password-switch"
                checked={live.hasPassword || editingPassword}
                onCheckedChange={onPasswordSwitch}
              />
            </Field>
            {editingPassword && (
              <form onSubmit={savePassword} className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <Input
                    name="share-password"
                    aria-label={live.hasPassword ? "New Password" : "Password"}
                    placeholder={live.hasPassword ? "New password" : "Password"}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={SHARE_PASSWORD_MAX_LENGTH}
                    aria-invalid={!!passwordError}
                    autoFocus
                  />
                  <Button type="submit" disabled={pending}>
                    Save
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => onPasswordSwitch(false)}>
                    Cancel
                  </Button>
                </div>
                <FieldError>{passwordError}</FieldError>
              </form>
            )}
          </div>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="share-comments">Allow comments</FieldLabel>
              <FieldDescription>
                People with the link can select text to comment on it, and reply. They&apos;re asked for a name.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="share-comments"
              checked={live.allowComments}
              onCheckedChange={(allowComments) =>
                change(
                  { allowComments },
                  ({ id }) => updateShareAction(id, { allowComments }),
                  "Couldn't change comments. Try again.",
                )
              }
            />
          </Field>
        </>
      )}

      {share && (live || share.openComments > 0) && (
        <>
          <Separator />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                {share.openComments > 0 ? (
                  <>
                    <MessageSquareIcon data-icon="inline-start" />
                    Review {share.openComments} {share.openComments === 1 ? "Comment" : "Comments"}
                  </>
                ) : (
                  <>
                    <ExternalLinkIcon data-icon="inline-start" />
                    Open Link
                  </>
                )}
              </a>
            </Button>
            {live && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={pending}
                onClick={() => setConfirmingReset(true)}
              >
                Reset Link…
              </Button>
            )}
          </div>
          {live && confirmingReset && (
            <div role="alert" className="flex flex-col gap-3 rounded-lg border p-3">
              <p>
                The current link will stop working, for everyone who has it. Comments stay, and the password
                and settings carry over.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmingReset(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={resetLink}>
                  Reset Link
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
