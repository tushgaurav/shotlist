"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/account";

import { changePasswordAction } from "../actions";
import { SettingsCard, SettingsRow } from "../settings-card";

const MISMATCH = "The new passwords don't match.";

export function PasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== form.get("confirmPassword")) {
      setError(MISMATCH);
      return;
    }

    const revokeOtherSessions = signOutOthers;
    setError(null);
    startTransition(async () => {
      const result = await changePasswordAction({
        currentPassword: String(form.get("currentPassword") ?? ""),
        newPassword,
        revokeOtherSessions,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      formElement.reset();
      toast.success(revokeOtherSessions ? "Password changed. Other devices were signed out." : "Password changed");
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <SettingsCard
        title="Password"
        description="Change the password you sign in with."
        footer={
          <>
            <div className="mr-auto flex items-center gap-2">
              <Checkbox
                id="sign-out-others"
                checked={signOutOthers}
                onCheckedChange={(checked) => setSignOutOthers(checked === true)}
              />
              <Label htmlFor="sign-out-others" className="font-normal">
                Sign out of other devices
              </Label>
            </div>
            <Button type="submit" disabled={pending} className="ml-auto">
              {pending ? "Changing…" : "Change password"}
            </Button>
          </>
        }
      >
        <SettingsRow label="Current password" htmlFor="current-password">
          <Input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
        </SettingsRow>
        <SettingsRow
          label="New password"
          description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          htmlFor="new-password"
        >
          <Input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
        </SettingsRow>
        <SettingsRow label="Confirm new password" htmlFor="confirm-password">
          <Input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            maxLength={MAX_PASSWORD_LENGTH}
            aria-invalid={error === MISMATCH ? true : undefined}
            required
          />
        </SettingsRow>
        {error && (
          <div className="px-4 py-3">
            <FieldError>{error}</FieldError>
          </div>
        )}
      </SettingsCard>
    </form>
  );
}
