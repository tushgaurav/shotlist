"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 8;

function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/projects";
}

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isSignUp = mode === "sign-up";

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    setError(null);
    startTransition(async () => {
      const { error } = isSignUp
        ? await authClient.signUp.email({ name: String(form.get("name") ?? ""), email, password })
        : await authClient.signIn.email({ email, password });

      if (error) {
        setError(error.message ?? "Something went wrong. Try again.");
        return;
      }
      // A full load: the client router may hold redirects to sign-in prefetched while signed out.
      window.location.replace(nextPath());
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{isSignUp ? "Create your account" : "Sign in"}</CardTitle>
        <CardDescription>
          {isSignUp
            ? "Set up the account you'll use to plan your productions."
            : "Welcome back. Sign in to get to your projects."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            {isSignUp && (
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input id="name" name="name" autoComplete="name" required />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
                required
              />
            </Field>
            <FieldError>{error}</FieldError>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {isSignUp ? "Already have an account? " : "No account yet? "}
              <Link
                href={isSignUp ? "/sign-in" : "/sign-up"}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {isSignUp ? "Sign in" : "Create one"}
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
