"use client";

import { LockIcon } from "lucide-react";
import { useActionState } from "react";

import { SidebarWordmark } from "@/app/(app)/sidebar-wordmark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ShareKind } from "@/lib/share/types";

import { unlockAction, type UnlockState } from "./actions";

export function PasswordGate({ token, kind }: { token: string; kind: ShareKind }) {
  // Once the password is right, the action refreshes the page, which then shows the document.
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlockAction.bind(null, token), {});

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-16">
      <SidebarWordmark className="h-7" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
            <LockIcon className="size-5 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg">This {kind} is password protected</CardTitle>
          <CardDescription>Enter the password you were given with the link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action}>
            <FieldGroup>
              <Field data-invalid={!!state.error}>
                <FieldLabel htmlFor="share-password">Password</FieldLabel>
                <Input
                  id="share-password"
                  name="password"
                  type="password"
                  autoComplete="off"
                  required
                  autoFocus
                  aria-invalid={!!state.error}
                />
                <FieldError>{state.error}</FieldError>
              </Field>
              <Button type="submit" disabled={pending}>
                {pending ? "Checking…" : "Open"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
