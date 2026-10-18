import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/** For Route Handlers, which answer 401 instead of redirecting. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;

  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** This browser's session, to tell it apart from the user's other devices. */
export async function requireSessionId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.session.id;
}
