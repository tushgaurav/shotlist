import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

export async function requireUser(): Promise<CurrentUser> {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const { id, name, email } = session.user;
  return { id, name, email };
}
