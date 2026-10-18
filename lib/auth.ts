import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "./db";
import { projectTypes } from "./db/schema";
import { newId } from "./id";
import { DEFAULT_PROJECT_TYPES } from "./projects";

export const auth = betterAuth({
  appName: "Shotlist",
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    // Set DISABLE_SIGNUP=true once your own account exists, so nobody else can register.
    disableSignUp: process.env.DISABLE_SIGNUP === "true",
  },
  user: {
    // No verification emails are sent, so a new address takes effect straight away.
    changeEmail: { enabled: true, updateEmailWithoutVerification: true },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await db
            .insert(projectTypes)
            .values(DEFAULT_PROJECT_TYPES.map((type) => ({ id: newId(), ownerId: user.id, ...type })))
            .onConflictDoNothing();
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
