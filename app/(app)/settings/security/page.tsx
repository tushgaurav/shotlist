import type { Metadata } from "next";
import { Suspense } from "react";

import { listSessions } from "@/lib/dal/account";

import { SettingsCardSkeleton } from "../settings-card";
import { PasswordForm } from "./password-form";
import { SessionList } from "./session-list";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <>
      <PasswordForm />
      <Suspense fallback={<SettingsCardSkeleton rows={2} />}>
        <SessionsLoader />
      </Suspense>
    </>
  );
}

async function SessionsLoader() {
  const sessions = await listSessions();
  return (
    <SessionList
      sessions={sessions.map(({ createdAt, ...rest }) => ({ ...rest, createdAt: createdAt.toISOString() }))}
    />
  );
}
